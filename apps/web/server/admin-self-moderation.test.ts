import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  session: vi.fn(), rateLimit: vi.fn(), transaction: vi.fn(),
  user: vi.fn(), buyer: vi.fn(), seller: vi.fn(), property: vi.fn(), invite: vi.fn(), auth: vi.fn(), audit: vi.fn(),
}));
vi.mock("@liber/db", () => ({ prisma: { $transaction: mocks.transaction }, Prisma: {} }));
vi.mock("./session", async () => (await import("./session-mock.test-helper")).sessionModuleMock(mocks.session));
vi.mock("./rate-limit", () => ({ assertRateLimit: mocks.rateLimit, checkRateLimit: vi.fn() }));
vi.mock("next/navigation", () => ({ redirect: (path: string) => { throw new Error(`redirect:${path}`); } }));

import { suspendUser } from "./contracts";

const adminId = "11111111-1111-4111-8111-111111111111";

describe("admin self-moderation", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.session.mockResolvedValue({ id: adminId, roles: ["ADMIN", "SELLER"] });
    mocks.transaction.mockImplementation(async (callback) => callback({
      user: { update: mocks.user }, buyerProfile: { updateMany: mocks.buyer },
      sellerAccess: { updateMany: mocks.seller }, sellerProperty: { updateMany: mocks.property },
      invite: { updateMany: mocks.invite }, authOperation: { upsert: mocks.auth },
      adminAuditLog: { create: mocks.audit },
    }));
  });

  it("allows an admin to suspend their own account through the normal audited lifecycle", async () => {
    await expect(suspendUser({ userId: adminId })).resolves.toMatchObject({ ok: true });
    expect(mocks.user).toHaveBeenCalledWith(expect.objectContaining({ where: { id: adminId }, data: expect.objectContaining({ status: "SUSPENDED" }) }));
    expect(mocks.seller).toHaveBeenCalledWith({ where: { userId: adminId }, data: { status: "SUSPENDED" } });
    expect(mocks.property).toHaveBeenCalledWith(expect.objectContaining({ where: { ownerUserId: adminId } }));
    expect(mocks.auth).toHaveBeenCalledWith(expect.objectContaining({ create: expect.objectContaining({ type: "BAN_USER", userId: adminId }) }));
    expect(mocks.audit).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ action: "suspend_user", actorUserId: adminId, targetId: adminId }) }));
  });

  it("still denies the moderation action to a non-admin", async () => {
    mocks.session.mockResolvedValue({ id: adminId, roles: ["SELLER"] });
    await expect(suspendUser({ userId: adminId })).rejects.toThrow("redirect:/seller/");
    expect(mocks.transaction).not.toHaveBeenCalled();
  });
});
