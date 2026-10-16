import { Prisma, prisma } from "@liber/db";
import { z } from "zod";
import { hasRole } from "./authz";
import { ceoPreviewToolsEnabled } from "./ceo-preview";
import { productionTestingModeEnabled } from "./preview-environment";
import { checkRateLimit } from "./rate-limit";
import { getSessionUser } from "./session";

export const JOURNEY_BUYER_EMAIL = "liber-demo-buyer-20260925-journey@example.com";
export const JOURNEY_SELLER_EMAIL = "liber-demo-seller-20260925-journey@example.com";
export const TEST_PROPERTY_APPROVAL = "property_synthetic_test_approval";
export const TEST_PROPERTY_REVOCATION = "property_synthetic_test_revocation";
export const TEST_PROPERTY_LABEL = "Test approval — ownership not verified";
const TEST_ACTIONS = [TEST_PROPERTY_APPROVAL, TEST_PROPERTY_REVOCATION];

/**
 * Production testing mode opens test approvals to every seller property and lets them
 * invite any buyer; elsewhere they stay limited to the closed journey fixture pair.
 */
export function testApprovalsOpenToAllProperties() {
  return productionTestingModeEnabled();
}

type ReadClient = Pick<Prisma.TransactionClient, "adminAuditLog" | "buyerProfile" | "user">;
type PropertyVersion = { id: string; identityVersion: number };
export type SyntheticPropertyReviewResult = { ok: boolean; message: string };
const reviewSchema = z.object({
  propertyId: z.string().min(1).max(200),
  identityVersion: z.coerce.number().int().positive(),
  decision: z.enum(["APPROVE", "REVOKE"]),
  confirmSynthetic: z.literal("true").optional(),
}).strict();

function metadataVersion(value: Prisma.JsonValue) {
  return value && typeof value === "object" && !Array.isArray(value) && typeof value.propertyIdentityVersion === "number"
    ? value.propertyIdentityVersion : null;
}

export function syntheticPropertyVersionKey(property: PropertyVersion) {
  return `${property.id}:${property.identityVersion}`;
}

export async function activeSyntheticPropertyApprovals(client: Pick<ReadClient, "adminAuditLog">, properties: PropertyVersion[]) {
  if (!properties.length) return new Set<string>();
  const rows = await client.adminAuditLog.findMany({
    where: { targetType: "seller_property", targetId: { in: properties.map((property) => property.id) }, action: { in: TEST_ACTIONS } },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    select: { action: true, targetId: true, metadata: true },
  });
  const currentKeys = new Set(properties.map(syntheticPropertyVersionKey));
  const seen = new Set<string>();
  const active = new Set<string>();
  for (const row of rows) {
    const version = metadataVersion(row.metadata);
    if (version === null) continue;
    const key = syntheticPropertyVersionKey({ id: row.targetId, identityVersion: version });
    if (!currentKeys.has(key) || seen.has(key)) continue;
    seen.add(key);
    if (row.action === TEST_PROPERTY_APPROVAL) active.add(key);
  }
  return active;
}

export async function syntheticJourneyBuyerProfileIds(client: Pick<ReadClient, "buyerProfile">, ids?: string[]) {
  if (ids && !ids.length) return new Set<string>();
  const profiles = await client.buyerProfile.findMany({
    where: { ...(ids ? { id: { in: ids } } : {}), user: { email: JOURNEY_BUYER_EMAIL } },
    select: { id: true },
  });
  return new Set(profiles.map((profile) => profile.id));
}

export async function assertSyntheticPropertyInvite(client: ReadClient, property: PropertyVersion & { ownerUserId: string }, buyerUserId: string) {
  const active = await activeSyntheticPropertyApprovals(client, [property]);
  if (!active.has(syntheticPropertyVersionKey(property))) return false;
  if (!ceoPreviewToolsEnabled()) throw new Error("This test property is unavailable outside the private preview.");
  const users = await client.user.findMany({ where: { id: { in: [property.ownerUserId, buyerUserId] }, status: "ACTIVE" }, select: { id: true, email: true } });
  if (testApprovalsOpenToAllProperties()) {
    if (users.length !== 2) throw new Error("Test-approved properties can only invite active accounts.");
    return true;
  }
  if (!users.some((user) => user.id === property.ownerUserId && user.email === JOURNEY_SELLER_EMAIL)
    || !users.some((user) => user.id === buyerUserId && user.email === JOURNEY_BUYER_EMAIL)) {
    throw new Error("Test-approved properties can only invite the designated demo buyer.");
  }
  return true;
}

