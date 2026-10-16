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
  lastAudit: vi.fn(),
  profileUpdate: vi.fn(),
  profileFields: vi.fn(),
  owner: vi.fn(),
  invites: vi.fn(),
  syntheticMarkers: vi.fn(),
}));

vi.mock("@liber/db", () => ({
  prisma: {
    $transaction: mocks.transaction,
    adminAuditLog: { findMany: mocks.syntheticMarkers },
    invite: { findMany: mocks.invites },
  },
}));
vi.mock("../session", async () => (await import("../session-mock.test-helper")).sessionModuleMock(mocks.session));
vi.mock("../rate-limit", () => ({ checkRateLimit: mocks.rateLimit }));
vi.mock("../messaging/service", () => ({ lockAndAssertInvitePairAvailable: mocks.pairLock }));
vi.mock("next/navigation", () => ({ redirect: (path: string) => { throw new Error(`redirect:${path}`); } }));

import { hideBuyerProfile, listAdminInvites, unhideBuyerProfile, withdrawInviteAsAdmin } from "./admin-moderation";

const adminId = "11111111-1111-4111-8111-111111111111";
const buyerId = "10000000-0000-4000-8000-000000000001";
const sellerId = "10000000-0000-4000-8000-000000000002";
const inviteId = "synthetic-invite";
const tx = {
  $queryRaw: mocks.lockRow,
  adminAuditLog: { create: mocks.audit, findFirst: mocks.lastAudit },
  buyerProfile: { findUnique: mocks.profileFields, update: mocks.profileUpdate },
  invite: { findFirst: mocks.findInvite, updateMany: mocks.updateMany },
  notification: { create: mocks.notification },
  user: { findUnique: mocks.owner },
};
const sql = (call: unknown[]) => (call[0] as TemplateStringsArray).join("?");

describe("admin invite list", () => {
  const invite = (index: number) => ({
    buyerProfile: { displayName: "Synthetic", userId: buyerId, user: { name: "Synthetic Buyer" } },
    buyerProfileId: "synthetic-profile",
    conversation: { messages: [] },
    expiresAt: new Date(Date.now() + 86_400_000),
    id: `invite-${String(index).padStart(2, "0")}`,
    message: "Synthetic opening",
    property: { addressLine1: "123 Example St", city: "Los Angeles", identityVersion: 1, ownershipVerificationStatus: "APPROVED", propertyType: "HOME" },
    propertyId: "synthetic-property",
    propertyIdentityVersion: 1,
    sellerId,
    sentAt: new Date("2026-10-12T17:00:00Z"),
    status: index === 0 ? "WITHDRAWN" : "SENT",
    title: "Property invitation",
  });

  beforeEach(() => {
    vi.resetAllMocks();
    mocks.session.mockResolvedValue({ id: adminId, roles: ["ADMIN"] });
    mocks.syntheticMarkers.mockResolvedValue([]);
  });

  it("pages invites newest first by cursor", async () => {
    mocks.invites.mockResolvedValue(Array.from({ length: 51 }, (_, index) => invite(index)));
    const result = await listAdminInvites("invite-cursor");
    expect(mocks.invites).toHaveBeenCalledWith(expect.objectContaining({
      orderBy: [{ sentAt: "desc" }, { id: "desc" }],
      cursor: { id: "invite-cursor" },
      skip: 1,
      take: 51,
    }));
    expect(result.data).toHaveLength(50);
    expect(result.nextCursor).toBe("invite-49");
    expect(result.data[0].status).toBe("Withdrawn");
  });

  it("refuses a malformed cursor", async () => {
    await expect(listAdminInvites("invite cursor")).rejects.toThrow("Invalid page.");
    expect(mocks.invites).not.toHaveBeenCalled();
  });
});

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

