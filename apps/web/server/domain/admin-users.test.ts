import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  session: vi.fn(),
  rateLimit: vi.fn(),
  transaction: vi.fn(),
  lock: vi.fn(),
  userUpdate: vi.fn(),
  profileFind: vi.fn(),
  profileUpdate: vi.fn(),
  profileUpdateMany: vi.fn(),
  lastDecision: vi.fn(),
  audit: vi.fn(),
  accessUpdateMany: vi.fn(),
  propertyFindMany: vi.fn(),
  propertyUpdate: vi.fn(),
  propertyUpdateMany: vi.fn(),
  inviteUpdateMany: vi.fn(),
  authSupersede: vi.fn(),
  authCreate: vi.fn(),
  notification: vi.fn(),
  users: vi.fn(),
}));

vi.mock("@liber/db", () => ({ prisma: { $transaction: mocks.transaction, user: { findMany: mocks.users } } }));
vi.mock("../session", async () => (await import("../session-mock.test-helper")).sessionModuleMock(mocks.session));
vi.mock("../rate-limit", () => ({ checkRateLimit: mocks.rateLimit }));
vi.mock("next/navigation", () => ({ redirect: (path: string) => { throw new Error(`redirect:${path}`); } }));

import { listUsers, reinstateUser, suspendUser } from "./admin-users";

const adminId = "11111111-1111-4111-8111-111111111111";
const userId = "22222222-2222-4222-8222-222222222222";
const tx = {
  $queryRaw: mocks.lock,
  adminAuditLog: { create: mocks.audit, findFirst: mocks.lastDecision },
  authOperation: { create: mocks.authCreate, updateMany: mocks.authSupersede },
  buyerProfile: { findUnique: mocks.profileFind, update: mocks.profileUpdate, updateMany: mocks.profileUpdateMany },
  invite: { updateMany: mocks.inviteUpdateMany },
  notification: { create: mocks.notification },
  sellerAccess: { updateMany: mocks.accessUpdateMany },
  sellerProperty: { findMany: mocks.propertyFindMany, update: mocks.propertyUpdate, updateMany: mocks.propertyUpdateMany },
  user: { update: mocks.userUpdate },
};
const property = (id: string, status: string, ownershipVerificationStatus: string, attested = true) => ({
  authorityAttestedByUserId: attested ? userId : null,
  authorityAttestedIdentityVersion: attested ? 2 : null,
  id,
  identityVersion: 2,
  ownerUserId: userId,
  ownershipVerificationStatus,
  status,
});

function expectNoAccountWrites() {
  for (const write of [mocks.userUpdate, mocks.profileUpdate, mocks.profileUpdateMany, mocks.accessUpdateMany, mocks.propertyUpdate,
    mocks.propertyUpdateMany, mocks.inviteUpdateMany, mocks.authSupersede, mocks.authCreate, mocks.notification, mocks.audit]) {
    expect(write).not.toHaveBeenCalled();
  }
}

beforeEach(() => {
  vi.resetAllMocks();
  mocks.session.mockResolvedValue({ id: adminId, roles: ["ADMIN"] });
  mocks.rateLimit.mockResolvedValue({ allowed: true, limit: 30, retryAfterSeconds: 0 });
  mocks.transaction.mockImplementation(async (callback) => callback(tx));
  mocks.accessUpdateMany.mockResolvedValue({ count: 1 });
  mocks.propertyFindMany.mockResolvedValue([]);
  mocks.profileFind.mockResolvedValue({ id: "buyer-profile-1", visibilityStatus: "SUSPENDED" });
  mocks.lastDecision.mockResolvedValue(null);
});

describe("admin users list", () => {
  const row = (index: number) => ({
    createdAt: new Date(), email: `user-${index}@example.test`, id: `00000000-0000-4000-8000-${String(index).padStart(12, "0")}`,
    name: null, roles: ["SELLER"], sellerAccess: { status: "PENDING" }, status: "ACTIVE",
  });

  it("pages users newest first with a UUID cursor", async () => {
    mocks.users.mockResolvedValue(Array.from({ length: 51 }, (_, index) => row(index)));
    const result = await listUsers(userId);
    expect(mocks.users).toHaveBeenCalledWith({
      include: { sellerAccess: { select: { status: true } } },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      cursor: { id: userId },
      skip: 1,
      take: 51,
    });
    expect(result.data).toHaveLength(50);
    expect(result.nextCursor).toBe(row(49).id);
    expect(result.data[0]).toEqual({
      id: row(0).id, isCurrentUser: false, name: "user-0@example.test", roles: ["SELLER"], sellerAccessStatus: "PENDING", status: "ACTIVE",
    });
  });

  it("has no next page on the last page and refuses a non-UUID cursor", async () => {
    mocks.users.mockResolvedValue([row(1)]);
    await expect(listUsers()).resolves.toMatchObject({ nextCursor: null });
    await expect(listUsers("cm1notauuid")).rejects.toThrow("Invalid page.");
    expect(mocks.users).toHaveBeenCalledTimes(1);
  });
});

