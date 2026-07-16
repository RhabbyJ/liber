import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { LoiTermsV1 } from "@liber/validators";
import { createHash } from "node:crypto";

const buyerId = "11111111-1111-4111-8111-111111111111";
const sellerId = "22222222-2222-4222-8222-222222222222";
const negotiationId = "33333333-3333-4333-8333-333333333333";
const conversationId = "44444444-4444-4444-8444-444444444444";
const revisionId = "55555555-5555-4555-8555-555555555555";
const eventId = "66666666-6666-4666-8666-666666666666";
const actionId = "77777777-7777-4777-8777-777777777777";
const draftId = "88888888-8888-4888-8888-888888888888";
const otherDraftId = "99999999-9999-4999-8999-999999999999";

const mocks = vi.hoisted(() => ({
  getSessionUser: vi.fn(),
  rateLimit: vi.fn(),
  prisma: {
    $queryRaw: vi.fn(), $transaction: vi.fn(),
    emailOutbox: { create: vi.fn(), updateMany: vi.fn() },
    loiDraft: { create: vi.fn(), delete: vi.fn(), deleteMany: vi.fn(), findUnique: vi.fn(), update: vi.fn() },
    loiEvent: { create: vi.fn(), findUnique: vi.fn() },
    loiNegotiation: { create: vi.fn(), findUnique: vi.fn(), update: vi.fn() },
    loiRevision: { create: vi.fn(), findMany: vi.fn(), findUnique: vi.fn() },
    notification: { create: vi.fn() },
  },
}));

vi.mock("@liber/db", () => ({
  Prisma: {
    sql: (strings: TemplateStringsArray, ...values: unknown[]) => ({ strings, values }),
  },
  prisma: mocks.prisma,
}));
vi.mock("../session", () => ({ getSessionUser: mocks.getSessionUser }));
vi.mock("../shared-rate-limit", () => ({ consumeSharedRateLimit: mocks.rateLimit }));

import { createLoiNegotiation, decideLoiRevision, discardLoiDraft, getLoiForConversation, getLoiNegotiation, getLoiRevisionPage, saveLoiDraft, submitLoiRevision, withdrawLoiNegotiation } from "./service";

const terms: LoiTermsV1 = {
  additionalTerms: { exclusions: "", proposedTerms: "" },
  costsAndCredits: { alternateClosingCostAllocation: "", customaryClosingCosts: true, homeWarranty: { company: "", included: false, maximumCents: 0, payer: "SELLER", payerNote: "" }, sellerCreditCents: 0, sellerCreditNote: "" },
  deposit: { basis: "PERCENT", percentageBps: 300 },
  funding: { type: "CASH" },
  hoa: { certificateFeePayer: "NOT_APPLICABLE", documentFeePayer: "NOT_APPLICABLE", transferFeePayer: "NOT_APPLICABLE" },
  parties: { buyerContact: { company: "", email: "buyer@example.test", name: "Buyer Test", phone: "" }, buyerLegalName: "Buyer Test", vestingNote: "" },
  personalProperty: { excludedItems: "", included: false, includedItems: [] },
  possession: { type: "AT_CLOSING" },
  providers: { escrow: { choice: "LIBER_PREFERRED" }, title: { choice: "LIBER_PREFERRED" } },
  purchasePriceCents: 100_000_000,
  representation: { agent: { company: "", email: "", name: "", phone: "" }, buyerRepresented: false },
  schemaVersion: 1,
  timing: { appraisalContingencyDays: 17, closingDays: 30, inspectionContingencyDays: 10, loanContingencyDays: null, sellerDisclosureReviewDays: 7, titleReviewDays: 7 },
};

function access(sequence = 0, status = "AWAITING_BUYER_SUBMISSION") {
  return {
    buyer_email: "buyer@example.test", buyer_name: "Buyer Test", buyer_user_active: true, buyer_user_id: buyerId,
    conversation_id: conversationId, conversation_status: "ACTIVE", current_response_deadline: sequence ? new Date(Date.now() + 86_400_000) : null, current_revision_id: sequence ? revisionId : null,
    current_sequence: sequence, invite_id: "invite-1", invite_status: "ACCEPTED", negotiation_id: negotiationId,
    negotiation_status: status, pair_blocked: false, participant_bindings_current: true, property_approved: true, property_id: "property-1",
    property_identity_current: true, property_identity_version: 1, property_price: { toString: () => "1000000" },
    property_ready: true, property_snapshot: { price: 1_000_000 }, seller_access_approved: true, seller_email: "seller@example.test",
    seller_user_active: true, seller_user_id: sellerId,
  };
}

