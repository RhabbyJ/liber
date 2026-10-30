import { Prisma, prisma } from "@liber/db";
import { createHash, randomUUID } from "node:crypto";
import { z } from "zod";
import {
  calculateLoiSummary,
  LOI_CALCULATION_VERSION,
  LOI_SCHEMA_VERSION,
  LOI_RESPONSE_WINDOW_HOURS,
  LOI_STANDARD_DEPOSIT_BPS,
  LOI_MAX_PRICE_CENTS,
  loiComputedSummaryV1Schema,
  loiComputedSummaryV2Schema,
  loiComputedSummaryV3Schema,
  loiComputedSummaryV4Schema,
  loiComputedSummaryV5Schema,
  loiComputedSummaryV6Schema,
  loiComputedSummaryV7Schema,
  loiNegotiationIdSchema,
  parseLoiEditableTerms,
  parseLoiDraftTerms,
  loiDraftTermsV1Schema,
  loiTermsV1Schema,
  type LoiTermsV1,
} from "@liber/validators";
import { getSessionUser } from "../session";
import { consumeSharedRateLimit } from "../shared-rate-limit";
import { LoiError, loiConflict, loiNotFound, loiUnavailable } from "./errors";
import { assertLoiV1EnabledForPair, loiV1Configured, loiV1EnabledForPair } from "./feature";
import { canDraftLoi, isTerminalLoiStatus, loiAllowedActions } from "./policy";
import { financingTestExceptionExpiresAt } from "./financing-test-exception";

type Tx = Prisma.TransactionClient;
type Role = "BUYER" | "SELLER";
type ExistingEvent = { actorUserId: string | null; metadata: unknown; revisionId: string | null; type: string };
const LOI_REVISION_PAGE_SIZE = 20;
const LOI_REQUEST_FINGERPRINT_VERSION = 1;
const loiStarterTermsSchema = loiTermsV1Schema.safeExtend({
  purchasePriceCents: z.number().int().min(0).max(LOI_MAX_PRICE_CENTS),
});
type Access = {
  buyer_email: string;
  buyer_name: string | null;
  buyer_user_active: boolean;
  buyer_user_id: string;
  conversation_id: string;
  conversation_status: string;
  current_response_deadline: Date | null;
  current_revision_id: string | null;
  current_sequence: number;
  invite_id: string;
  invite_status: string;
  negotiation_id: string | null;
  negotiation_status: string | null;
  pair_blocked: boolean;
  participant_bindings_current: boolean;
  property_approved: boolean;
  property_id: string;
  property_identity_current: boolean;
  property_identity_version: number;
  property_price: Prisma.Decimal | null;
  property_ready: boolean;
  property_snapshot: unknown;
  seller_access_approved: boolean;
  seller_email: string;
  seller_user_active: boolean;
  seller_user_id: string;
};

export async function getLoiForConversation(conversationId: string) {
  const user = await currentUser();
  if (!loiV1Configured()) return { available: false as const };
  const access = await accessByConversation(prisma, conversationId, user.id);
  if (!access || !loiV1EnabledForPair(access.buyer_user_id, access.seller_user_id)) return { available: false as const };
  if (access.negotiation_id) return { available: true as const, id: access.negotiation_id, status: effectiveLoiStatus(access) };
  return {
    available: canStartNegotiation(access),
    canCreate: user.id === access.buyer_user_id,
    inviteId: access.invite_id,
    status: "NOT_STARTED",
  };
}

export async function createLoiNegotiation(input: { clientActionId: string; inviteId: string }) {
  const user = await currentUser();
  await rateLimit(user.id, "loi-create", 10, 3600);
  const requestFingerprint = fingerprintRequest({ action: "CREATE", actorUserId: user.id, inviteId: input.inviteId });
  const initial = await accessByInvite(prisma, input.inviteId, user.id);
  if (!initial) throw loiNotFound();
  assertLoiV1EnabledForPair(initial.buyer_user_id, initial.seller_user_id);
  if (user.id !== initial.buyer_user_id) throw loiNotFound();

  const id = await serializableTransaction(async (tx) => {
    await lockContext(tx, initial);
    const access = await accessByInvite(tx, input.inviteId, user.id);
    if (!access || user.id !== access.buyer_user_id) throw loiNotFound();
    if (access.negotiation_id) {
      const existingEvent = await tx.loiEvent.findUnique({ where: { negotiationId_clientActionId: { negotiationId: access.negotiation_id, clientActionId: input.clientActionId } } });
      if (existingEvent) assertIdempotentEvent(existingEvent, user.id, ["NEGOTIATION_CREATED"], requestFingerprint);
      return access.negotiation_id;
    }
    assertCanStart(access);
    const negotiation = await tx.loiNegotiation.create({
      data: {
        buyerUserId: access.buyer_user_id,
        conversationId: access.conversation_id,
        currentSequence: 0,
        inviteId: access.invite_id,
        propertyId: access.property_id,
        propertyIdentityVersion: access.property_identity_version,
        propertySnapshot: json(access.property_snapshot),
        sellerUserId: access.seller_user_id,
        status: "AWAITING_BUYER_SUBMISSION",
      },
    });
    await tx.loiEvent.create({ data: { actorRole: "BUYER", actorUserId: user.id, clientActionId: input.clientActionId, metadata: { requestFingerprint, requestFingerprintVersion: LOI_REQUEST_FINGERPRINT_VERSION }, negotiationId: negotiation.id, type: "NEGOTIATION_CREATED" } });
    return negotiation.id;
  });
  return getLoiNegotiation(id);
}

