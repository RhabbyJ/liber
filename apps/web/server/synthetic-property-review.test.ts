import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Prisma } from "@liber/db";

const mocks = vi.hoisted(() => ({
  session: vi.fn(), enabled: vi.fn(), limit: vi.fn(), transaction: vi.fn(), lock: vi.fn(),
  property: vi.fn(), properties: vi.fn(), update: vi.fn(), audits: vi.fn(), audit: vi.fn(),
  documents: vi.fn(), decision: vi.fn(), users: vi.fn(), buyers: vi.fn(),
}));
vi.mock("@liber/db", () => ({ prisma: {
  $transaction: mocks.transaction, sellerProperty: { findMany: mocks.properties },
  adminAuditLog: { findMany: mocks.audits }, buyerProfile: { findMany: mocks.buyers },
} }));
vi.mock("./session", () => ({ getSessionUser: mocks.session }));
vi.mock("./ceo-preview", () => ({ ceoPreviewToolsEnabled: mocks.enabled }));
vi.mock("./rate-limit", () => ({ checkRateLimit: mocks.limit }));

import {
  activeSyntheticPropertyApprovals, assertSyntheticPropertyInvite, listSyntheticPropertyReviewCandidates,
  reviewSyntheticProperty, syntheticJourneyBuyerProfileIds, JOURNEY_BUYER_EMAIL, JOURNEY_SELLER_EMAIL,
  TEST_PROPERTY_APPROVAL, TEST_PROPERTY_REVOCATION,
} from "./synthetic-property-review";

const tx = {
  $queryRaw: mocks.lock,
  sellerProperty: { findUnique: mocks.property, update: mocks.update },
  adminAuditLog: { findMany: mocks.audits, create: mocks.audit },
  verificationDocument: { findMany: mocks.documents },
  propertyVerificationDecision: { findUnique: mocks.decision },
  user: { findMany: mocks.users }, buyerProfile: { findMany: mocks.buyers },
} as unknown as Prisma.TransactionClient;
const property = {
  id: "demo-property", identityVersion: 2, ownerUserId: "demo-seller", addressLine1: "Test property", city: "Los Angeles",
  status: "DRAFT", ownershipVerificationStatus: "NOT_SUBMITTED", authorityAttestedAt: new Date(),
  authorityAttestedByUserId: "demo-seller", authorityAttestedIdentityVersion: 2,
  attestationVersion: "v1-property-authority-2026-07", flaggedForReviewAt: null,
  owner: { id: "demo-seller", email: JOURNEY_SELLER_EMAIL, roles: ["SELLER"], status: "ACTIVE", sellerAccess: { status: "APPROVED" } },
};
const approve = { propertyId: property.id, identityVersion: 2, decision: "APPROVE", confirmSynthetic: "true" };
const revoke = { propertyId: property.id, identityVersion: 2, decision: "REVOKE" };
const marker = (action = TEST_PROPERTY_APPROVAL, version = 2) => ({ action, targetId: property.id, metadata: { propertyIdentityVersion: version } });

