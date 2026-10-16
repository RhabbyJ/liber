import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  session: vi.fn(),
  rateLimit: vi.fn(),
  transaction: vi.fn(),
  findInvite: vi.fn(),
  pairLock: vi.fn(),
  lockRow: vi.fn(),
  updateMany: vi.fn(),
  notification: vi.fn(),
  audit: vi.fn(),
}));

vi.mock("@liber/db", () => ({ prisma: { $transaction: mocks.transaction } }));
vi.mock("../session", async () => (await import("../session-mock.test-helper")).sessionModuleMock(mocks.session));
vi.mock("../rate-limit", () => ({ checkRateLimit: mocks.rateLimit }));
vi.mock("../messaging/service", () => ({ lockAndAssertInvitePairAvailable: mocks.pairLock }));
vi.mock("next/navigation", () => ({ redirect: (path: string) => { throw new Error(`redirect:${path}`); } }));

import { withdrawInviteAsAdmin } from "./admin-moderation";

const adminId = "11111111-1111-4111-8111-111111111111";
const buyerId = "10000000-0000-4000-8000-000000000001";
const sellerId = "10000000-0000-4000-8000-000000000002";
const inviteId = "synthetic-invite";
const tx = {
  $queryRaw: mocks.lockRow,
  adminAuditLog: { create: mocks.audit },
  invite: { findFirst: mocks.findInvite, updateMany: mocks.updateMany },
  notification: { create: mocks.notification },
};

describe("admin invite withdrawal", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.session.mockResolvedValue({ id: adminId, roles: ["ADMIN"] });
    mocks.rateLimit.mockResolvedValue({ allowed: true, limit: 30, retryAfterSeconds: 0 });
    mocks.transaction.mockImplementation(async (callback) => callback(tx));
    mocks.findInvite.mockResolvedValue({
      buyerProfile: { userId: buyerId }, buyerProfileId: "synthetic-profile", id: inviteId, propertyId: "synthetic-property", sellerId,
    });
    mocks.lockRow.mockResolvedValue([{ status: "SENT" }]);
    mocks.updateMany.mockResolvedValue({ count: 1 });
  });

  it("is admin-only and requires an audit reason within the moderation budget", async () => {
    mocks.session.mockResolvedValue({ id: sellerId, roles: ["SELLER"] });
    await expect(withdrawInviteAsAdmin({ inviteId, reason: "Spam" })).rejects.toThrow("redirect:/seller/properties");
    mocks.session.mockResolvedValue({ id: adminId, roles: ["ADMIN"] });
    await expect(withdrawInviteAsAdmin({ inviteId, reason: "   " })).resolves.toMatchObject({ ok: false });
    await expect(withdrawInviteAsAdmin({ inviteId, reason: "x".repeat(501) })).resolves.toMatchObject({ ok: false });
    mocks.rateLimit.mockResolvedValue({ allowed: false, limit: 30, retryAfterSeconds: 60 });
    await expect(withdrawInviteAsAdmin({ inviteId, reason: "Spam" })).resolves.toMatchObject({ ok: false, message: expect.stringContaining("limit") });
    expect(mocks.rateLimit).toHaveBeenCalledWith(`admin-moderation:${adminId}`, 30, 3_600_000);
    expect(mocks.transaction).not.toHaveBeenCalled();
  });

  it("withdraws any seller's open invite, notifies both participants, and audits the reason", async () => {
    await expect(withdrawInviteAsAdmin({ inviteId, reason: "Bulk outreach" })).resolves.toEqual({
      ok: true,
      message: "Invite withdrawn. Both participants were notified and the conversation is now read-only.",
    });
    expect(mocks.findInvite).toHaveBeenCalledWith(expect.objectContaining({ where: { id: inviteId } }));
    expect(mocks.pairLock).toHaveBeenCalledWith(tx, sellerId, buyerId);
    expect(mocks.updateMany).toHaveBeenCalledWith(expect.objectContaining({ data: { status: "WITHDRAWN" } }));
    expect(mocks.notification).toHaveBeenCalledWith({ data: expect.objectContaining({ type: "invite_withdrawn", userId: buyerId }) });
    expect(mocks.notification).toHaveBeenCalledWith({
      data: expect.objectContaining({
        metadata: { buyerProfileId: "synthetic-profile", inviteId, propertyId: "synthetic-property" },
        type: "invite_withdrawn",
        userId: sellerId,
      }),
    });
    expect(mocks.audit).toHaveBeenCalledWith({
      data: {
        action: "admin_withdraw_invite",
        actorUserId: adminId,
        metadata: {
          buyerProfileId: "synthetic-profile", previousStatus: "SENT", propertyId: "synthetic-property", reason: "Bulk outreach", sellerId,
        },
        targetId: inviteId,
        targetType: "invite",
      },
    });
    expect(JSON.stringify(mocks.notification.mock.calls)).not.toContain("Bulk outreach");
  });

  it("leaves closed invites untouched", async () => {
    mocks.lockRow.mockResolvedValue([{ status: "DECLINED" }]);
    mocks.updateMany.mockResolvedValue({ count: 0 });
    await expect(withdrawInviteAsAdmin({ inviteId, reason: "Spam" })).resolves.toMatchObject({ ok: false });
    expect(mocks.notification).not.toHaveBeenCalled();
    expect(mocks.audit).not.toHaveBeenCalled();
  });
});
