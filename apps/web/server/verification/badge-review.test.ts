import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getSessionUser: vi.fn(), assertRateLimit: vi.fn(), transaction: vi.fn(), buyer: vi.fn(), evidence: vi.fn(),
  upsert: vi.fn(), revoke: vi.fn(), notification: vi.fn(), audit: vi.fn(),
}));
vi.mock("@liber/db", async () => ({
  Prisma: (await import("../../../../packages/db/src/generated/client")).Prisma,
  prisma: { $transaction: mocks.transaction },
}));
vi.mock("../session", async () => (await import("../session-mock.test-helper")).sessionModuleMock(mocks.getSessionUser));
vi.mock("../rate-limit", () => ({ assertRateLimit: mocks.assertRateLimit }));
vi.mock("next/navigation", () => ({ redirect: (path: string) => { throw new Error(`redirect:${path}`); } }));

import { grantBadge, revokeBadge } from "../contracts";

const adminId = "11111111-1111-4111-8111-111111111111";
const buyerId = "buyer-fixture";
const documentId = "document-fixture";
const grant = { buyerProfileId: buyerId, badgeType: "PRE_APPROVED", evidenceDocumentId: documentId };
const document = {
  id: documentId, buyerProfileId: buyerId, documentType: "PRE_APPROVAL", reviewStatus: "APPROVED",
  fileSha256: null, storagePath: "private-fixture-path",
};
const tx = {
  buyerProfile: { findUnique: mocks.buyer }, verificationDocument: { findFirst: mocks.evidence },
  buyerBadge: { upsert: mocks.upsert, update: mocks.revoke },
  notification: { create: mocks.notification }, adminAuditLog: { create: mocks.audit },
};

function expectNoWrites() {
  expect(mocks.upsert).not.toHaveBeenCalled();
  expect(mocks.revoke).not.toHaveBeenCalled();
  expect(mocks.notification).not.toHaveBeenCalled();
  expect(mocks.audit).not.toHaveBeenCalled();
}