async function authorizedPreviewAdmin() {
  if (!ceoPreviewToolsEnabled()) return null;
  const user = await getSessionUser();
  return user && hasRole(user, "ADMIN") ? user : null;
}

const candidateSelect = {
  id: true, addressLine1: true, city: true, identityVersion: true, ownershipVerificationStatus: true, status: true,
  ownerUserId: true, authorityAttestedByUserId: true, authorityAttestedIdentityVersion: true, authorityAttestedAt: true,
  attestationVersion: true, flaggedForReviewAt: true,
  owner: { select: { id: true, email: true, status: true, roles: true, sellerAccess: { select: { status: true } } } },
} satisfies Prisma.SellerPropertySelect;
type Candidate = Prisma.SellerPropertyGetPayload<{ select: typeof candidateSelect }>;

function approvalUnavailableReason(property: Candidate) {
  if (!testApprovalsOpenToAllProperties() && property.owner.email !== JOURNEY_SELLER_EMAIL) return "This property is not in the designated demo cohort.";
  if (property.owner.status !== "ACTIVE" || !property.owner.roles.includes("SELLER") || property.owner.sellerAccess?.status !== "APPROVED") return "The seller needs active, approved seller access.";
  if (property.flaggedForReviewAt || property.status === "ARCHIVED") return "Flagged or archived properties cannot receive a test approval.";
  if (!property.authorityAttestedAt || property.attestationVersion !== "v1-property-authority-2026-07" || property.authorityAttestedByUserId !== property.ownerUserId || property.authorityAttestedIdentityVersion !== property.identityVersion) return "The seller must confirm authority for the current property version first.";
  return null;
}

export async function listSyntheticPropertyReviewCandidates() {
  if (!await authorizedPreviewAdmin()) return [];
  const properties = await prisma.sellerProperty.findMany({
    where: testApprovalsOpenToAllProperties() ? { status: { not: "ARCHIVED" } } : { owner: { email: JOURNEY_SELLER_EMAIL } },
    select: candidateSelect,
    orderBy: { createdAt: "desc" },
    take: 100,
  });
  const active = await activeSyntheticPropertyApprovals(prisma, properties);
  return properties.map((property) => ({
    id: property.id,
    identityVersion: property.identityVersion,
    title: [property.addressLine1, property.city].filter(Boolean).join(", ") || "Untitled property",
    testApproved: active.has(syntheticPropertyVersionKey(property)),
    unavailableReason: approvalUnavailableReason(property),
    ownershipStatus: property.ownershipVerificationStatus,
  }));
}

function validChecklist(value: Prisma.JsonValue | null, kind: "GOVERNMENT_ID" | "PROPERTY_ADDRESS_PROOF") {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  return kind === "GOVERNMENT_ID" ? value.identityMatchesOwner === true && value.authorityConfirmed === true : value.addressMatchesProperty === true && value.ownerOrEntityMatches === true;
}

async function genuineEvidenceState(tx: Prisma.TransactionClient, property: Candidate) {
  // Sequential: concurrent queries on one interactive-transaction connection are deprecated in pg.
  const documents = await tx.verificationDocument.findMany({ where: { propertyId: property.id, propertyIdentityVersion: property.identityVersion, userId: property.ownerUserId, documentType: "OWNERSHIP" }, select: { id: true, reviewStatus: true, ownershipEvidenceKind: true, reviewChecklist: true } });
  const decision = await tx.propertyVerificationDecision.findUnique({ where: { propertyId_propertyIdentityVersion: { propertyId: property.id, propertyIdentityVersion: property.identityVersion } } });
  const governmentId = documents.find((document) => document.id === decision?.governmentIdDocumentId && document.ownershipEvidenceKind === "GOVERNMENT_ID" && document.reviewStatus === "APPROVED" && validChecklist(document.reviewChecklist, "GOVERNMENT_ID"));
  const address = documents.find((document) => document.id === decision?.addressEvidenceDocumentId && document.ownershipEvidenceKind === "PROPERTY_ADDRESS_PROOF" && document.reviewStatus === "APPROVED" && validChecklist(document.reviewChecklist, "PROPERTY_ADDRESS_PROOF"));
  if (decision?.decision === "APPROVED" && governmentId && address && !approvalUnavailableReason(property)) return { ownershipVerificationStatus: "APPROVED", status: "READY_FOR_INVITES" } as const;
  const status = documents.some((document) => document.reviewStatus !== "REJECTED") ? "PENDING" : documents.length ? "REJECTED" : "NOT_SUBMITTED";
  return { ownershipVerificationStatus: status, status: property.status === "ARCHIVED" || property.flaggedForReviewAt ? "ARCHIVED" : status === "PENDING" ? "READY_FOR_REVIEW" : "DRAFT" } as const;
}