export async function getLoiNegotiation(negotiationId: string) {
  const parsedId = loiNegotiationIdSchema.safeParse(negotiationId);
  if (!parsedId.success) throw loiNotFound();
  negotiationId = parsedId.data;
  const user = await currentUser();
  return prisma.$transaction(async (tx) => {
    const access = await accessByNegotiation(tx, negotiationId, user.id);
    if (!access) throw loiNotFound();
    assertLoiV1EnabledForPair(access.buyer_user_id, access.seller_user_id);
    const negotiation = await tx.loiNegotiation.findUnique({ where: { id: negotiationId } });
    if (!negotiation) throw loiNotFound();
    const revisionRows = await tx.loiRevision.findMany({
      where: { negotiationId },
      orderBy: { sequence: "desc" },
      take: LOI_REVISION_PAGE_SIZE + 1,
    });
    const hasOlderRevisions = revisionRows.length > LOI_REVISION_PAGE_SIZE;
    const revisions = revisionRows.slice(0, LOI_REVISION_PAGE_SIZE).reverse();
    const draft = await tx.loiDraft.findUnique({ where: { negotiationId_ownerUserId: { negotiationId, ownerUserId: user.id } } });
    const current = negotiation.currentRevisionId ? revisions.find((revision) => revision.id === negotiation.currentRevisionId) : undefined;
    if ((negotiation.currentSequence === 0) !== !current || (current && current.sequence !== negotiation.currentSequence)) throw loiUnavailable();
    const viewerRole: Role = user.id === access.buyer_user_id ? "BUYER" : "SELLER";
    const effectivelyExpired = Boolean(current && current.responseDeadline.getTime() <= Date.now() && !isTerminalLoiStatus(negotiation.status));
    const eligible = isNegotiationEligible(access);
    const allowedActions = eligible
      ? loiAllowedActions(negotiation.status, negotiation.currentSequence, current?.submittedByRole ?? null, viewerRole, effectivelyExpired)
      : [];
    const editable = eligible && !effectivelyExpired && canDraftLoi(negotiation.status, negotiation.currentSequence, viewerRole);
    const effectiveStatus = effectiveLoiStatus(access, negotiation.status, current?.responseDeadline ?? null) ?? "READ_ONLY";
    // Only the buyer learns their own evidence state (a pending letter is private to them).
    const evidence = viewerRole === "BUYER" ? await buyerFinancingEvidence(tx, access.buyer_user_id) : null;
    return {
      allowedActions,
      buyerFinancingEvidence: evidence ? evidence.badgeActive ? "BADGE" as const : evidence.documentUploaded ? "DOCUMENT" as const : "NONE" as const : null,
      conversationId: access.conversation_id,
      currentSequence: negotiation.currentSequence,
      draft: draft && editable ? { basedOnSequence: draft.basedOnSequence, draftVersion: draft.draftVersion, id: draft.id, terms: decodeDraftTerms(draft.schemaVersion, draft.terms), updatedAt: draft.updatedAt.toISOString() } : null,
      effectivelyExpired,
      financingEvidenceExceptionExpiresAt: financingTestExceptionExpiresAt(access.buyer_user_id, negotiation.id),
      id: negotiation.id,
      propertySnapshot: negotiation.propertySnapshot,
      revisionPageInfo: {
        hasOlder: hasOlderRevisions,
        oldestSequence: revisions[0]?.sequence ?? null,
      },
      revisions: revisions.map(revisionDto),
      starterTerms: viewerRole === "BUYER"
        && negotiation.status === "AWAITING_BUYER_SUBMISSION"
        && negotiation.currentSequence === 0
        && eligible
        && allowedActions.includes("EDIT")
        ? starterTerms(access)
        : null,
      status: effectiveStatus,
      viewerRole,
    };
  }, { isolationLevel: "RepeatableRead" });
}

export async function getLoiRevisionPage(negotiationId: string, beforeSequence: number) {
  const parsedId = loiNegotiationIdSchema.safeParse(negotiationId);
  if (!parsedId.success) throw loiNotFound();
  negotiationId = parsedId.data;
  const user = await currentUser();
  return prisma.$transaction(async (tx) => {
    const access = await accessByNegotiation(tx, negotiationId, user.id);
    if (!access) throw loiNotFound();
    assertLoiV1EnabledForPair(access.buyer_user_id, access.seller_user_id);
    const negotiation = await tx.loiNegotiation.findUnique({ where: { id: negotiationId } });
    if (!negotiation || beforeSequence > negotiation.currentSequence + 1) throw loiNotFound();
    const rows = await tx.loiRevision.findMany({
      where: { negotiationId, sequence: { lt: beforeSequence } },
      orderBy: { sequence: "desc" },
      take: LOI_REVISION_PAGE_SIZE + 1,
    });
    const hasOlder = rows.length > LOI_REVISION_PAGE_SIZE;
    const revisions = rows.slice(0, LOI_REVISION_PAGE_SIZE).reverse();
    return {
      pageInfo: { hasOlder, oldestSequence: revisions[0]?.sequence ?? null },
      revisions: revisions.map(revisionDto),
    };
  }, { isolationLevel: "RepeatableRead" });
}

export async function saveLoiDraft(input: { expectedDraftVersion: number; expectedSequence: number; negotiationId: string; terms: unknown }) {
  const user = await currentUser();
  await rateLimit(user.id, "loi-draft", 120, 3600);
  const saved = await withNegotiation(input.negotiationId, user.id, async (tx, access, role) => {
    await assertCanDraft(tx, access, role, input.expectedSequence);
    const incoming = parseLoiDraftTerms(input.terms, access.current_sequence > 0);
    const normalized = access.current_sequence === 0 ? withSellerDisclosure(incoming, role) : mergeLoiCounterTerms(await loadCurrentTerms(tx, access), incoming, role, true);
    const summary = normalized.purchasePriceCents > 0 ? calculateLoiSummary(normalized) : null;
    const [existing] = await tx.$queryRaw<Array<{ draftVersion: number }>>`
      SELECT "draftVersion" FROM public."LoiDraft"
      WHERE "negotiationId" = ${input.negotiationId}::uuid AND "ownerUserId" = ${user.id}::uuid FOR UPDATE
    `;
    if ((!existing && input.expectedDraftVersion !== 0) || (existing && existing.draftVersion !== input.expectedDraftVersion)) throw loiConflict("A newer draft exists.");
    if (existing) {
      await tx.loiDraft.update({ where: { negotiationId_ownerUserId: { negotiationId: input.negotiationId, ownerUserId: user.id } }, data: { calculationVersion: LOI_CALCULATION_VERSION, draftVersion: { increment: 1 }, schemaVersion: LOI_SCHEMA_VERSION, terms: json(normalized) } });
    } else {
      await tx.loiDraft.create({ data: { basedOnRevisionId: access.current_revision_id, basedOnSequence: access.current_sequence, calculationVersion: LOI_CALCULATION_VERSION, draftVersion: 1, negotiationId: input.negotiationId, ownerRole: role, ownerUserId: user.id, schemaVersion: LOI_SCHEMA_VERSION, terms: json(normalized) } });
    }
    return summary;
  });
  const result = await getLoiNegotiation(input.negotiationId);
  return { draft: result.draft, preview: saved };
}