function negotiation(sequence: number, status: string) {
  return { closedAt: status === "WITHDRAWN" ? new Date() : null, currentRevisionId: sequence ? revisionId : null, currentSequence: sequence, id: negotiationId, propertySnapshot: {}, status };
}

function revision(deadline = new Date(Date.now() + 86_400_000)) {
  return { calculationVersion: 1, computedSummary: { calculationVersion: 1, earnestMoneyBps: 123, earnestMoneyCents: 1, effectivePriceAfterSellerCreditCents: 2, loanAmountCents: 3, loanToValueBps: 4, remainingDownPaymentAfterDepositCents: 5 }, id: revisionId, kind: "INITIAL", negotiationId, responseDeadline: deadline, schemaVersion: 1, sequence: 1, submittedAt: new Date(), submittedByRole: "BUYER", terms };
}

function requestFingerprint(value: Record<string, unknown>) {
  const canonical = `{${Object.entries({ fingerprintVersion: 1, ...value }).sort(([left], [right]) => left < right ? -1 : left > right ? 1 : 0).map(([key, nested]) => `${JSON.stringify(key)}:${JSON.stringify(nested)}`).join(",")}}`;
  return createHash("sha256").update(canonical).digest("hex");
}

function queueMutationAccess(row: ReturnType<typeof access>, readRow = row) {
  mocks.prisma.$queryRaw
    .mockResolvedValueOnce([row])
    .mockResolvedValueOnce([{ locked: true }])
    .mockResolvedValueOnce([{ id: row.invite_id }])
    .mockResolvedValueOnce([{ id: row.conversation_id }])
    .mockResolvedValueOnce([{ id: negotiationId }])
    .mockResolvedValueOnce([row])
    .mockResolvedValueOnce([readRow]);
}