describe("user suspension", () => {
  beforeEach(() => mocks.lock.mockResolvedValue([{ status: "ACTIVE" }]));

  it("locks the account, suspends it, keeps admin-hidden profiles hidden, and queues a fresh ban", async () => {
    await expect(suspendUser({ userId, reason: "Fraud report" })).resolves.toMatchObject({ ok: true });
    const lockSql = (mocks.lock.mock.calls[0][0] as TemplateStringsArray).join("?");
    expect(lockSql).toContain('FROM public."User"');
    expect(lockSql).toContain("FOR UPDATE");
    expect(mocks.lock.mock.invocationCallOrder[0]).toBeLessThan(mocks.userUpdate.mock.invocationCallOrder[0]);
    expect(mocks.userUpdate).toHaveBeenCalledWith({ where: { id: userId }, data: { status: "SUSPENDED", suspendedAt: expect.any(Date) } });
    expect(mocks.profileUpdateMany).toHaveBeenCalledWith({
      where: { userId, visibilityStatus: { not: "HIDDEN" } }, data: { visibilityStatus: "SUSPENDED" },
    });
    expect(mocks.authSupersede).toHaveBeenCalledWith({
      where: { userId, type: "UNBAN_USER", OR: [{ status: "PENDING" }, { status: "FAILED", attempts: { lt: 8 } }] },
      data: { completedAt: expect.any(Date), lastError: "Superseded by suspension before it ran.", nextAttemptAt: null, status: "COMPLETED" },
    });
    const ban = mocks.authCreate.mock.calls[0][0].data;
    expect(ban).toMatchObject({ status: "PENDING", type: "BAN_USER", userId });
    expect(ban.idempotencyKey).toBe(`ban-user:${userId}:${ban.id}`);
    expect(mocks.audit).toHaveBeenCalledWith({
      data: expect.objectContaining({ action: "suspend_user", metadata: { authOperationId: ban.id, reason: "Fraud report" }, targetId: userId }),
    });
  });

  it("makes repeating a suspension a no-op instead of a second ban", async () => {
    mocks.lock.mockResolvedValue([{ status: "SUSPENDED" }]);
    await expect(suspendUser({ userId })).resolves.toMatchObject({ ok: true, message: expect.stringContaining("already suspended") });
    expectNoAccountWrites();
  });

  it("validates the target and the moderation budget before opening a transaction", async () => {
    await expect(suspendUser({ userId: "not-a-uuid" })).resolves.toMatchObject({ ok: false });
    mocks.rateLimit.mockResolvedValue({ allowed: false, limit: 30, retryAfterSeconds: 60 });
    await expect(suspendUser({ userId })).resolves.toMatchObject({ ok: false, message: expect.stringContaining("limit") });
    expect(mocks.transaction).not.toHaveBeenCalled();
  });
});