export async function discardLoiDraft(input: { expectedDraftVersion: number; expectedSequence: number; negotiationId: string }) {
  const user = await currentUser();
  await rateLimit(user.id, "loi-draft-discard", 30, 3600);
  await withNegotiation(input.negotiationId, user.id, async (tx, access, role) => {
    await assertCanDraft(tx, access, role, input.expectedSequence);
    const [draft] = await tx.$queryRaw<Array<{ draftVersion: number }>>`
      SELECT "draftVersion" FROM public."LoiDraft"
      WHERE "negotiationId" = ${input.negotiationId}::uuid AND "ownerUserId" = ${user.id}::uuid FOR UPDATE
    `;
    if ((!draft && input.expectedDraftVersion !== 0) || (draft && draft.draftVersion !== input.expectedDraftVersion)) throw loiConflict("A newer draft exists.");
    await tx.loiDraft.deleteMany({ where: { negotiationId: input.negotiationId, ownerUserId: user.id } });
  });
  return getLoiNegotiation(input.negotiationId);
}

export async function submitLoiRevision(input: { clientActionId: string; expectedDraftId: string; expectedDraftVersion: number; expectedSequence: number; negotiationId: string; responseDeadline?: string }) {
  const user = await currentUser();
  await rateLimit(user.id, "loi-submit", 20, 3600);
  const requestIdentity = {
    action: "SUBMIT",
    actorUserId: user.id,
    expectedDraftId: input.expectedDraftId,
    expectedDraftVersion: input.expectedDraftVersion,
    expectedSequence: input.expectedSequence,
    negotiationId: input.negotiationId,
  };
  const requestFingerprint = fingerprintRequest({ ...requestIdentity, responseWindowHours: LOI_RESPONSE_WINDOW_HOURS });
  await withNegotiation(input.negotiationId, user.id, async (tx, access, role, existingEvent) => {
    if (existingEvent) {
      // Old submissions retain both their original deadline and retry identity.
      const historicalDeadline = input.responseDeadline ? new Date(input.responseDeadline) : null;
      const retryFingerprint = record(existingEvent.metadata)?.responseWindowHours === LOI_RESPONSE_WINDOW_HOURS
        ? requestFingerprint
        : historicalDeadline && Number.isFinite(historicalDeadline.getTime())
          ? fingerprintRequest({ ...requestIdentity, responseDeadline: historicalDeadline.toISOString() })
          : requestFingerprint;
      assertIdempotentEvent(existingEvent, user.id, ["INITIAL_SUBMITTED", "COUNTER_SUBMITTED"], retryFingerprint);
      return;
    }
    await assertCanDraft(tx, access, role, input.expectedSequence);
    const draft = await tx.loiDraft.findUnique({ where: { negotiationId_ownerUserId: { negotiationId: input.negotiationId, ownerUserId: user.id } } });
    if (!draft || draft.id !== input.expectedDraftId || draft.draftVersion !== input.expectedDraftVersion || draft.basedOnSequence !== input.expectedSequence) throw loiConflict("Draft changed before submission.");
    const terms = access.current_sequence === 0
      ? withSellerDisclosure(parseLoiEditableTerms(draft.terms), role)
      : mergeLoiCounterTerms(await loadCurrentTerms(tx, access), parseLoiEditableTerms(draft.terms, true), role);
    const financingEvidenceExceptionExpiresAt = terms.funding.type === "FINANCED"
      ? await assertBuyerFinancingEvidence(tx, access.buyer_user_id, input.negotiationId)
      : null;
    const summary = calculateLoiSummary(terms);
    const draftFingerprint = fingerprint({
      draftId: draft.id,
      draftVersion: draft.draftVersion,
      negotiationId: input.negotiationId,
      terms,
    });
    const sequence = access.current_sequence + 1;
    const submittedAt = new Date();
    const deadline = new Date(submittedAt.getTime() + LOI_RESPONSE_WINDOW_HOURS * 60 * 60 * 1000);
    const revision = await tx.loiRevision.create({ data: { calculationVersion: LOI_CALCULATION_VERSION, computedSummary: json(summary), kind: sequence === 1 ? "INITIAL" : "COUNTER", negotiationId: input.negotiationId, parentRevisionId: access.current_revision_id, responseDeadline: deadline, schemaVersion: LOI_SCHEMA_VERSION, sequence, submittedAt, submittedByRole: role, submittedByUserId: user.id, terms: json(terms) } });
    const status = role === "BUYER" ? "AWAITING_SELLER_RESPONSE" : "AWAITING_BUYER_RESPONSE";
    await tx.loiNegotiation.update({ where: { id: input.negotiationId }, data: { currentRevisionId: revision.id, currentSequence: sequence, status } });
    await tx.loiDraft.delete({ where: { negotiationId_ownerUserId: { negotiationId: input.negotiationId, ownerUserId: user.id } } });
    const event = await tx.loiEvent.create({ data: { actorRole: role, actorUserId: user.id, clientActionId: input.clientActionId, metadata: { draftFingerprint, draftFingerprintVersion: 1, requestFingerprint, requestFingerprintVersion: LOI_REQUEST_FINGERPRINT_VERSION, responseWindowHours: LOI_RESPONSE_WINDOW_HOURS, ...(financingEvidenceExceptionExpiresAt ? { financingEvidenceExceptionExpiresAt } : {}) }, negotiationId: input.negotiationId, revisionId: revision.id, type: sequence === 1 ? "INITIAL_SUBMITTED" : "COUNTER_SUBMITTED" } });
    await notifyCounterparty(tx, access, role, revision.id, event.id, sequence === 1 ? "A new LOI is ready for your review." : "A counter has been submitted.");
  }, input.clientActionId);
  return getLoiNegotiation(input.negotiationId);
}

