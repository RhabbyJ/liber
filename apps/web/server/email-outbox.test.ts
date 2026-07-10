import { beforeEach, describe, expect, it, vi } from "vitest";

const db = vi.hoisted(() => ({
  findUser: vi.fn(),
  queryRaw: vi.fn(),
  sendInvite: vi.fn(),
  updateMany: vi.fn(),
}));

vi.mock("@liber/db", () => ({
  prisma: {
    $queryRaw: db.queryRaw,
    emailOutbox: { updateMany: db.updateMany },
    user: { findUnique: db.findUser },
  },
}));

vi.mock("./email", () => ({ sendInviteEmail: db.sendInvite }));

import { processEmailOutbox } from "./email-outbox";

const leaseToken = "22222222-2222-4222-8222-222222222222";
const claimedJob = {
  attempts: 2,
  id: "outbox-job",
  leaseToken,
  payload: {
    buyerName: "Buyer",
    message: "Review this home",
    propertyTitle: "Home",
    title: "Invitation",
    to: "stale-address@example.test",
  },
  recipientUserId: "11111111-1111-4111-8111-111111111111",
  type: "INVITE",
};

describe("email outbox leasing", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    db.queryRaw.mockResolvedValue([claimedJob]);
    db.findUser.mockResolvedValue({ email: "current-address@example.test", status: "ACTIVE" });
    db.sendInvite.mockResolvedValue({ provider: "resend", queued: true });
    db.updateMany.mockResolvedValue({ count: 1 });
  });

  it("claims in SQL and completes only the matching lease token", async () => {
    await expect(processEmailOutbox(1000)).resolves.toEqual({
      failed: 0,
      processed: 1,
      sent: 1,
    });

    const sql = db.queryRaw.mock.calls[0]?.[0]?.join("") ?? "";
    const values = db.queryRaw.mock.calls[0]?.slice(1) ?? [];
    expect(sql).toContain("app_private.claim_email_outbox");
    expect(values).toContain(100);
    expect(db.sendInvite).toHaveBeenCalledWith(
      expect.objectContaining({ to: "current-address@example.test" }),
      { idempotencyKey: `invite/${claimedJob.id}` },
    );
    expect(db.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ leaseToken, status: "SENDING" }),
        data: expect.objectContaining({ leaseToken: null, status: "SENT" }),
      }),
    );
  });

  it("fails closed and cancels a claimed legacy job without a recipient identity", async () => {
    db.queryRaw.mockResolvedValue([{ ...claimedJob, recipientUserId: null }]);

    await expect(processEmailOutbox()).resolves.toEqual({
      failed: 1,
      processed: 1,
      sent: 0,
    });

    expect(db.findUser).not.toHaveBeenCalled();
    expect(db.sendInvite).not.toHaveBeenCalled();
    expect(db.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ leaseToken, status: "SENDING" }),
        data: expect.objectContaining({
          cancelledAt: expect.any(Date),
          lastError: "RECIPIENT_REQUIRED",
          leaseToken: null,
          status: "FAILED",
        }),
      }),
    );
  });

  it("cancels instead of sending when the immutable recipient is missing or inactive", async () => {
    db.findUser.mockResolvedValue(null);

    await expect(processEmailOutbox()).resolves.toEqual({
      failed: 1,
      processed: 1,
      sent: 0,
    });

    expect(db.sendInvite).not.toHaveBeenCalled();
    expect(db.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          cancelledAt: expect.any(Date),
          lastError: "ACCOUNT_INACTIVE",
          status: "FAILED",
        }),
      }),
    );
  });

  it("releases a reclaimed expired lease after failure without touching another worker's claim", async () => {
    db.sendInvite.mockRejectedValue(new Error("provider unavailable"));

    await expect(processEmailOutbox()).resolves.toEqual({
      failed: 1,
      processed: 1,
      sent: 0,
    });

    expect(db.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: claimedJob.id, leaseToken, status: "SENDING" },
        data: expect.objectContaining({
          lastError: "provider unavailable",
          leaseExpiresAt: null,
          leaseToken: null,
          status: "FAILED",
        }),
      }),
    );
  });
});