describe("admin buyer profile hide and unhide", () => {
  const buyerProfileId = "buyer-profile-1";
  const publishable = {
    budgetMax: 900000, budgetMin: 700000, buyerType: "Cash", buyingPurpose: "House", criteria: [{ id: "criteria-1" }],
    desiredServiceAreas: [{ isPrimary: true, source: "SELECTED", serviceArea: { active: true, market: { active: true } } }],
  };

  beforeEach(() => {
    vi.resetAllMocks();
    mocks.session.mockResolvedValue({ id: adminId, roles: ["ADMIN"] });
    mocks.rateLimit.mockResolvedValue({ allowed: true, limit: 30, retryAfterSeconds: 0 });
    mocks.transaction.mockImplementation(async (callback) => callback(tx));
    mocks.owner.mockResolvedValue({ status: "ACTIVE" });
    mocks.profileFields.mockResolvedValue(publishable);
    mocks.lastAudit.mockResolvedValue({ metadata: { previousVisibility: "ACTIVE", reason: "Investigating" } });
  });

  it("hides a profile under its row lock and audits the visibility it replaced", async () => {
    mocks.lockRow.mockResolvedValue([{ visibility: "ACTIVE" }]);
    await expect(hideBuyerProfile({ buyerProfileId, reason: "Investigating" })).resolves.toMatchObject({ ok: true });
    expect(sql(mocks.lockRow.mock.calls[0])).toContain('FROM public."BuyerProfile"');
    expect(sql(mocks.lockRow.mock.calls[0])).toContain("FOR UPDATE");
    expect(mocks.profileUpdate).toHaveBeenCalledWith({ where: { id: buyerProfileId }, data: { visibilityStatus: "HIDDEN" } });
    expect(mocks.audit).toHaveBeenCalledWith({
      data: {
        action: "hide_buyer_profile",
        actorUserId: adminId,
        metadata: { previousVisibility: "ACTIVE", reason: "Investigating" },
        targetId: buyerProfileId,
        targetType: "buyer_profile",
      },
    });
  });

  it("makes hiding a hidden profile a no-op and reports missing profiles", async () => {
    mocks.lockRow.mockResolvedValue([{ visibility: "HIDDEN" }]);
    await expect(hideBuyerProfile({ buyerProfileId })).resolves.toMatchObject({ ok: true, message: expect.stringContaining("already hidden") });
    mocks.lockRow.mockResolvedValue([]);
    await expect(hideBuyerProfile({ buyerProfileId })).resolves.toMatchObject({ ok: false });
    expect(mocks.profileUpdate).not.toHaveBeenCalled();
    expect(mocks.audit).not.toHaveBeenCalled();
  });

  function stageUnhide({ ownerStatus = "ACTIVE", visibility = "HIDDEN", fields = publishable as object } = {}) {
    mocks.profileFields.mockImplementation(async ({ select }: { select: Record<string, unknown> }) => (select.userId ? { userId: buyerId } : fields));
    mocks.lockRow.mockImplementation(async (strings: TemplateStringsArray) => (
      strings.join("?").includes('FROM public."User"') ? [{ status: ownerStatus }] : [{ visibility }]
    ));
  }

  it("restores a profile that was live when hidden and still meets the publication rules", async () => {
    stageUnhide();
    await expect(unhideBuyerProfile({ buyerProfileId, reason: "Cleared" })).resolves.toMatchObject({ ok: true, message: expect.stringContaining("live") });
    const [ownerLock, profileLock] = mocks.lockRow.mock.calls.map((call) => sql(call));
    expect(ownerLock).toContain('FROM public."User"');
    expect(ownerLock).toContain("FOR SHARE");
    expect(profileLock).toContain('FROM public."BuyerProfile"');
    expect(profileLock).toContain("FOR UPDATE");
    expect(mocks.lastAudit).toHaveBeenCalledWith(expect.objectContaining({
      where: { action: "hide_buyer_profile", targetId: buyerProfileId, targetType: "buyer_profile" },
    }));
    expect(mocks.profileUpdate).toHaveBeenCalledWith({ where: { id: buyerProfileId }, data: { visibilityStatus: "ACTIVE" } });
    expect(mocks.notification).toHaveBeenCalledWith({ data: expect.objectContaining({ type: "buyer_profile_unhidden", userId: buyerId }) });
    expect(mocks.audit).toHaveBeenCalledWith({
      data: expect.objectContaining({ action: "unhide_buyer_profile", metadata: { reason: "Cleared", restoredVisibility: "ACTIVE" } }),
    });
  });

  it.each([
    ["was a draft when hidden", { metadata: { previousVisibility: "DRAFT" } }, publishable],
    ["predates visibility auditing", { metadata: { reason: "Old hide" } }, publishable],
    ["no longer meets the publication rules", { metadata: { previousVisibility: "ACTIVE" } }, { ...publishable, criteria: [] }],
  ])("returns a profile that %s to the buyer as a draft", async (_case, lastHide, fields) => {
    stageUnhide({ fields });
    mocks.lastAudit.mockResolvedValue(lastHide);
    await expect(unhideBuyerProfile({ buyerProfileId })).resolves.toMatchObject({ ok: true, message: expect.stringContaining("draft") });
    expect(mocks.profileUpdate).toHaveBeenCalledWith({ where: { id: buyerProfileId }, data: { visibilityStatus: "DRAFT" } });
  });

  it("refuses to unhide a suspended account's profile and ignores profiles that are not hidden", async () => {
    stageUnhide({ ownerStatus: "SUSPENDED" });
    await expect(unhideBuyerProfile({ buyerProfileId })).resolves.toMatchObject({ ok: false, message: expect.stringContaining("Reinstate") });
    stageUnhide({ visibility: "ACTIVE" });
    await expect(unhideBuyerProfile({ buyerProfileId })).resolves.toMatchObject({ ok: true, message: expect.stringContaining("isn’t hidden") });
    mocks.profileFields.mockResolvedValue(null);
    await expect(unhideBuyerProfile({ buyerProfileId })).resolves.toMatchObject({ ok: false, message: expect.stringContaining("no longer available") });
    expect(mocks.profileUpdate).not.toHaveBeenCalled();
    expect(mocks.notification).not.toHaveBeenCalled();
    expect(mocks.audit).not.toHaveBeenCalled();
  });

  it("keeps both controls admin-only and inside the moderation budget", async () => {
    mocks.session.mockResolvedValue({ id: buyerId, roles: ["BUYER"] });
    await expect(hideBuyerProfile({ buyerProfileId })).rejects.toThrow("redirect:/buyer/profile");
    await expect(unhideBuyerProfile({ buyerProfileId })).rejects.toThrow("redirect:/buyer/profile");
    mocks.session.mockResolvedValue({ id: adminId, roles: ["ADMIN"] });
    mocks.rateLimit.mockResolvedValue({ allowed: false, limit: 30, retryAfterSeconds: 60 });
    await expect(hideBuyerProfile({ buyerProfileId })).resolves.toMatchObject({ ok: false });
    await expect(unhideBuyerProfile({ buyerProfileId })).resolves.toMatchObject({ ok: false });
    expect(mocks.transaction).not.toHaveBeenCalled();
  });
});