export async function decideLoiRevision(input: { action: "AGREE" | "DECLINE"; clientActionId: string; expectedSequence: number; negotiationId: string; revisionId: string }) {
  const user = await currentUser();
  await rateLimit(user.id, "loi-decision", 20, 3600);
  const requestFingerprint = fingerprintRequest({
    action: input.action,
    actorUserId: user.id,
    expectedSequence: input.expectedSequence,
    negotiationId: input.negotiationId,
    revisionId: input.revisionId,
  });
  await withNegotiation(input.negotiationId, user.id, async (tx, access, role, existingEvent) => {
    if (existingEvent) {
      const expectedType = input.action === "AGREE" ? "TERMS_ALIGNED" : "DECLINED";
      assertIdempotentEvent(existingEvent, user.id, [expectedType], requestFingerprint, input.revisionId);
      return;
    }
    if (access.current_sequence !== input.expectedSequence || access.current_revision_id !== input.revisionId || !access.negotiation_status || isTerminalLoiStatus(access.negotiation_status)) throw loiConflict();
    const revision = await tx.loiRevision.findUnique({ where: { id: input.revisionId } });
    if (!revision || revision.responseDeadline.getTime() <= Date.now() || revision.submittedByRole === role) throw loiUnavailable();
    const aligned = input.action === "AGREE";
    await tx.loiNegotiation.update({ where: { id: input.negotiationId }, data: { closedAt: new Date(), closedReason: aligned ? "TERMS_ALIGNED" : "DECLINED", status: aligned ? "TERMS_ALIGNED" : "DECLINED" } });
    const event = await tx.loiEvent.create({ data: { actorRole: role, actorUserId: user.id, clientActionId: input.clientActionId, metadata: { requestFingerprint, requestFingerprintVersion: LOI_REQUEST_FINGERPRINT_VERSION }, negotiationId: input.negotiationId, revisionId: revision.id, type: aligned ? "TERMS_ALIGNED" : "DECLINED" } });
    await tx.loiDraft.deleteMany({ where: { negotiationId: input.negotiationId } });
    await notifyCounterparty(tx, access, role, revision.id, event.id, aligned ? "The parties aligned on the current terms." : "The LOI was declined.");
  }, input.clientActionId);
  return getLoiNegotiation(input.negotiationId);
}

export async function withdrawLoiNegotiation(input: { clientActionId: string; expectedSequence: number; negotiationId: string; revisionId: string | null }) {
  const user = await currentUser();
  await rateLimit(user.id, "loi-withdraw", 20, 3600);
  const requestFingerprint = fingerprintRequest({
    action: "WITHDRAW",
    actorUserId: user.id,
    expectedSequence: input.expectedSequence,
    negotiationId: input.negotiationId,
    revisionId: input.revisionId,
  });
  await withNegotiation(input.negotiationId, user.id, async (tx, access, role, existingEvent) => {
    if (existingEvent) {
      assertIdempotentEvent(existingEvent, user.id, ["WITHDRAWN"], requestFingerprint, input.revisionId);
      return;
    }
    if (access.current_sequence !== input.expectedSequence || !access.negotiation_status || isTerminalLoiStatus(access.negotiation_status)) throw loiConflict();
    if (access.current_sequence === 0) {
      if (role !== "BUYER" || input.revisionId !== null || access.negotiation_status !== "AWAITING_BUYER_SUBMISSION") throw loiUnavailable();
    } else {
      if (!input.revisionId || input.revisionId !== access.current_revision_id) throw loiConflict();
      const revision = await tx.loiRevision.findUnique({ where: { id: input.revisionId } });
      if (!revision || revision.submittedByRole !== role || revision.responseDeadline.getTime() <= Date.now()) throw loiUnavailable();
    }
    await tx.loiNegotiation.update({ where: { id: input.negotiationId }, data: { closedAt: new Date(), closedReason: "WITHDRAWN", status: "WITHDRAWN" } });
    const event = await tx.loiEvent.create({ data: { actorRole: role, actorUserId: user.id, clientActionId: input.clientActionId, metadata: { requestFingerprint, requestFingerprintVersion: LOI_REQUEST_FINGERPRINT_VERSION }, negotiationId: input.negotiationId, revisionId: input.revisionId ?? undefined, type: "WITHDRAWN" } });
    await tx.loiDraft.deleteMany({ where: { negotiationId: input.negotiationId } });
    if (input.revisionId) await notifyCounterparty(tx, access, role, input.revisionId, event.id, "The current LOI was withdrawn.");
  }, input.clientActionId);
  return getLoiNegotiation(input.negotiationId);
}