export async function reviewSyntheticProperty(input: unknown): Promise<SyntheticPropertyReviewResult> {
  const admin = await authorizedPreviewAdmin();
  if (!admin) return { ok: false, message: "Test approvals require an admin in the enabled private preview." };
  // Next adds $ACTION_* bookkeeping to progressively enhanced form submissions.
  const values = input instanceof FormData
    ? Object.fromEntries(["propertyId", "identityVersion", "decision", "confirmSynthetic"].map((key) => [key, input.get(key) ?? undefined]))
    : input;
  const parsed = reviewSchema.safeParse(values);
  if (!parsed.success || (parsed.data.decision === "APPROVE" && parsed.data.confirmSynthetic !== "true")) return { ok: false, message: "Confirm this is a synthetic test property, then try again." };
  const limit = await checkRateLimit(`admin-test-property:${admin.id}`, 30, 60 * 60_000);
  if (!limit.allowed) return { ok: false, message: "The test-review limit was reached. Wait a few minutes and try again." };
  const data = parsed.data;
  return prisma.$transaction(async (tx) => {
    const initial = await tx.sellerProperty.findUnique({ where: { id: data.propertyId }, select: { ownerUserId: true } });
    if (!initial) return { ok: false, message: "The test property is no longer available." };
    await tx.$queryRaw`SELECT id FROM public."User" WHERE id = ${initial.ownerUserId}::uuid FOR UPDATE`;
    await tx.$queryRaw`SELECT id FROM public."SellerProperty" WHERE id = ${data.propertyId} FOR UPDATE`;
    const property = await tx.sellerProperty.findUnique({ where: { id: data.propertyId }, select: candidateSelect });
    const openCohort = testApprovalsOpenToAllProperties();
    if (!property || property.ownerUserId !== initial.ownerUserId || (!openCohort && property.owner.email !== JOURNEY_SELLER_EMAIL) || property.identityVersion !== data.identityVersion) return { ok: false, message: "The property changed. Refresh this page before reviewing it." };
    const active = (await activeSyntheticPropertyApprovals(tx, [property])).has(syntheticPropertyVersionKey(property));
    if (data.decision === "APPROVE") {
      const reason = approvalUnavailableReason(property);
      if (reason) return { ok: false, message: reason };
      if (active && property.ownershipVerificationStatus === "APPROVED" && property.status === "READY_FOR_INVITES") return { ok: true, message: "This property already has its test approval." };
      if (!active && property.ownershipVerificationStatus === "APPROVED") return { ok: false, message: "This property already has normal ownership approval; a test override is unnecessary." };
    } else if (!active) {
      return { ok: true, message: "There is no active test approval to revoke." };
    }
    const next = data.decision === "APPROVE" ? { ownershipVerificationStatus: "APPROVED", status: "READY_FOR_INVITES" } as const : await genuineEvidenceState(tx, property);
    await tx.sellerProperty.update({ where: { id: property.id }, data: next });
    await tx.adminAuditLog.create({ data: {
      action: data.decision === "APPROVE" ? TEST_PROPERTY_APPROVAL : TEST_PROPERTY_REVOCATION,
      actorUserId: admin.id,
      targetType: "seller_property",
      targetId: property.id,
      metadata: { source: openCohort ? "production-testing-mode" : "closed-journey-fixture-20260925", synthetic: true, evidenceBypassed: data.decision === "APPROVE", propertyIdentityVersion: property.identityVersion, ownerUserId: property.ownerUserId, previousStatus: property.status, previousOwnershipStatus: property.ownershipVerificationStatus, ...next },
    } });
    const approvedMessage = openCohort
      ? "Test approval recorded. Ownership was not verified. The seller can now send invites."
      : "Test approval recorded. Ownership was not verified. Only the designated demo buyer can be invited.";
    return { ok: true, message: data.decision === "APPROVE" ? approvedMessage : "Test approval revoked. The property now reflects its actual evidence review state." };
  });
}