describe("LOI service behavior", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.stubEnv("LIBER_LOI_V1_ENABLED", "true");
    vi.stubEnv("LIBER_LOI_V1_COHORT_USER_IDS", `${buyerId},${sellerId}`);
    mocks.getSessionUser.mockResolvedValue({ id: buyerId, roles: ["BUYER"] });
    mocks.rateLimit.mockResolvedValue({ allowed: true });
    mocks.prisma.$transaction.mockImplementation(async (operation: (tx: typeof mocks.prisma) => unknown) => operation(mocks.prisma));
    mocks.prisma.loiDraft.deleteMany.mockResolvedValue({ count: 1 });
    mocks.prisma.loiEvent.findUnique.mockResolvedValue(null);
    mocks.prisma.loiEvent.create.mockResolvedValue({ actorUserId: buyerId, id: eventId, revisionId, type: "WITHDRAWN" });
    mocks.prisma.loiNegotiation.update.mockResolvedValue({});
    mocks.prisma.emailOutbox.create.mockResolvedValue({});
    mocks.prisma.emailOutbox.updateMany.mockResolvedValue({ count: 1 });
    mocks.prisma.notification.create.mockResolvedValue({});
  });

  afterEach(() => vi.unstubAllEnvs());

  it("does not query LOI tables for a disabled or invalid cohort", async () => {
    for (const [enabled, cohort] of [
      ["false", `${buyerId},${sellerId}`],
      ["true", `${buyerId},${sellerId},`],
      ["true", `${buyerId},,${sellerId}`],
    ]) {
      vi.stubEnv("LIBER_LOI_V1_ENABLED", enabled);
      vi.stubEnv("LIBER_LOI_V1_COHORT_USER_IDS", cohort);
      await expect(getLoiForConversation(conversationId)).resolves.toEqual({ available: false });
    }
    expect(mocks.prisma.$queryRaw).not.toHaveBeenCalled();
  });

  it("withdraws a sequence-zero negotiation without attempting delivery", async () => {
    const row = access();
    queueMutationAccess(row, { ...row, negotiation_status: "WITHDRAWN" });
    mocks.prisma.loiNegotiation.findUnique.mockResolvedValue(negotiation(0, "WITHDRAWN"));
    mocks.prisma.loiRevision.findMany.mockResolvedValue([]);
    mocks.prisma.loiDraft.findUnique.mockResolvedValue(null);

    await expect(withdrawLoiNegotiation({ clientActionId: actionId, expectedSequence: 0, negotiationId, revisionId: null })).resolves.toMatchObject({ status: "WITHDRAWN" });
    expect(mocks.prisma.loiNegotiation.update).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ status: "WITHDRAWN" }) }));
    expect(mocks.prisma.emailOutbox.create).not.toHaveBeenCalled();
  });

  it("uses the withdrawal event identity for a post-submit delivery job", async () => {
    const row = access(1, "AWAITING_SELLER_RESPONSE");
    queueMutationAccess(row, { ...row, negotiation_status: "WITHDRAWN" });
    mocks.prisma.loiRevision.findUnique.mockResolvedValue(revision());
    mocks.prisma.loiNegotiation.findUnique.mockResolvedValue(negotiation(1, "WITHDRAWN"));
    mocks.prisma.loiRevision.findMany.mockResolvedValue([revision()]);
    mocks.prisma.loiDraft.findUnique.mockResolvedValue(null);

    await withdrawLoiNegotiation({ clientActionId: actionId, expectedSequence: 1, negotiationId, revisionId });
    expect(mocks.prisma.emailOutbox.create).toHaveBeenCalledWith({ data: expect.objectContaining({ idempotencyKey: `loi-update:${eventId}:${sellerId}` }) });
    expect(mocks.prisma.emailOutbox.updateMany).toHaveBeenCalledWith({
      where: expect.objectContaining({ loiNegotiationId: negotiationId, loiRecipientUserId: buyerId }),
      data: expect.objectContaining({ status: "CANCELLED" }),
    });
  });

  it("rejects saving a counter after the current response deadline", async () => {
    const row = access(1, "AWAITING_BUYER_RESPONSE");
    mocks.prisma.$queryRaw
      .mockResolvedValueOnce([row])
      .mockResolvedValueOnce([{ locked: true }])
      .mockResolvedValueOnce([{ id: row.invite_id }])
      .mockResolvedValueOnce([{ id: row.conversation_id }])
      .mockResolvedValueOnce([{ id: negotiationId }])
      .mockResolvedValueOnce([row]);
    mocks.prisma.loiRevision.findUnique.mockResolvedValue(revision(new Date(Date.now() - 1)));

    await expect(saveLoiDraft({ expectedDraftVersion: 0, expectedSequence: 1, negotiationId, terms })).rejects.toMatchObject({ code: "UNAVAILABLE" });
    expect(mocks.prisma.loiDraft.findUnique).not.toHaveBeenCalled();
  });

  it("returns the persisted versioned historical summary without recalculation", async () => {
    const row = access(1, "AWAITING_SELLER_RESPONSE");
    mocks.prisma.$queryRaw.mockResolvedValueOnce([row]);
    mocks.prisma.loiNegotiation.findUnique.mockResolvedValue(negotiation(1, "AWAITING_SELLER_RESPONSE"));
    mocks.prisma.loiRevision.findMany.mockResolvedValue([revision()]);
    mocks.prisma.loiDraft.findUnique.mockResolvedValue(null);

    const result = await getLoiNegotiation(negotiationId);
    expect(result.revisions[0]?.computedSummary.earnestMoneyCents).toBe(1);
  });

  it("exposes starter terms only for an eligible actionable initial negotiation", async () => {
    const row = { ...access(), property_price: { toString: () => "2000000" }, property_snapshot: { price: 1_000_000 } };
    mocks.prisma.$queryRaw.mockResolvedValueOnce([row]);
    mocks.prisma.loiNegotiation.findUnique.mockResolvedValue(negotiation(0, "AWAITING_BUYER_SUBMISSION"));
    mocks.prisma.loiRevision.findMany.mockResolvedValue([]);
    mocks.prisma.loiDraft.findUnique.mockResolvedValue(null);

    const result = await getLoiNegotiation(negotiationId);
    expect(result.starterTerms?.purchasePriceCents).toBe(100_000_000);
    expect(result.allowedActions).toContain("EDIT");

    const ineligible = { ...row, property_ready: false };
    mocks.prisma.$queryRaw.mockResolvedValueOnce([ineligible]);
    mocks.prisma.loiNegotiation.findUnique.mockResolvedValue(negotiation(0, "AWAITING_BUYER_SUBMISSION"));
    mocks.prisma.loiRevision.findMany.mockResolvedValue([]);
    mocks.prisma.loiDraft.findUnique.mockResolvedValue(null);
    const frozenRead = await getLoiNegotiation(negotiationId);
    expect(frozenRead).toMatchObject({ allowedActions: [], starterTerms: null, status: "READ_ONLY" });
  });

  it("fails closed before advertising or creating an invalid starter payload", async () => {
    const notStarted = { ...access(), negotiation_id: null, negotiation_status: null };
    const invalidRows = [
      { ...notStarted, property_snapshot: { price: 100_000_000.01 } },
      { ...notStarted, buyer_name: "N".repeat(161) },
      { ...notStarted, buyer_email: `${"e".repeat(250)}@x.co` },
    ];
    for (const row of invalidRows) {
      mocks.prisma.$queryRaw.mockResolvedValueOnce([row]);
      await expect(getLoiForConversation(conversationId)).resolves.toMatchObject({ available: false });
    }

    const invalidCreate = invalidRows[0]!;
    mocks.prisma.$queryRaw
      .mockResolvedValueOnce([invalidCreate])
      .mockResolvedValueOnce([{ locked: true }])
      .mockResolvedValueOnce([{ id: invalidCreate.invite_id }])
      .mockResolvedValueOnce([{ id: invalidCreate.conversation_id }])
      .mockResolvedValueOnce([invalidCreate]);
    await expect(createLoiNegotiation({ clientActionId: actionId, inviteId: invalidCreate.invite_id })).rejects.toMatchObject({ code: "UNAVAILABLE" });
    expect(mocks.prisma.loiNegotiation.create).not.toHaveBeenCalled();
  });

  it("derives the conversation card status from expiry and eligibility while preserving terminal outcomes", async () => {
    mocks.prisma.$queryRaw.mockResolvedValueOnce([{ ...access(1, "AWAITING_SELLER_RESPONSE"), current_response_deadline: new Date(Date.now() - 1) }]);
    await expect(getLoiForConversation(conversationId)).resolves.toMatchObject({ available: true, status: "EXPIRED" });

    mocks.prisma.$queryRaw.mockResolvedValueOnce([{ ...access(1, "AWAITING_SELLER_RESPONSE"), property_ready: false }]);
    await expect(getLoiForConversation(conversationId)).resolves.toMatchObject({ available: true, status: "READ_ONLY" });

    mocks.prisma.$queryRaw.mockResolvedValueOnce([{ ...access(1, "TERMS_ALIGNED"), current_response_deadline: new Date(Date.now() - 1), property_ready: false }]);
    await expect(getLoiForConversation(conversationId)).resolves.toMatchObject({ available: true, status: "TERMS_ALIGNED" });
  });

  it("accepts only an equivalent submit retry for the same action key", async () => {
    const deadline = new Date(Date.now() + 3 * 86_400_000).toISOString();
    const row = access(1, "AWAITING_SELLER_RESPONSE");
    const fingerprint = requestFingerprint({
      action: "SUBMIT", actorUserId: buyerId, expectedDraftId: draftId, expectedDraftVersion: 1, expectedSequence: 0,
      negotiationId, responseDeadline: new Date(deadline).toISOString(),
    });
    mocks.prisma.loiEvent.findUnique.mockResolvedValue({ actorUserId: buyerId, metadata: { requestFingerprint: fingerprint, requestFingerprintVersion: 1 }, revisionId, type: "INITIAL_SUBMITTED" });
    queueMutationAccess(row);
    mocks.prisma.loiNegotiation.findUnique.mockResolvedValue(negotiation(1, "AWAITING_SELLER_RESPONSE"));
    mocks.prisma.loiRevision.findMany.mockResolvedValue([revision()]);
    mocks.prisma.loiDraft.findUnique.mockResolvedValue(null);

    await expect(submitLoiRevision({ clientActionId: actionId, expectedDraftId: draftId, expectedDraftVersion: 1, expectedSequence: 0, negotiationId, responseDeadline: deadline })).resolves.toMatchObject({ currentSequence: 1 });
    expect(mocks.prisma.notification.create).not.toHaveBeenCalled();

    const ineligible = { ...row, property_ready: false };
    queueMutationAccess(ineligible);
    mocks.prisma.loiNegotiation.update.mockClear();
    await expect(submitLoiRevision({ clientActionId: actionId, expectedDraftId: draftId, expectedDraftVersion: 1, expectedSequence: 0, negotiationId, responseDeadline: deadline })).resolves.toMatchObject({ currentSequence: 1, status: "READ_ONLY" });
    expect(mocks.prisma.loiNegotiation.update).not.toHaveBeenCalled();

    queueMutationAccess(ineligible);
    await expect(submitLoiRevision({ clientActionId: actionId, expectedDraftId: otherDraftId, expectedDraftVersion: 1, expectedSequence: 0, negotiationId, responseDeadline: deadline })).rejects.toMatchObject({ code: "CONFLICT" });
    expect(mocks.prisma.loiNegotiation.update).not.toHaveBeenCalled();
  });

  it("binds decision retries to the exact action, sequence, and revision", async () => {
    mocks.getSessionUser.mockResolvedValue({ id: sellerId, roles: ["SELLER"] });
    const row = access(1, "TERMS_ALIGNED");
    const fingerprint = requestFingerprint({ action: "AGREE", actorUserId: sellerId, expectedSequence: 1, negotiationId, revisionId });
    mocks.prisma.loiEvent.findUnique.mockResolvedValue({ actorUserId: sellerId, metadata: { requestFingerprint: fingerprint, requestFingerprintVersion: 1 }, revisionId, type: "TERMS_ALIGNED" });
    queueMutationAccess(row);
    mocks.prisma.loiNegotiation.findUnique.mockResolvedValue(negotiation(1, "TERMS_ALIGNED"));
    mocks.prisma.loiRevision.findMany.mockResolvedValue([revision()]);
    mocks.prisma.loiDraft.findUnique.mockResolvedValue(null);

    await expect(decideLoiRevision({ action: "AGREE", clientActionId: actionId, expectedSequence: 1, negotiationId, revisionId })).resolves.toMatchObject({ status: "TERMS_ALIGNED" });
    expect(mocks.prisma.emailOutbox.create).not.toHaveBeenCalled();

    queueMutationAccess(row);
    await expect(decideLoiRevision({ action: "DECLINE", clientActionId: actionId, expectedSequence: 1, negotiationId, revisionId })).rejects.toMatchObject({ code: "CONFLICT" });
  });

  it("binds withdrawal retries to the exact sequence and revision", async () => {
    const row = access(1, "WITHDRAWN");
    const fingerprint = requestFingerprint({ action: "WITHDRAW", actorUserId: buyerId, expectedSequence: 1, negotiationId, revisionId });
    mocks.prisma.loiEvent.findUnique.mockResolvedValue({ actorUserId: buyerId, metadata: { requestFingerprint: fingerprint, requestFingerprintVersion: 1 }, revisionId, type: "WITHDRAWN" });
    queueMutationAccess(row);
    mocks.prisma.loiNegotiation.findUnique.mockResolvedValue(negotiation(1, "WITHDRAWN"));
    mocks.prisma.loiRevision.findMany.mockResolvedValue([revision()]);
    mocks.prisma.loiDraft.findUnique.mockResolvedValue(null);

    await expect(withdrawLoiNegotiation({ clientActionId: actionId, expectedSequence: 1, negotiationId, revisionId })).resolves.toMatchObject({ status: "WITHDRAWN" });
    queueMutationAccess(row);
    await expect(withdrawLoiNegotiation({ clientActionId: actionId, expectedSequence: 0, negotiationId, revisionId })).rejects.toMatchObject({ code: "CONFLICT" });
  });

  it("retries a serializable transaction conflict before exposing an error", async () => {
    const row = access();
    queueMutationAccess(row, { ...row, negotiation_status: "WITHDRAWN" });
    let serializableAttempts = 0;
    mocks.prisma.$transaction.mockImplementation(async (operation: (tx: typeof mocks.prisma) => unknown, options?: { isolationLevel?: string }) => {
      if (options?.isolationLevel === "Serializable" && serializableAttempts++ === 0) throw Object.assign(new Error("retry"), { code: "P2034" });
      return operation(mocks.prisma);
    });
    mocks.prisma.loiNegotiation.findUnique.mockResolvedValue(negotiation(0, "WITHDRAWN"));
    mocks.prisma.loiRevision.findMany.mockResolvedValue([]);
    mocks.prisma.loiDraft.findUnique.mockResolvedValue(null);

    await expect(withdrawLoiNegotiation({ clientActionId: actionId, expectedSequence: 0, negotiationId, revisionId: null })).resolves.toMatchObject({ status: "WITHDRAWN" });
    expect(serializableAttempts).toBe(2);
  });

  it("returns a safe conflict after serializable retries are exhausted", async () => {
    mocks.prisma.$queryRaw.mockResolvedValueOnce([access()]);
    mocks.prisma.$transaction.mockRejectedValue(Object.assign(new Error("retry"), { code: "P2034" }));

    await expect(withdrawLoiNegotiation({ clientActionId: actionId, expectedSequence: 0, negotiationId, revisionId: null })).rejects.toMatchObject({ code: "CONFLICT", status: 409 });
    expect(mocks.prisma.loiNegotiation.update).not.toHaveBeenCalled();
  });

  it("rate-limits draft deletion before entering a transaction", async () => {
    mocks.rateLimit.mockResolvedValue({ allowed: false });
    await expect(discardLoiDraft({ expectedDraftVersion: 0, expectedSequence: 0, negotiationId })).rejects.toMatchObject({ code: "RATE_LIMITED", status: 429 });
    expect(mocks.prisma.$transaction).not.toHaveBeenCalled();
    expect(mocks.prisma.loiDraft.deleteMany).not.toHaveBeenCalled();
  });

  it("caps canonical history and pages older revisions in ascending display order", async () => {
    const rows = Array.from({ length: 21 }, (_, index) => ({
      ...revision(),
      id: `revision-${21 - index}`,
      sequence: 21 - index,
    }));
    const row = { ...access(21, "AWAITING_SELLER_RESPONSE"), current_revision_id: rows[0]!.id };
    mocks.prisma.$queryRaw.mockResolvedValueOnce([row]);
    mocks.prisma.loiNegotiation.findUnique.mockResolvedValue({ ...negotiation(21, "AWAITING_SELLER_RESPONSE"), currentRevisionId: rows[0]!.id });
    mocks.prisma.loiRevision.findMany.mockResolvedValueOnce(rows);
    mocks.prisma.loiDraft.findUnique.mockResolvedValue(null);

    const canonical = await getLoiNegotiation(negotiationId);
    expect(canonical.revisions).toHaveLength(20);
    expect(canonical.revisions.map((item) => item.sequence)).toEqual(Array.from({ length: 20 }, (_, index) => index + 2));
    expect(canonical.revisionPageInfo).toEqual({ hasOlder: true, oldestSequence: 2 });

    mocks.prisma.$queryRaw.mockResolvedValueOnce([row]);
    mocks.prisma.loiNegotiation.findUnique.mockResolvedValue({ ...negotiation(21, "AWAITING_SELLER_RESPONSE"), currentRevisionId: rows[0]!.id });
    mocks.prisma.loiRevision.findMany.mockResolvedValueOnce(rows.slice(1));
    const page = await getLoiRevisionPage(negotiationId, 22);
    expect(page.revisions.map((item) => item.sequence)).toEqual(Array.from({ length: 20 }, (_, index) => index + 1));
    expect(page.pageInfo).toEqual({ hasOlder: false, oldestSequence: 1 });
  });
});