async function withNegotiation<T>(
  negotiationId: string,
  userId: string,
  mutation: (tx: Tx, access: Access, role: Role, existingEvent: ExistingEvent | null) => Promise<T>,
  clientActionId?: string,
) {
  const parsedId = loiNegotiationIdSchema.safeParse(negotiationId);
  if (!parsedId.success) throw loiNotFound();
  negotiationId = parsedId.data;
  const initial = await accessByNegotiation(prisma, negotiationId, userId);
  if (!initial) throw loiNotFound();
  assertLoiV1EnabledForPair(initial.buyer_user_id, initial.seller_user_id);
  const outcome = await serializableTransaction(async (tx) => {
    await lockContext(tx, initial, negotiationId);
    const access = await accessByNegotiation(tx, negotiationId, userId);
    if (!access) throw loiNotFound();
    const existingEvent = clientActionId
      ? await tx.loiEvent.findUnique({ where: { negotiationId_clientActionId: { negotiationId, clientActionId } } })
      : null;
    if (!existingEvent && !isNegotiationEligible(access)) {
      if (effectiveLoiStatus(access) !== "EXPIRED") await freezeLoiNegotiation(tx, access);
      return { unavailable: true as const };
    }
    return { unavailable: false as const, value: await mutation(tx, access, userId === access.buyer_user_id ? "BUYER" : "SELLER", existingEvent) };
  });
  if (outcome.unavailable) throw loiUnavailable();
  return outcome.value;
}

async function assertCanDraft(tx: Tx, access: Access, role: Role, expectedSequence: number) {
  if (access.current_sequence !== expectedSequence || !access.negotiation_status) throw loiConflict();
  if (!canDraftLoi(access.negotiation_status, access.current_sequence, role)) throw loiUnavailable();
  if (access.current_revision_id) {
    const revision = await tx.loiRevision.findUnique({ where: { id: access.current_revision_id } });
    if (!revision || revision.negotiationId !== access.negotiation_id || revision.sequence !== access.current_sequence || revision.responseDeadline.getTime() <= Date.now()) throw loiUnavailable();
  }
}

function assertCanStart(access: Access) {
  if (!canStartNegotiation(access)) throw loiUnavailable();
}

async function buyerFinancingEvidence(tx: Tx, buyerUserId: string) {
  const rows = await tx.$queryRaw<Array<{ badge_active: boolean; document_uploaded: boolean }>>`
    SELECT
      EXISTS (
        SELECT 1
        FROM public."BuyerProfile" profile
        JOIN public."BuyerBadge" badge ON badge."buyerProfileId" = profile.id
        WHERE profile."userId" = ${buyerUserId}::uuid
          AND badge."badgeType" = 'PRE_APPROVED'::public."BadgeType"
          AND badge.status = 'ACTIVE'::public."BadgeStatus"
          AND (badge."expiresAt" IS NULL OR badge."expiresAt" > now())
      ) AS badge_active,
      EXISTS (
        SELECT 1
        FROM public."VerificationDocument" document
        WHERE document."userId" = ${buyerUserId}::uuid
          AND document."documentType" = 'PRE_APPROVAL'::public."DocumentType"
          AND document."reviewStatus" IN ('PENDING'::public."DocumentStatus", 'APPROVED'::public."DocumentStatus")
      ) AS document_uploaded
  `;
  const row = Array.isArray(rows) ? rows[0] : undefined;
  return { badgeActive: Boolean(row?.badge_active), documentUploaded: Boolean(row?.document_uploaded) };
}

async function assertBuyerFinancingEvidence(tx: Tx, buyerUserId: string, negotiationId: string) {
  const evidence = await buyerFinancingEvidence(tx, buyerUserId);
  if (!evidence.badgeActive && !evidence.documentUploaded) {
    const exceptionExpiry = financingTestExceptionExpiresAt(buyerUserId, negotiationId);
    if (exceptionExpiry) return exceptionExpiry;
    throw new LoiError("FINANCING_EVIDENCE_REQUIRED", "Financed terms need a pre-approval badge or an uploaded pre-approval letter.", 400);
  }
  return null;
}

async function freezeLoiNegotiation(tx: Tx, access: Access) {
  if (!access.negotiation_id || !access.negotiation_status || isTerminalLoiStatus(access.negotiation_status)) return;
  const closedReason = access.pair_blocked ? "PARTICIPANTS_BLOCKED"
    : !access.buyer_user_active || !access.seller_user_active ? "PARTICIPANT_INACTIVE"
      : !access.seller_access_approved ? "SELLER_ACCESS_LOST"
        : !access.property_identity_current ? "PROPERTY_IDENTITY_CHANGED"
          : !access.property_ready || !access.property_approved ? "PROPERTY_NO_LONGER_ELIGIBLE"
            : "INVITE_NO_LONGER_ELIGIBLE";
  await tx.loiNegotiation.update({ where: { id: access.negotiation_id }, data: { closedAt: new Date(), closedReason, status: "READ_ONLY" } });
  await tx.loiDraft.deleteMany({ where: { negotiationId: access.negotiation_id } });
  await tx.emailOutbox.updateMany({ where: { loiNegotiationId: access.negotiation_id, status: { in: ["PENDING", "FAILED"] }, type: "LOI_UPDATE" }, data: { lastError: "The negotiation is no longer eligible.", nextAttemptAt: null, status: "CANCELLED" } });
  await tx.loiEvent.create({ data: { clientActionId: randomUUID(), metadata: { closedReason }, negotiationId: access.negotiation_id, revisionId: access.current_revision_id ?? undefined, type: "FROZEN" } });
}

function isNegotiationEligible(access: Access) {
  return access.invite_status === "ACCEPTED"
    && access.conversation_status === "ACTIVE"
    && access.buyer_user_active
    && access.seller_user_active
    && access.seller_access_approved
    && access.property_ready
    && access.property_approved
    && access.property_identity_current
    && access.participant_bindings_current
    && !access.pair_blocked;
}

function canStartNegotiation(access: Access) {
  return isNegotiationEligible(access)
    && starterTerms(access) !== null;
}

async function currentUser() {
  const user = await getSessionUser();
  if (!user) throw new LoiError("AUTHENTICATION_REQUIRED", "Authentication required.", 401);
  return user;
}

async function rateLimit(userId: string, namespace: string, limit: number, windowSeconds: number) {
  const result = await consumeSharedRateLimit({ identifier: userId, limit, namespace, windowSeconds });
  if (!result.allowed) throw new LoiError("RATE_LIMITED", "LOI request limit reached.", 429);
}