describe("closed synthetic property test approval", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.session.mockResolvedValue({ id: "admin", roles: ["ADMIN"] });
    mocks.enabled.mockReturnValue(true);
    mocks.limit.mockResolvedValue({ allowed: true });
    mocks.property.mockResolvedValue(property);
    mocks.properties.mockResolvedValue([property]);
    mocks.audits.mockResolvedValue([]);
    mocks.documents.mockResolvedValue([]);
    mocks.decision.mockResolvedValue(null);
    mocks.buyers.mockResolvedValue([]);
    mocks.users.mockResolvedValue([{ id: property.ownerUserId, email: JOURNEY_SELLER_EMAIL }, { id: "demo-buyer", email: JOURNEY_BUYER_EMAIL }]);
    mocks.transaction.mockImplementation((callback) => callback(tx));
  });

  it("requires the existing preview gate and a server admin before inspecting properties", async () => {
    mocks.enabled.mockReturnValue(false);
    expect(await reviewSyntheticProperty(approve)).toMatchObject({ ok: false });
    expect(await listSyntheticPropertyReviewCandidates()).toEqual([]);
    mocks.enabled.mockReturnValue(true);
    mocks.session.mockResolvedValue({ id: "seller", roles: ["SELLER"] });
    expect(await reviewSyntheticProperty(approve)).toMatchObject({ ok: false });
    expect(mocks.property).not.toHaveBeenCalled();
    expect(mocks.update).not.toHaveBeenCalled();
  });

  it.each([
    { owner: { ...property.owner, email: "ordinary-seller@example.com" } },
    { owner: { ...property.owner, status: "SUSPENDED" } },
    { owner: { ...property.owner, sellerAccess: { status: "PENDING" } } },
    { identityVersion: 3 }, { authorityAttestedIdentityVersion: 1 }, { authorityAttestedAt: null },
    { authorityAttestedByUserId: "another-user" }, { attestationVersion: "old-version" },
    { flaggedForReviewAt: new Date() }, { status: "ARCHIVED" },
  ])("rejects an ineligible property without changing evidence or status: %j", async (change) => {
    mocks.property.mockResolvedValue({ ...property, ...change });
    expect(await reviewSyntheticProperty(approve)).toMatchObject({ ok: false });
    expect(mocks.update).not.toHaveBeenCalled();
    expect(mocks.audit).not.toHaveBeenCalled();
  });

  it("records a separate audit and property status without creating document evidence or a verification decision", async () => {
    const form = new FormData();
    Object.entries(approve).forEach(([key, value]) => form.set(key, String(value)));
    form.set("$ACTION_REF_test", "");
    expect(await reviewSyntheticProperty(form)).toMatchObject({ ok: true });
    expect(mocks.update).toHaveBeenCalledWith({ where: { id: property.id }, data: { status: "READY_FOR_INVITES", ownershipVerificationStatus: "APPROVED" } });
    expect(mocks.audit).toHaveBeenCalledWith({ data: expect.objectContaining({ action: TEST_PROPERTY_APPROVAL, actorUserId: "admin", targetId: property.id, metadata: expect.objectContaining({ synthetic: true, evidenceBypassed: true, propertyIdentityVersion: 2 }) }) });
    expect(mocks.documents).not.toHaveBeenCalled();
    expect(mocks.decision).not.toHaveBeenCalled();
    expect(mocks.lock).toHaveBeenCalledTimes(2);
    expect(mocks.lock.mock.invocationCallOrder[1]).toBeLessThan(mocks.update.mock.invocationCallOrder[0]);
  });

  it("requires explicit synthetic confirmation and preserves the review rate limit", async () => {
    expect(await reviewSyntheticProperty({ ...approve, confirmSynthetic: undefined })).toMatchObject({ ok: false });
    mocks.limit.mockResolvedValue({ allowed: false });
    expect(await reviewSyntheticProperty(approve)).toMatchObject({ ok: false });
    expect(mocks.transaction).not.toHaveBeenCalled();
  });

  it("makes repeat approval a no-op and does not override genuine existing approval", async () => {
    mocks.property.mockResolvedValue({ ...property, status: "READY_FOR_INVITES", ownershipVerificationStatus: "APPROVED" });
    expect(await reviewSyntheticProperty(approve)).toMatchObject({ ok: false });
    mocks.audits.mockResolvedValue([marker()]);
    expect(await reviewSyntheticProperty(approve)).toMatchObject({ ok: true });
    expect(mocks.update).not.toHaveBeenCalled();
    expect(mocks.audit).not.toHaveBeenCalled();
  });

  it("revokes to the actual no-evidence state and audits the reversal", async () => {
    mocks.audits.mockResolvedValue([marker()]);
    expect(await reviewSyntheticProperty(revoke)).toMatchObject({ ok: true });
    expect(mocks.update).toHaveBeenCalledWith({ where: { id: property.id }, data: { status: "DRAFT", ownershipVerificationStatus: "NOT_SUBMITTED" } });
    expect(mocks.audit).toHaveBeenCalledWith({ data: expect.objectContaining({ action: TEST_PROPERTY_REVOCATION, metadata: expect.objectContaining({ evidenceBypassed: false }) }) });
  });

  it("keeps genuine approval on revoke only when both current reviewed evidence records and the decision are valid", async () => {
    mocks.audits.mockResolvedValue([marker()]);
    const documents = [
      { id: "id-doc", ownershipEvidenceKind: "GOVERNMENT_ID", reviewStatus: "APPROVED", reviewChecklist: { identityMatchesOwner: true, authorityConfirmed: true } },
      { id: "address-doc", ownershipEvidenceKind: "PROPERTY_ADDRESS_PROOF", reviewStatus: "APPROVED", reviewChecklist: { addressMatchesProperty: true, ownerOrEntityMatches: true } },
    ];
    mocks.documents.mockResolvedValue(documents);
    mocks.decision.mockResolvedValue({ decision: "APPROVED", governmentIdDocumentId: "id-doc", addressEvidenceDocumentId: "address-doc" });
    expect(await reviewSyntheticProperty(revoke)).toMatchObject({ ok: true });
    expect(mocks.update).toHaveBeenLastCalledWith({ where: { id: property.id }, data: { status: "READY_FOR_INVITES", ownershipVerificationStatus: "APPROVED" } });
    mocks.documents.mockResolvedValue([documents[0], { ...documents[1], reviewChecklist: {} }]);
    await reviewSyntheticProperty(revoke);
    expect(mocks.update).toHaveBeenLastCalledWith({ where: { id: property.id }, data: { status: "READY_FOR_REVIEW", ownershipVerificationStatus: "PENDING" } });
  });

  it("reads revocation evidence one query at a time on the transaction connection", async () => {
    mocks.audits.mockResolvedValue([marker()]);
    let inFlight = 0;
    let maxInFlight = 0;
    const serial = <T,>(value: T) => async () => {
      maxInFlight = Math.max(maxInFlight, ++inFlight);
      await new Promise((resolve) => setTimeout(resolve, 0));
      inFlight -= 1;
      return value;
    };
    mocks.documents.mockImplementation(serial([]));
    mocks.decision.mockImplementation(serial(null));
    expect(await reviewSyntheticProperty(revoke)).toMatchObject({ ok: true });
    expect(mocks.documents).toHaveBeenCalledTimes(1);
    expect(mocks.decision).toHaveBeenCalledTimes(1);
    expect(maxInFlight).toBe(1);
  });

  it("treats latest revocation and changed property versions as inactive", async () => {
    mocks.audits.mockResolvedValue([marker(TEST_PROPERTY_REVOCATION), marker(), marker(TEST_PROPERTY_APPROVAL, 1)]);
    expect(await activeSyntheticPropertyApprovals(tx, [property])).toEqual(new Set());
    expect(await reviewSyntheticProperty(revoke)).toMatchObject({ ok: true });
    expect(mocks.update).not.toHaveBeenCalled();
    mocks.audits.mockResolvedValue([marker(TEST_PROPERTY_APPROVAL, 1)]);
    expect(await activeSyntheticPropertyApprovals(tx, [property])).toEqual(new Set());
  });

  it("allows only the designated fixture buyer and seller while the preview is enabled", async () => {
    mocks.audits.mockResolvedValue([marker()]);
    expect(await assertSyntheticPropertyInvite(tx, property, "demo-buyer")).toBe(true);
    await expect(assertSyntheticPropertyInvite(tx, property, "ordinary-buyer")).rejects.toThrow("designated demo buyer");
    mocks.users.mockResolvedValue([{ id: property.ownerUserId, email: "ordinary@example.com" }, { id: "demo-buyer", email: JOURNEY_BUYER_EMAIL }]);
    await expect(assertSyntheticPropertyInvite(tx, property, "demo-buyer")).rejects.toThrow("designated demo buyer");
    mocks.enabled.mockReturnValue(false);
    await expect(assertSyntheticPropertyInvite(tx, property, "demo-buyer")).rejects.toThrow("outside the private preview");
  });

  it("leaves ordinary property invite eligibility unchanged", async () => {
    expect(await assertSyntheticPropertyInvite(tx, property, "ordinary-buyer")).toBe(false);
    expect(mocks.users).not.toHaveBeenCalled();
  });

  it("classifies demo buyer profiles only by the closed fixture email without fake seed audit writes", async () => {
    mocks.buyers.mockResolvedValue([{ id: "fixture-profile" }]);
    expect(await syntheticJourneyBuyerProfileIds(tx, ["fixture-profile", "ordinary-profile"])).toEqual(new Set(["fixture-profile"]));
    expect(mocks.buyers).toHaveBeenCalledWith({ where: { id: { in: ["fixture-profile", "ordinary-profile"] }, user: { email: JOURNEY_BUYER_EMAIL } }, select: { id: true } });
    expect(mocks.audit).not.toHaveBeenCalled();
  });
});
