import { beforeEach, describe, expect, it, vi } from "vitest";

const db = vi.hoisted(() => ({
  auditCreate: vi.fn(),
  queryRaw: vi.fn(),
  updateUserById: vi.fn(),
}));

vi.mock("@liber/db", () => ({
  prisma: {
    $queryRaw: db.queryRaw,
    adminAuditLog: { create: db.auditCreate },
  },
}));

vi.mock("./supabase", () => ({
  createSupabaseAdminClient: () => ({
    auth: { admin: { updateUserById: db.updateUserById } },
  }),
}));

import { suspendApplicationIdentity } from "./account-security";

const result = {
  buyer_profiles_suspended: 1,
  outbox_jobs_cancelled: 2,
  seller_access_suspended: 1,
  sessions_revoked: 3,
};

describe("account suspension", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    db.queryRaw.mockResolvedValue([result]);
    db.updateUserById.mockResolvedValue({
      data: { user: { banned_until: "2126-01-01T00:00:00.000Z" } },
      error: null,
    });
    db.auditCreate.mockResolvedValue({});
  });

  it("runs the atomic database suspension before confirming the Auth ban", async () => {
    await expect(
      suspendApplicationIdentity({
        actorUserId: "11111111-1111-4111-8111-111111111111",
        reason: "Launch security test",
        targetUserId: "22222222-2222-4222-8222-222222222222",
      }),
    ).resolves.toEqual(result);

    expect(db.queryRaw.mock.invocationCallOrder[0]).toBeLessThan(db.updateUserById.mock.invocationCallOrder[0]);
    expect(db.updateUserById).toHaveBeenCalledWith(
      "22222222-2222-4222-8222-222222222222",
      { ban_duration: "876000h" },
    );
    expect(db.auditCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ action: "suspend_user_auth_ban_confirmed" }),
      }),
    );
  });

  it("keeps the database suspension and audits an Auth ban failure for retry", async () => {
    db.updateUserById.mockResolvedValue({ data: { user: null }, error: { message: "Auth unavailable" } });

    await expect(
      suspendApplicationIdentity({
        actorUserId: "11111111-1111-4111-8111-111111111111",
        reason: "Launch security test",
        targetUserId: "22222222-2222-4222-8222-222222222222",
      }),
    ).rejects.toThrow("Auth ban must be retried");
    expect(db.auditCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ action: "suspend_user_auth_ban_failed" }),
      }),
    );
  });
});