describe("user reinstatement", () => {
  beforeEach(() => mocks.lock.mockResolvedValue([{ status: "SUSPENDED" }]));

  it("is admin-only", async () => {
    mocks.session.mockResolvedValue({ id: userId, roles: ["SELLER"] });
    await expect(reinstateUser({ userId })).rejects.toThrow("redirect:/seller/properties");
    expect(mocks.transaction).not.toHaveBeenCalled();
  });

  it("reactivates the account, queues the unban, and sends nothing back to a live state that needs review", async () => {
    mocks.propertyFindMany.mockResolvedValue([
      property("approved-archived", "ARCHIVED", "APPROVED"),
      property("stale-attestation", "ARCHIVED", "APPROVED", false),
      property("pending-archived", "ARCHIVED", "PENDING"),
      property("rejected-archived", "ARCHIVED", "REJECTED"),
      property("edited-after-suspension", "DRAFT", "NOT_SUBMITTED"),
    ]);
    const form = new FormData();
    form.set("userId", userId);
    form.set("reason", "Appeal accepted");
    await expect(reinstateUser(form)).resolves.toMatchObject({ ok: true, message: expect.stringContaining("reinstated") });

    expect(mocks.userUpdate).toHaveBeenCalledWith({ where: { id: userId }, data: { status: "ACTIVE", suspendedAt: null } });
    // Lock order: account, buyer profile, seller access, then properties.
    const [accountLock, profileLock, propertyLock] = mocks.lock.mock.calls.map((call) => (call[0] as TemplateStringsArray).join("?"));
    expect(accountLock).toContain('FROM public."User"');
    expect(profileLock).toContain('FROM public."BuyerProfile"');
    expect(profileLock).toContain("FOR UPDATE");
    expect(propertyLock).toContain('FROM public."SellerProperty"');
    expect(propertyLock).toContain("FOR UPDATE");
    expect(mocks.lock.mock.invocationCallOrder[1]).toBeLessThan(mocks.profileFind.mock.invocationCallOrder[0]);
    expect(mocks.accessUpdateMany.mock.invocationCallOrder[0]).toBeLessThan(mocks.lock.mock.invocationCallOrder[2]);
    expect(mocks.lock.mock.invocationCallOrder[2]).toBeLessThan(mocks.propertyFindMany.mock.invocationCallOrder[0]);
    expect(mocks.profileUpdate).toHaveBeenCalledWith({ where: { id: "buyer-profile-1" }, data: { visibilityStatus: "DRAFT" } });
    expect(mocks.accessUpdateMany).toHaveBeenCalledWith({ where: { userId, status: "SUSPENDED" }, data: { status: "PENDING" } });
    expect(mocks.propertyFindMany).toHaveBeenCalledWith(expect.objectContaining({ where: { ownerUserId: userId, flaggedForReviewAt: { not: null } } }));
    const restored = Object.fromEntries(mocks.propertyUpdate.mock.calls.map(([call]) => [call.where.id, call.data]));
    expect(restored).toEqual({
      "approved-archived": { flaggedForReviewAt: null, status: "READY_FOR_INVITES" },
      "stale-attestation": { flaggedForReviewAt: null, status: "DRAFT" },
      "pending-archived": { flaggedForReviewAt: null, status: "READY_FOR_REVIEW" },
      "rejected-archived": { flaggedForReviewAt: null, status: "DRAFT" },
      "edited-after-suspension": { flaggedForReviewAt: null, status: "DRAFT" },
    });
    expect(mocks.inviteUpdateMany).not.toHaveBeenCalled();

    expect(mocks.authSupersede).toHaveBeenCalledWith(expect.objectContaining({
      where: { userId, type: "BAN_USER", OR: [{ status: "PENDING" }, { status: "FAILED", attempts: { lt: 8 } }] },
      data: expect.objectContaining({ lastError: "Superseded by reinstatement before it ran.", status: "COMPLETED" }),
    }));
    const unban = mocks.authCreate.mock.calls[0][0].data;
    expect(unban).toMatchObject({ status: "PENDING", type: "UNBAN_USER", userId });
    expect(unban.idempotencyKey).toBe(`unban-user:${userId}:${unban.id}`);
    expect(mocks.authSupersede.mock.invocationCallOrder[0]).toBeLessThan(mocks.authCreate.mock.invocationCallOrder[0]);

    expect(mocks.notification).toHaveBeenCalledWith({
      data: {
        body: "Your Liber account is active again. Republish your buyer profile when you’re ready. Seller directory access needs a new admin review.",
        metadata: { buyerProfileVisibility: "DRAFT", sellerAccessStatus: "PENDING" },
        title: "Account reinstated",
        type: "account_reinstated",
        userId,
      },
    });
    expect(mocks.audit).toHaveBeenCalledWith({
      data: {
        action: "reinstate_user",
        actorUserId: adminId,
        metadata: {
          authOperationId: unban.id,
          buyerProfileVisibility: "DRAFT",
          reason: "Appeal accepted",
          restoredPropertyIds: ["approved-archived", "stale-attestation", "pending-archived", "rejected-archived", "edited-after-suspension"],
          sellerAccessStatus: "PENDING",
        },
        targetId: userId,
        targetType: "user",
      },
    });
  });

  it("keeps a profile hidden when the last admin decision before suspension was a hide", async () => {
    mocks.lastDecision.mockResolvedValue({ action: "hide_buyer_profile" });
    await reinstateUser({ userId });
    expect(mocks.lastDecision).toHaveBeenCalledWith(expect.objectContaining({
      where: { action: { in: ["hide_buyer_profile", "unhide_buyer_profile"] }, targetId: "buyer-profile-1", targetType: "buyer_profile" },
    }));
    expect(mocks.profileUpdate).toHaveBeenCalledWith({ where: { id: "buyer-profile-1" }, data: { visibilityStatus: "HIDDEN" } });
  });

  it("leaves a profile that suspension did not touch alone", async () => {
    mocks.profileFind.mockResolvedValue({ id: "buyer-profile-1", visibilityStatus: "HIDDEN" });
    mocks.accessUpdateMany.mockResolvedValue({ count: 0 });
    await reinstateUser({ userId });
    expect(mocks.profileUpdate).not.toHaveBeenCalled();
    expect(mocks.notification).toHaveBeenCalledWith({
      data: expect.objectContaining({ body: "Your Liber account is active again.", metadata: { buyerProfileVisibility: null, sellerAccessStatus: null } }),
    });
  });

  it("makes reinstating an active account a no-op", async () => {
    mocks.lock.mockResolvedValue([{ status: "ACTIVE" }]);
    await expect(reinstateUser({ userId })).resolves.toMatchObject({ ok: true, message: expect.stringContaining("already active") });
    expectNoAccountWrites();
  });

  it("reports a user that no longer exists", async () => {
    mocks.lock.mockResolvedValue([]);
    await expect(reinstateUser({ userId })).resolves.toMatchObject({ ok: false });
    expectNoAccountWrites();
  });
});