describe("admin badge evidence contract", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.getSessionUser.mockResolvedValue({ id: adminId, roles: ["ADMIN", "BUYER"] });
    mocks.buyer.mockResolvedValue({ userId: adminId });
    mocks.evidence.mockResolvedValue(document);
    mocks.transaction.mockImplementation(async (callback) => callback(tx));
    mocks.upsert.mockImplementation(async ({ create }) => ({ id: "badge-fixture", ...create, expiresAt: create.expiresAt ?? null }));
    mocks.revoke.mockResolvedValue({ id: "badge-fixture", badgeType: "PRE_APPROVED", buyerProfile: { userId: adminId } });
  });

  it.each([
    ["PRE_APPROVED", "PRE_APPROVAL"], ["VERIFIED_FUNDS", "VERIFIED_FUNDS"], ["VERIFIED_IDENTITY", "IDENTITY"],
  ])("lets an admin grant their own %s badge using approved %s evidence", async (badgeType, documentType) => {
    mocks.evidence.mockResolvedValue({ ...document, documentType });
    const result = await grantBadge({ ...grant, badgeType });
    expect(result).toMatchObject({ ok: true, data: { type: badgeType, status: "active" } });
    expect(mocks.evidence).toHaveBeenCalledWith(expect.objectContaining({
      where: { buyerProfileId: buyerId, id: documentId, reviewStatus: "APPROVED" },
    }));
    expect(mocks.upsert).toHaveBeenCalledWith(expect.objectContaining({
      create: expect.objectContaining({ grantedByUserId: adminId, evidenceDocumentId: documentId, source: "ADMIN_REVIEWED_DOCUMENT" }),
    }));
    expect(mocks.audit).toHaveBeenCalledWith({ data: expect.objectContaining({
      actorUserId: adminId, targetId: buyerId,
      metadata: { badgeType, evidenceDocumentId: documentId, evidenceDocumentType: documentType, evidenceFileSha256: null },
    }) });
    expect(mocks.notification).toHaveBeenCalledWith({ data: expect.objectContaining({ userId: adminId }) });
    expect(JSON.stringify(result)).not.toContain(document.storagePath);
  });

  it("rejects the original blank-evidence form without issuing a badge", async () => {
    const form = new FormData();
    form.set("buyerProfileId", buyerId);
    form.set("badgeType", "PRE_APPROVED");
    form.set("evidenceDocumentId", "");
    await expect(grantBadge(form)).rejects.toThrow("This badge requires approved document evidence.");
    expect(mocks.evidence).not.toHaveBeenCalled();
    expectNoWrites();
  });

  it.each(["VERIFIED_FUNDS", "IDENTITY", "OTHER"])("rejects %s evidence for a pre-approval badge", async (documentType) => {
    mocks.evidence.mockResolvedValue({ ...document, documentType });
    await expect(grantBadge(grant)).rejects.toThrow("not compatible");
    expectNoWrites();
  });

  it.each([
    { buyerProfileId: "another-buyer", reviewStatus: "APPROVED" },
    { buyerProfileId: buyerId, reviewStatus: "PENDING" },
    { buyerProfileId: buyerId, reviewStatus: "REJECTED" },
  ])("rejects unavailable or unapproved evidence (%j)", async (evidence) => {
    mocks.evidence.mockImplementation(async ({ where }) => {
      return where.buyerProfileId === evidence.buyerProfileId && where.reviewStatus === evidence.reviewStatus
        ? { ...document, ...evidence } : null;
    });
    await expect(grantBadge(grant)).rejects.toThrow("approved document for this buyer");
    expectNoWrites();
  });

  it("rejects a deleted buyer profile before querying evidence", async () => {
    mocks.buyer.mockResolvedValue(null);
    await expect(grantBadge(grant)).rejects.toThrow("Buyer profile not found.");
    expect(mocks.evidence).not.toHaveBeenCalled();
    expectNoWrites();
  });

  it.each([grantBadge, revokeBadge])("requires an authenticated admin", async (command) => {
    mocks.getSessionUser.mockResolvedValue(null);
    await expect(command(grant)).rejects.toThrow("redirect:/login");
    mocks.getSessionUser.mockResolvedValue({ id: adminId, roles: ["BUYER"] });
    await expect(command(grant)).rejects.toThrow("redirect:/buyer/");
    expect(mocks.transaction).not.toHaveBeenCalled();
    expectNoWrites();
  });

  it("retains the shared grant review limit", async () => {
    mocks.assertRateLimit.mockRejectedValue(new Error("Rate limit reached. Try again later."));
    await expect(grantBadge(grant)).rejects.toThrow("Rate limit reached");
    expect(mocks.assertRateLimit).toHaveBeenCalledWith(`admin-review:${adminId}`, 120, 3_600_000);
    expect(mocks.transaction).not.toHaveBeenCalled();
    expectNoWrites();
  });

  it("defaults a newly granted pre-approval to 90 days", async () => {
    const before = Date.now();
    await grantBadge(grant);
    const expiresAt = mocks.upsert.mock.calls[0][0].create.expiresAt as Date;
    expect(expiresAt.getTime()).toBeGreaterThanOrEqual(before + 90 * 86_400_000);
    expect(expiresAt.getTime()).toBeLessThanOrEqual(Date.now() + 90 * 86_400_000);
  });

  it.each([
    ["VERIFIED_FUNDS", "VERIFIED_FUNDS"], ["VERIFIED_IDENTITY", "IDENTITY"],
  ])("clears the old expiry when regranting a %s badge without a new expiry", async (badgeType, documentType) => {
    mocks.evidence.mockResolvedValue({ ...document, documentType });
    mocks.upsert.mockImplementation(async ({ update }) => ({
      id: "badge-fixture", badgeType, status: "EXPIRED", expiresAt: new Date("2020-01-01T00:00:00Z"),
      ...Object.fromEntries(Object.entries(update).filter(([, value]) => value !== undefined)),
    }));
    await expect(grantBadge({ ...grant, badgeType })).resolves.toMatchObject({
      ok: true, data: { type: badgeType, status: "active", expiresInDays: undefined },
    });
    expect(mocks.upsert).toHaveBeenCalledWith(expect.objectContaining({ update: expect.objectContaining({ expiresAt: null }) }));
  });

  it("preserves an explicit expiry when granting verified funds", async () => {
    const expiresAt = new Date("2030-01-01T00:00:00Z");
    mocks.evidence.mockResolvedValue({ ...document, documentType: "VERIFIED_FUNDS" });
    await grantBadge({ ...grant, badgeType: "VERIFIED_FUNDS", expiresAt });
    expect(mocks.upsert).toHaveBeenCalledWith(expect.objectContaining({ update: expect.objectContaining({ expiresAt }) }));
  });

  it("lets an admin revoke their own real badge with an audit and notification", async () => {
    await expect(revokeBadge({ badgeId: "badge-fixture" })).resolves.toMatchObject({ ok: true });
    expect(mocks.revoke).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: "badge-fixture" }, data: expect.objectContaining({ status: "REVOKED" }),
    }));
    expect(mocks.audit).toHaveBeenCalledWith({ data: expect.objectContaining({ action: "revoke_badge", actorUserId: adminId }) });
    expect(mocks.notification).toHaveBeenCalledWith({ data: expect.objectContaining({ userId: adminId }) });
  });

  it("does not report a successful grant when its transaction fails", async () => {
    const error = new Error("Transaction failed");
    mocks.transaction.mockRejectedValue(error);
    await expect(grantBadge(grant)).rejects.toBe(error);
  });
});