async function lockContext(tx: Tx, access: Access, negotiationId?: string) {
  const pair = [access.buyer_user_id, access.seller_user_id].sort().join(":");
  await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtextextended(${'messaging-pair:' + pair}, 0)) IS NULL AS locked`;
  await tx.$queryRaw`SELECT id FROM public."Invite" WHERE id = ${access.invite_id} FOR UPDATE`;
  await tx.$queryRaw`SELECT id FROM public."Conversation" WHERE id = ${access.conversation_id}::uuid FOR UPDATE`;
  if (negotiationId) await tx.$queryRaw`SELECT id FROM public."LoiNegotiation" WHERE id = ${negotiationId}::uuid FOR UPDATE`;
}

async function accessByInvite(client: Pick<typeof prisma, "$queryRaw">, inviteId: string, userId: string) {
  return (await accessRows(client, Prisma.sql`invite.id = ${inviteId}` , userId))[0] ?? null;
}
async function accessByConversation(client: Pick<typeof prisma, "$queryRaw">, conversationId: string, userId: string) {
  return (await accessRows(client, Prisma.sql`conversation.id = ${conversationId}::uuid`, userId))[0] ?? null;
}
async function accessByNegotiation(client: Pick<typeof prisma, "$queryRaw">, negotiationId: string, userId: string) {
  return (await accessRows(client, Prisma.sql`negotiation.id = ${negotiationId}::uuid`, userId))[0] ?? null;
}

function accessRows(client: Pick<typeof prisma, "$queryRaw">, predicate: Prisma.Sql, userId: string) {
  return client.$queryRaw<Access[]>(Prisma.sql`
    SELECT invite.id AS invite_id, invite.status::text AS invite_status,
      conversation.id AS conversation_id, conversation.status::text AS conversation_status,
      current_revision."responseDeadline" AS current_response_deadline,
      buyer_user.id AS buyer_user_id, buyer_user.email AS buyer_email, buyer_user.name AS buyer_name,
      buyer_user.status = 'ACTIVE'::public."UserStatus"
        AND 'BUYER'::public."UserRole" = ANY(buyer_user.roles)
        AND buyer."visibilityStatus" = 'ACTIVE'::public."BuyerVisibilityStatus" AS buyer_user_active,
      seller.id AS seller_user_id, seller.email AS seller_email,
      seller.status = 'ACTIVE'::public."UserStatus" AS seller_user_active,
      property.id AS property_id, property."identityVersion" AS property_identity_version,
      property.price AS property_price,
      property."ownerUserId" = seller.id
        AND property.status = 'READY_FOR_INVITES'::public."PropertyStatus"
        AND property."flaggedForReviewAt" IS NULL
        AND property."authorityAttestedIdentityVersion" = property."identityVersion" AS property_ready,
      property."ownershipVerificationStatus" = 'APPROVED'::public."PropertyVerificationStatus" AS property_approved,
      invite."propertyIdentityVersion" = property."identityVersion" AS property_identity_current,
      negotiation.id IS NULL OR (
        negotiation."buyerUserId" = buyer."userId"
        AND negotiation."sellerUserId" = invite."sellerId"
        AND negotiation."conversationId" = conversation.id
        AND negotiation."propertyId" = property.id
        AND negotiation."propertyIdentityVersion" = invite."propertyIdentityVersion"
      ) AS participant_bindings_current,
      'SELLER'::public."UserRole" = ANY(seller.roles)
        AND EXISTS (SELECT 1 FROM public."SellerAccess" access WHERE access."userId" = seller.id AND access.status = 'APPROVED') AS seller_access_approved,
      EXISTS (SELECT 1 FROM public."UserBlock" block WHERE (block."blockerUserId" = buyer_user.id AND block."blockedUserId" = seller.id) OR (block."blockerUserId" = seller.id AND block."blockedUserId" = buyer_user.id)) AS pair_blocked,
      COALESCE(negotiation."propertySnapshot", conversation."propertySnapshot") AS property_snapshot,
      negotiation.id AS negotiation_id, negotiation.status::text AS negotiation_status,
      negotiation."currentRevisionId" AS current_revision_id, COALESCE(negotiation."currentSequence", 0)::integer AS current_sequence
    FROM public."Invite" invite
    JOIN public."Conversation" conversation ON conversation."inviteId" = invite.id
    LEFT JOIN public."LoiNegotiation" negotiation ON negotiation."inviteId" = invite.id
    JOIN public."BuyerProfile" buyer ON buyer.id = invite."buyerProfileId"
    JOIN public."User" buyer_user ON buyer_user.id = COALESCE(negotiation."buyerUserId", buyer."userId")
    JOIN public."User" seller ON seller.id = COALESCE(negotiation."sellerUserId", invite."sellerId")
    JOIN public."SellerProperty" property ON property.id = invite."propertyId"
    LEFT JOIN public."LoiRevision" current_revision ON current_revision.id = negotiation."currentRevisionId"
    WHERE ${predicate} AND ${userId}::uuid IN (buyer_user.id, seller.id)
    LIMIT 1
  `);
}

async function notifyCounterparty(tx: Tx, access: Access, actorRole: Role, revisionId: string, eventId: string, body: string) {
  if (!access.negotiation_id) throw loiUnavailable();
  const actorUserId = actorRole === "BUYER" ? access.buyer_user_id : access.seller_user_id;
  const recipientUserId = actorRole === "BUYER" ? access.seller_user_id : access.buyer_user_id;
  const recipientEmail = actorRole === "BUYER" ? access.seller_email : access.buyer_email;
  await tx.notification.create({ data: { body, metadata: { negotiationId: access.negotiation_id }, title: "LOI update", type: "LOI_UPDATE", userId: recipientUserId } });
  await tx.emailOutbox.updateMany({
    where: { loiNegotiationId: access.negotiation_id, loiRecipientUserId: actorUserId, status: { in: ["PENDING", "FAILED"] }, type: "LOI_UPDATE" },
    data: { lastError: "Recipient already responded to this LOI update.", nextAttemptAt: null, status: "CANCELLED" },
  });
  await tx.emailOutbox.updateMany({
    where: { loiNegotiationId: access.negotiation_id, loiRecipientUserId: recipientUserId, status: { in: ["PENDING", "FAILED"] }, type: "LOI_UPDATE" },
    data: { lastError: "Superseded by a newer LOI update.", nextAttemptAt: null, status: "CANCELLED" },
  });
  await tx.emailOutbox.create({ data: { idempotencyKey: `loi-update:${eventId}:${recipientUserId}`, loiNegotiationId: access.negotiation_id, loiRecipientUserId: recipientUserId, loiRevisionId: revisionId, payload: {}, status: "PENDING", subject: "Your Liber LOI has an update", templateName: "loi-update", to: recipientEmail, type: "LOI_UPDATE" } });
}

async function serializableTransaction<T>(operation: (tx: Tx) => Promise<T>) {
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      return await prisma.$transaction(operation, { isolationLevel: "Serializable" });
    } catch (error) {
      if (!isSerializableConflict(error)) throw error;
      if (attempt === 3) throw loiConflict("The negotiation changed. Refresh and try again.");
    }
  }
  throw loiConflict();
}

function isSerializableConflict(error: unknown) {
  return Boolean(error && typeof error === "object" && "code" in error && (error as { code?: unknown }).code === "P2034");
}

function effectiveLoiStatus(access: Access, storedStatus = access.negotiation_status, deadline = access.current_response_deadline) {
  if (!storedStatus) return null;
  if (isTerminalLoiStatus(storedStatus)) return storedStatus;
  if (deadline && deadline.getTime() <= Date.now()) return "EXPIRED";
  return isNegotiationEligible(access) ? storedStatus : "READ_ONLY";
}

function revisionDto(revision: {
  calculationVersion: number;
  computedSummary: unknown;
  id: string;
  kind: "COUNTER" | "INITIAL";
  responseDeadline: Date;
  schemaVersion: number;
  sequence: number;
  submittedAt: Date;
  submittedByRole: Role;
  terms: unknown;
}) {
  return {
    computedSummary: decodeSummary(revision.calculationVersion, revision.computedSummary),
    id: revision.id,
    kind: revision.kind,
    responseDeadline: revision.responseDeadline.toISOString(),
    sequence: revision.sequence,
    submittedAt: revision.submittedAt.toISOString(),
    submittedByRole: revision.submittedByRole,
    terms: decodeTerms(revision.schemaVersion, revision.terms),
  };
}

function assertIdempotentEvent(
  event: { actorUserId: string | null; metadata: unknown; revisionId: string | null; type: string },
  actorUserId: string,
  expectedTypes: string[],
  requestFingerprint: string,
  expectedRevisionId?: string | null,
) {
  const metadata = record(event.metadata);
  if (event.actorUserId !== actorUserId
    || !expectedTypes.includes(event.type)
    || metadata?.requestFingerprintVersion !== LOI_REQUEST_FINGERPRINT_VERSION
    || metadata?.requestFingerprint !== requestFingerprint
    || (expectedRevisionId !== undefined && event.revisionId !== expectedRevisionId)) {
    throw loiConflict("This action key was already used for a different request.");
  }
}

function fingerprint(value: unknown) {
  return createHash("sha256").update(canonicalJson(value)).digest("hex");
}

function fingerprintRequest(value: Record<string, unknown>) {
  return fingerprint({ fingerprintVersion: LOI_REQUEST_FINGERPRINT_VERSION, ...value });
}

function canonicalJson(value: unknown): string {
  if (value === null) return "null";
  if (typeof value === "string" || typeof value === "boolean") return JSON.stringify(value);
  if (typeof value === "number" && Number.isFinite(value)) return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.entries(value)
      .filter(([, nested]) => nested !== undefined)
      .sort(([left], [right]) => left < right ? -1 : left > right ? 1 : 0)
      .map(([key, nested]) => `${JSON.stringify(key)}:${canonicalJson(nested)}`)
      .join(",")}}`;
  }
  throw new TypeError("LOI fingerprint input is not canonical JSON.");
}

function record(value: unknown) {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

function json(value: unknown) {
  return value as Prisma.InputJsonValue;
}

function starterTerms(access: Access): LoiTermsV1 | null {
  // Zero marks a missing asking/offer price in starters and private drafts.
  // Submitted revisions still require a positive offer.
  const purchasePriceCents = snapshotPriceCents(access.property_snapshot);
  const buyerLegalName = access.buyer_name?.trim();
  if (!buyerLegalName || purchasePriceCents === null) return null;
  const parsed = loiStarterTermsSchema.safeParse({
    additionalTerms: { exclusions: "", proposedTerms: "" },
    costsAndCredits: { alternateClosingCostAllocation: "", customaryClosingCosts: true, homeWarranty: { company: "", included: false, maximumCents: 0, payer: "SELLER", payerNote: "", specialInclusions: "" }, sellerCreditCents: 0, sellerCreditNote: "" },
    deposit: { basis: "PERCENT", percentageBps: LOI_STANDARD_DEPOSIT_BPS },
    disclosures: { condition: "", conditionsOfSale: "", deathOnProperty: "UNKNOWN" },
    funding: { type: "CASH" },
    hoa: { certificateFeePayer: "NOT_APPLICABLE", documentFeePayer: "NOT_APPLICABLE", transferFeePayer: "NOT_APPLICABLE" },
    parties: { buyerContact: { company: "", email: access.buyer_email, name: buyerLegalName, phone: "" }, buyerLegalName, vestingNote: "" },
    personalProperty: { excludedItems: "", included: false, includedItems: [], payer: "SELLER" },
    possession: { type: "AT_CLOSING" },
    providers: { escrow: { choice: "LIBER_PREFERRED", feePayer: "EACH_OWN" }, title: { choice: "LIBER_PREFERRED", feePayer: "SELLER" } },
    purchasePriceCents,
    representation: { agent: { company: "", email: "", license: "", name: "", phone: "" }, buyerRepresented: false, commissionAmount: "", commissionPayer: null },
    schemaVersion: LOI_SCHEMA_VERSION,
    timing: { appraisalContingencyDays: 17, closingDays: 30, inspectionContingencyDays: 10, loanContingencyDays: null, sellerDisclosureReviewDays: 7, titleReviewDays: 7 },
  });
  return parsed.success ? parsed.data : null;
}

function snapshotPriceCents(value: unknown) {
  const snapshot = record(value);
  if (!snapshot) return null;
  const dollars = snapshot?.price;
  if (dollars === undefined || dollars === null || dollars === 0
    || (typeof dollars === "string" && (dollars.trim() === "" || Number(dollars) === 0))) return 0;
  const numeric = typeof dollars === "number" ? dollars : typeof dollars === "string" ? Number(dollars) : Number.NaN;
  const cents = Math.round(numeric * 100);
  return Number.isSafeInteger(cents) && cents > 0 ? cents : null;
}

function decodeDraftTerms(version: number, value: unknown) {
  if (version !== LOI_SCHEMA_VERSION) throw loiUnavailable();
  return loiDraftTermsV1Schema.parse(value);
}

function decodeTerms(version: number, value: unknown) {
  if (version !== LOI_SCHEMA_VERSION) throw loiUnavailable();
  return loiTermsV1Schema.parse(value);
}

function decodeSummary(version: number, value: unknown) {
  if (version === 1) return loiComputedSummaryV1Schema.parse(value);
  if (version === 2) return loiComputedSummaryV2Schema.parse(value);
  if (version === 3) return loiComputedSummaryV3Schema.parse(value);
  if (version === 4) return loiComputedSummaryV4Schema.parse(value);
  if (version === 5) return loiComputedSummaryV5Schema.parse(value);
  if (version === 6) return loiComputedSummaryV6Schema.parse(value);
  if (version === 7) return loiComputedSummaryV7Schema.parse(value);
  throw loiUnavailable();
}

async function loadCurrentTerms(tx: Tx, access: Access) {
  if (!access.current_revision_id) throw loiUnavailable();
  const revision = await tx.loiRevision.findUnique({
    where: { id: access.current_revision_id },
    select: { schemaVersion: true, terms: true },
  });
  if (!revision) throw loiUnavailable();
  return decodeTerms(revision.schemaVersion, revision.terms);
}

function withSellerDisclosure(terms: LoiTermsV1, role: Role, base?: LoiTermsV1): LoiTermsV1 {
  // The role comes from the immutable participants, never from the submitted JSON.
  const disclosures = { condition: terms.disclosures.condition, conditionsOfSale: terms.disclosures.conditionsOfSale, deathOnProperty: terms.disclosures.deathOnProperty };
  return {
    ...terms,
    disclosures: role === "SELLER"
      ? { ...disclosures, deathOnPropertyProvidedBy: "SELLER" }
      : { ...disclosures, deathOnProperty: base?.disclosures.deathOnProperty ?? "UNKNOWN", ...(base?.disclosures.deathOnPropertyProvidedBy ? { deathOnPropertyProvidedBy: base.disclosures.deathOnPropertyProvidedBy } : {}) },
  };
}

function mergeLoiCounterTerms(base: LoiTermsV1, next: LoiTermsV1, role: Role, draft = false): LoiTermsV1 {
  return (draft ? parseLoiDraftTerms : parseLoiEditableTerms)({
    ...base,
    costsAndCredits: {
      ...base.costsAndCredits,
      transferTaxSchedule: next.costsAndCredits.transferTaxSchedule ?? base.costsAndCredits.transferTaxSchedule,
      alternateClosingCostAllocation: next.costsAndCredits.alternateClosingCostAllocation,
      customaryClosingCosts: next.costsAndCredits.customaryClosingCosts,
      closingCostPayers: next.costsAndCredits.closingCostPayers,
      closingCostEstimates: next.costsAndCredits.closingCostEstimates,
      homeWarranty: {
        ...base.costsAndCredits.homeWarranty,
        maximumCents: next.costsAndCredits.homeWarranty.maximumCents,
        payer: next.costsAndCredits.homeWarranty.payer,
        payerNote: next.costsAndCredits.homeWarranty.payerNote,
        buyerShareCents: next.costsAndCredits.homeWarranty.buyerShareCents,
        sellerShareCents: next.costsAndCredits.homeWarranty.sellerShareCents,
      },
      sellerCreditCents: next.costsAndCredits.sellerCreditCents,
      sellerCreditIncluded: next.costsAndCredits.sellerCreditIncluded,
      sellerCreditNote: next.costsAndCredits.sellerCreditNote,
    },
    deposit: { basis: "PERCENT", percentageBps: LOI_STANDARD_DEPOSIT_BPS },
    disclosures: withSellerDisclosure(next, role, base).disclosures,
    funding: base.funding.type === "SELLER_FINANCING"
      ? { ...base.funding, principalCents: Math.max(next.purchasePriceCents - base.funding.cashDownPaymentCents, 0) }
      : base.funding,
    hoa: next.hoa,
    personalProperty: next.personalProperty,
    possession: next.possession.type === "TENANT_REMAINS" || next.possession.type === "OTHER" ? base.possession : next.possession,
    providers: { escrow: next.providers.escrow, title: { ...base.providers.title, feePayer: next.providers.title.feePayer ?? base.providers.title.feePayer } },
    purchasePriceCents: next.purchasePriceCents,
    representation: {
      ...base.representation,
      commissionAmount: next.representation.commissionAmount,
      commissionPayer: next.representation.commissionPayer,
    },
    timing: next.timing,
  }, true);
}
