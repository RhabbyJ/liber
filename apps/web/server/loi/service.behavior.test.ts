import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { calculateLoiSummary, loiTermsV1Schema, previewLoiCalculation, type LoiTermsV1 } from "@liber/validators";
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
  costsAndCredits: { alternateClosingCostAllocation: "", customaryClosingCosts: true, homeWarranty: { company: "", included: false, maximumCents: 0, payer: "SELLER", payerNote: "", specialInclusions: "" }, sellerCreditCents: 0, sellerCreditNote: "" },
  deposit: { basis: "PERCENT", percentageBps: 300 },
  disclosures: { condition: "", conditionsOfSale: "", deathOnProperty: "UNKNOWN" },
  funding: { type: "CASH" },
  hoa: { certificateFeePayer: "NOT_APPLICABLE", documentFeePayer: "NOT_APPLICABLE", transferFeePayer: "NOT_APPLICABLE" },
  parties: { buyerContact: { company: "", email: "buyer@example.test", name: "Buyer Test", phone: "" }, buyerLegalName: "Buyer Test", vestingNote: "" },
  personalProperty: { excludedItems: "", included: false, includedItems: [], payer: "SELLER" },
  possession: { type: "AT_CLOSING" },
  providers: { escrow: { choice: "LIBER_PREFERRED", feePayer: "SELLER" }, title: { choice: "LIBER_PREFERRED" } },
  purchasePriceCents: 100_000_000,
  representation: { agent: { company: "", email: "", license: "", name: "", phone: "" }, buyerRepresented: false, commissionAmount: "", commissionPayer: null },
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

function stubSubmission(savedTerms: LoiTermsV1, evidence = { badge_active: false, document_uploaded: false }) {
  const row = access();
  mocks.prisma.$queryRaw.mockImplementation(async (query: TemplateStringsArray | { strings: TemplateStringsArray }) => {
    const sql = (Array.isArray(query) ? query : (query as { strings: TemplateStringsArray }).strings).join("");
    return sql.includes("AS badge_active") ? [evidence] : [row];
  });
  mocks.prisma.loiDraft.findUnique.mockResolvedValueOnce({ basedOnSequence: 0, draftVersion: 1, id: draftId, terms: savedTerms }).mockResolvedValue(null);
  let submitted = revision();
  mocks.prisma.loiRevision.create.mockImplementation(async ({ data }) => {
    submitted = { ...submitted, ...data, id: revisionId };
    return submitted;
  });
  mocks.prisma.loiEvent.create.mockImplementation(async ({ data }) => ({ ...data, id: eventId }));
  mocks.prisma.loiNegotiation.findUnique.mockResolvedValue(negotiation(1, "AWAITING_SELLER_RESPONSE"));
  mocks.prisma.loiRevision.findMany.mockImplementation(async () => [submitted]);
}

const submitRequest = { clientActionId: actionId, expectedDraftId: draftId, expectedDraftVersion: 1, expectedSequence: 0, negotiationId };

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

  afterEach(() => { vi.unstubAllEnvs(); vi.useRealTimers(); });

  it.each([0, 2])("saves and reloads a blank-price private draft but blocks submission at sequence %s", async (sequence) => {
    const row = access(sequence, sequence ? "AWAITING_BUYER_RESPONSE" : "AWAITING_BUYER_SUBMISSION");
    mocks.prisma.$queryRaw.mockImplementation(async (query: TemplateStringsArray | { strings: TemplateStringsArray }) => {
      const sql = (Array.isArray(query) ? query : (query as { strings: TemplateStringsArray }).strings).join("");
      return sql.includes('SELECT "draftVersion"') ? [] : [row];
    });
    const current = { ...revision(), sequence, submittedByRole: "SELLER", terms };
    mocks.prisma.loiRevision.findUnique.mockResolvedValue(current);
    mocks.prisma.loiRevision.findMany.mockResolvedValue(sequence ? [current] : []);
    mocks.prisma.loiNegotiation.findUnique.mockResolvedValue(negotiation(sequence, row.negotiation_status));
    let savedDraft: Record<string, unknown> | null = null;
    mocks.prisma.loiDraft.create.mockImplementation(async ({ data }) => {
      savedDraft = { ...data, id: draftId, updatedAt: new Date("2026-10-07T17:00:00Z") };
      return savedDraft;
    });
    mocks.prisma.loiDraft.findUnique.mockImplementation(async () => savedDraft);
    const result = await saveLoiDraft({ expectedDraftVersion: 0, expectedSequence: sequence, negotiationId, terms: { ...terms, purchasePriceCents: 0 } });
    expect(result.draft?.terms.purchasePriceCents).toBe(0);
    expect(result.preview).toBeNull();
    expect((await getLoiNegotiation(negotiationId)).draft?.terms.purchasePriceCents).toBe(0);
    await expect(submitLoiRevision({ clientActionId: actionId, expectedDraftId: draftId, expectedDraftVersion: 1, expectedSequence: sequence, negotiationId })).rejects.toMatchObject({ issues: expect.arrayContaining([expect.objectContaining({ path: ["purchasePriceCents"] })]) });
    expect(mocks.prisma.loiRevision.create).not.toHaveBeenCalled();
    expect(mocks.prisma.notification.create).not.toHaveBeenCalled();
    const priced = await saveLoiDraft({ expectedDraftVersion: 0, expectedSequence: sequence, negotiationId, terms });
    expect(priced.draft?.terms.purchasePriceCents).toBe(terms.purchasePriceCents);
    expect(priced.preview).not.toBeNull();
  });


  it.each(["BUYER", "SELLER"] as const)("preserves independent escrow/title estimates and calculates a %s counter with version 3", async (role) => {
    const sequence = role === "BUYER" ? 2 : 1;
    const status = role === "BUYER" ? "AWAITING_BUYER_RESPONSE" : "AWAITING_SELLER_RESPONSE";
    const estimates = { buyerEscrowCents: null, sellerEscrowCents: 300_000, buyerTitleInsuranceCents: 200_000, sellerTitleInsuranceCents: null, buyerOtherClosingCostsCents: 0, sellerOtherClosingCostsCents: 0, sellerAgentCommissionAmount: "0", note: "Synthetic quote", itemizedCosts: { transferTaxes: { amountCents: 0 }, governmentRetrofit: { amountCents: 0 } } };
    const next = { ...terms, providers: { ...terms.providers, title: { choice: "CUSTOM" as const, company: { name: "Changed provider", company: "", email: "", phone: "" }, feePayer: "BUYER" as const } }, costsAndCredits: { ...terms.costsAndCredits, closingCostEstimates: estimates } };
    const row = access(sequence, status);
    mocks.getSessionUser.mockResolvedValue({ id: role === "BUYER" ? buyerId : sellerId, roles: [role] });
    mocks.prisma.$queryRaw.mockImplementation(async (query: TemplateStringsArray | { strings: TemplateStringsArray }) => {
      const sql = (Array.isArray(query) ? query : (query as { strings: TemplateStringsArray }).strings).join("");
      return sql.includes('SELECT "draftVersion"') ? [] : [row];
    });
    const current = { ...revision(), sequence, submittedByRole: role === "BUYER" ? "SELLER" : "BUYER", terms };
    mocks.prisma.loiRevision.findUnique.mockResolvedValue(current);
    mocks.prisma.loiRevision.findMany.mockResolvedValue([current]);
    mocks.prisma.loiNegotiation.findUnique.mockResolvedValue(negotiation(sequence, status));
    mocks.prisma.loiDraft.findUnique.mockResolvedValue(null);
    const result = await saveLoiDraft({ expectedDraftVersion: 0, expectedSequence: sequence, negotiationId, terms: next });
    expect(mocks.prisma.loiDraft.create.mock.calls[0]![0].data.terms.costsAndCredits.closingCostEstimates).toEqual(estimates);
    expect(mocks.prisma.loiDraft.create.mock.calls[0]![0].data.terms.providers.title).toEqual({ ...terms.providers.title, feePayer: "BUYER" });
    expect(result.preview).toMatchObject({ calculationVersion: 6, buyerClosingCostsCents: 200_000, sellerClosingCostsCents: 300_000, closingCostEstimateComplete: true });
  });

  it("does not let an initial buyer submission author or forge attribution for the seller disclosure", async () => {
    stubSubmission({ ...terms, disclosures: { ...terms.disclosures, deathOnProperty: "YES", deathOnPropertyProvidedBy: "SELLER" } });
    await submitLoiRevision(submitRequest);
    const saved = mocks.prisma.loiRevision.create.mock.calls[0]![0].data;
    expect(saved.terms.disclosures).toEqual({ ...terms.disclosures, deathOnProperty: "UNKNOWN" });
    expect(saved.calculationVersion).toBe(6);
    expect(saved.computedSummary.calculationVersion).toBe(6);
  });

  it.each(["BUYER", "SELLER"] as const)("enforces server-authored disclosure ownership for a %s counter draft", async (role) => {
    const sequence = role === "BUYER" ? 2 : 1;
    const status = role === "BUYER" ? "AWAITING_BUYER_RESPONSE" : "AWAITING_SELLER_RESPONSE";
    const base: LoiTermsV1 = { ...terms, disclosures: { ...terms.disclosures, deathOnProperty: "NO", deathOnPropertyProvidedBy: "SELLER" } };
    const estimates = { buyerEscrowCents: null, sellerEscrowCents: 200_00, buyerTitleInsuranceCents: 0, sellerTitleInsuranceCents: 300_00, buyerOtherClosingCostsCents: 0, sellerOtherClosingCostsCents: 0, sellerAgentCommissionAmount: "0", note: "Estimate" };
    const next = { ...base, disclosures: { ...base.disclosures, deathOnProperty: "YES" }, costsAndCredits: { ...base.costsAndCredits, closingCostEstimates: estimates } };
    const row = access(sequence, status);
    mocks.getSessionUser.mockResolvedValue({ id: role === "BUYER" ? buyerId : sellerId, roles: [role] });
    mocks.prisma.$queryRaw.mockImplementation(async (query: TemplateStringsArray | { strings: TemplateStringsArray }) => {
      const sql = (Array.isArray(query) ? query : (query as { strings: TemplateStringsArray }).strings).join("");
      return sql.includes('SELECT "draftVersion"') ? [] : [row];
    });
    const current = { ...revision(), sequence, submittedByRole: role === "BUYER" ? "SELLER" : "BUYER", terms: base };
    mocks.prisma.loiRevision.findUnique.mockResolvedValue(current);
    mocks.prisma.loiRevision.findMany.mockResolvedValue([current]);
    mocks.prisma.loiNegotiation.findUnique.mockResolvedValue(negotiation(sequence, status));
    mocks.prisma.loiDraft.findUnique.mockResolvedValue(null);
    const result = await saveLoiDraft({ expectedDraftVersion: 0, expectedSequence: sequence, negotiationId, terms: next });
    const saved = mocks.prisma.loiDraft.create.mock.calls[0]![0].data.terms;
    expect(saved.disclosures).toMatchObject({ deathOnProperty: role === "BUYER" ? "NO" : "YES", deathOnPropertyProvidedBy: "SELLER" });
    expect(saved.costsAndCredits.closingCostEstimates).toEqual(estimates);
    expect(result.preview).toMatchObject({ calculationVersion: 6, sellerClosingCostsCents: 500_00, closingCostEstimateComplete: false });
  });

  it("rechecks a saved buyer counter against the seller's immutable answer during submission", async () => {
    const row = access(2, "AWAITING_BUYER_RESPONSE");
    const base: LoiTermsV1 = { ...terms, disclosures: { ...terms.disclosures, deathOnProperty: "YES", deathOnPropertyProvidedBy: "SELLER" } };
    const current = { ...revision(), sequence: 2, submittedByRole: "SELLER", terms: base };
    mocks.prisma.$queryRaw.mockResolvedValue([row]);
    mocks.prisma.loiDraft.findUnique.mockResolvedValueOnce({ basedOnSequence: 2, draftVersion: 1, id: draftId, terms: { ...base, disclosures: { ...base.disclosures, deathOnProperty: "NO" } } }).mockResolvedValue(null);
    mocks.prisma.loiRevision.findUnique.mockResolvedValue(current);
    mocks.prisma.loiRevision.findMany.mockResolvedValue([current]);
    mocks.prisma.loiRevision.create.mockImplementation(async ({ data }) => ({ ...data, id: revisionId }));
    mocks.prisma.loiEvent.create.mockImplementation(async ({ data }) => ({ ...data, id: eventId }));
    mocks.prisma.loiNegotiation.findUnique.mockResolvedValue(negotiation(2, "AWAITING_BUYER_RESPONSE"));
    await submitLoiRevision({ ...submitRequest, expectedSequence: 2 });
    expect(mocks.prisma.loiRevision.create.mock.calls[0]![0].data.terms.disclosures).toEqual(base.disclosures);
  });

  it("persists scheduled transfer taxes and seller ULA on a submitted revision", async () => {
    const next: LoiTermsV1 = {...terms, purchasePriceCents: 600_000_000, funding: {type: "CASH"}, timing: {...terms.timing, loanContingencyDays: null}, costsAndCredits: {...terms.costsAndCredits, transferTaxSchedule: "LA_CITY_2026_2027"}};
    stubSubmission(next);
    await submitLoiRevision(submitRequest);
    const saved=mocks.prisma.loiRevision.create.mock.calls[0]![0].data;
    expect(saved.calculationVersion).toBe(6);
    expect(saved.computedSummary).toMatchObject({transferTaxSchedule:"LA_CITY_2026_2027",laCountyTransferTaxCents:660_000,laCityTransferTaxCents:2_700_000,measureUlaCents:24_000_000,measureUlaRateBps:400,buyerTransferTaxCents:0,sellerTransferTaxCents:27_360_000});
  });

  it("sets a new submission deadline exactly 48 hours after the server submission time", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-25T10:00:00.000Z"));
    stubSubmission(terms);

    const result = await submitLoiRevision({ ...submitRequest, responseDeadline: "2030-01-01T00:00:00.000Z" });
    expect(result.revisions[0]).toMatchObject({ responseDeadline: "2026-09-27T10:00:00.000Z", submittedAt: "2026-09-25T10:00:00.000Z" });
    expect(mocks.prisma.loiEvent.create.mock.calls[0]![0].data.metadata).toMatchObject({ responseWindowHours: 48 });
  });

  it("keeps automatic-deadline retries stable across elapsed time without duplicate effects", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-25T10:00:00.000Z"));
    stubSubmission(terms);
    await submitLoiRevision(submitRequest);
    const committedEvent = mocks.prisma.loiEvent.create.mock.calls[0]![0].data;
    mocks.prisma.loiEvent.findUnique.mockResolvedValue(committedEvent);
    vi.setSystemTime(new Date("2026-09-25T11:00:00.000Z"));

    const retried = await submitLoiRevision(submitRequest);
    expect(retried.revisions[0]?.responseDeadline).toBe("2026-09-27T10:00:00.000Z");
    expect(mocks.prisma.loiRevision.create).toHaveBeenCalledTimes(1);
    expect(mocks.prisma.notification.create).toHaveBeenCalledTimes(1);
    expect(mocks.prisma.emailOutbox.create).toHaveBeenCalledTimes(1);
    await expect(submitLoiRevision({ ...submitRequest, expectedDraftVersion: 2 })).rejects.toMatchObject({ code: "CONFLICT" });
  });

  describe.each(["CONVENTIONAL", "FHA", "REHAB", "OTHER"] as const)("%s loan submissions", (loanType) => {
    it.each([
      { badge_active: true, document_uploaded: false },
      { badge_active: false, document_uploaded: true },
      { badge_active: true, document_uploaded: true },
    ])("allows financed submission with either eligible evidence source: %j", async (evidence) => {
      const financed: LoiTermsV1 = { ...terms, funding: { downPaymentCents: 20_000_000, lender: { company: "Test lender", email: "lender@example.test", name: "", phone: "" }, loanType, note: loanType === "OTHER" ? "Bridge loan" : "", type: "FINANCED" } };
      stubSubmission(financed, evidence);
      const result = await submitLoiRevision(submitRequest);
      expect(mocks.prisma.loiRevision.create).toHaveBeenCalledTimes(1);
      expect(mocks.prisma.loiRevision.create.mock.calls[0]![0].data.computedSummary.loanAmountCents).toBe(80_000_000);
      expect(result).toMatchObject({ currentSequence: 1, status: "AWAITING_SELLER_RESPONSE", draft: null });
      expect(result.revisions[0]?.terms.funding).toEqual(financed.funding);
    });
  });

  it.each(["CONVENTIONAL", "OTHER"] as const)("rejects a %s financed submission with neither eligible evidence source before creating a revision", async (loanType) => {
    stubSubmission({ ...terms, funding: { downPaymentCents: 20_000_000, lender: { company: "Test lender", email: "", name: "", phone: "" }, loanType, note: loanType === "OTHER" ? "Bridge loan" : "", type: "FINANCED" } });
    await expect(submitLoiRevision(submitRequest)).rejects.toMatchObject({ code: "FINANCING_EVIDENCE_REQUIRED", status: 400 });
    expect(mocks.prisma.loiRevision.create).not.toHaveBeenCalled();
    expect(mocks.prisma.notification.create).not.toHaveBeenCalled();
  });

  it("requires lender information even when a financing badge is available", async () => {
    stubSubmission({ ...terms, funding: { downPaymentCents: 20_000_000, lender: { company: "", email: "", name: "", phone: "" }, loanType: "CONVENTIONAL", note: "", type: "FINANCED" } }, { badge_active: true, document_uploaded: false });
    await expect(submitLoiRevision(submitRequest)).rejects.toMatchObject({ issues: expect.arrayContaining([expect.objectContaining({ path: ["funding", "lender"] })]) });
    expect(mocks.prisma.loiRevision.create).not.toHaveBeenCalled();
  });

  it("submits a financed test LOI without evidence only under an exact active exception and records its expiry", async () => {
    const expiry = new Date(Date.now() + 86_400_000).toISOString();
    vi.stubEnv("LIBER_LOI_TEST_FINANCING_BUYER_ID", buyerId);
    vi.stubEnv("LIBER_LOI_TEST_FINANCING_NEGOTIATION_ID", negotiationId);
    vi.stubEnv("LIBER_LOI_TEST_FINANCING_EXPIRES_AT", expiry);
    stubSubmission({ ...terms, funding: { downPaymentCents: 20_000_000, lender: { company: "Test lender", email: "", name: "", phone: "" }, loanType: "CONVENTIONAL", note: "", type: "FINANCED" } });
    const result = await submitLoiRevision(submitRequest);
    expect(result).toMatchObject({ status: "AWAITING_SELLER_RESPONSE", currentSequence: 1, financingEvidenceExceptionExpiresAt: expiry });
    expect(mocks.prisma.loiEvent.create.mock.calls[0]![0].data.metadata.financingEvidenceExceptionExpiresAt).toBe(expiry);
  });

  it.each(["expired", "other-buyer", "other-loi"])("rejects missing financing evidence with an %s exception", async (reason) => {
    vi.stubEnv("LIBER_LOI_TEST_FINANCING_BUYER_ID", reason === "other-buyer" ? sellerId : buyerId);
    vi.stubEnv("LIBER_LOI_TEST_FINANCING_NEGOTIATION_ID", reason === "other-loi" ? conversationId : negotiationId);
    vi.stubEnv("LIBER_LOI_TEST_FINANCING_EXPIRES_AT", new Date(Date.now() + (reason === "expired" ? -1 : 86_400_000)).toISOString());
    stubSubmission({ ...terms, funding: { downPaymentCents: 20_000_000, lender: { company: "Test lender", email: "", name: "", phone: "" }, loanType: "CONVENTIONAL", note: "", type: "FINANCED" } });
    await expect(submitLoiRevision(submitRequest)).rejects.toMatchObject({ code: "FINANCING_EVIDENCE_REQUIRED" });
    expect(mocks.prisma.loiRevision.create).not.toHaveBeenCalled();
  });

  it.each([360, null])("recalculates seller-financed counter principal and preserves historical funding schedule %j", async (amortizationMonths) => {
    const base: LoiTermsV1 = {
      ...terms,
      funding: { amortizationMonths, annualInterestBps: 600, balloonMonth: null, cashDownPaymentCents: 20_000_000, interestOnly: false, note: "Original financing", principalCents: 80_000_000, termMonths: 360, type: "SELLER_FINANCING" },
      possession: { estoppelRequired: true, note: "Existing lease remains.", type: "TENANT_REMAINS" },
    };
    const next: LoiTermsV1 = {
      ...base,
      costsAndCredits: { ...base.costsAndCredits, customaryClosingCosts: false, closingCostPayers: { transferTaxes: "SELLER", governmentRetrofitItems: "BUYER" }, sellerCreditIncluded: true, sellerCreditCents: 500_00 },
      funding: { ...base.funding as Extract<LoiTermsV1["funding"], { type: "SELLER_FINANCING" }>, annualInterestBps: 900, principalCents: 90_000_000 },
      hoa: { certificateFeePayer: "BUYER", documentFeePayer: "SELLER", transferFeePayer: "BUYER" },
      parties: { ...base.parties, buyerLegalName: "Changed buyer" },
      possession: { estoppelRequired: false, note: "Changed tenant detail", type: "TENANT_REMAINS" },
      purchasePriceCents: 110_000_000,
      timing: { ...base.timing, closingDays: 45 },
    };
    const row = access(1, "AWAITING_SELLER_RESPONSE");
    mocks.getSessionUser.mockResolvedValue({ id: sellerId, roles: ["SELLER"] });
    mocks.prisma.$queryRaw.mockImplementation(async (query: TemplateStringsArray | { strings: TemplateStringsArray }) => {
      const sql = (Array.isArray(query) ? query : (query as { strings: TemplateStringsArray }).strings).join("");
      return sql.includes('SELECT "draftVersion"') ? [] : [row];
    });
    mocks.prisma.loiRevision.findUnique.mockResolvedValue({ ...revision(), terms: base });
    mocks.prisma.loiRevision.findMany.mockResolvedValue([{ ...revision(), terms: base }]);
    mocks.prisma.loiNegotiation.findUnique.mockResolvedValue(negotiation(1, "AWAITING_SELLER_RESPONSE"));
    mocks.prisma.loiDraft.findUnique.mockResolvedValue(null);

    await saveLoiDraft({ expectedDraftVersion: 0, expectedSequence: 1, negotiationId, terms: next });
    const saved = mocks.prisma.loiDraft.create.mock.calls[0]![0].data.terms;
    expect(saved.purchasePriceCents).toBe(110_000_000);
    expect(saved.funding).toEqual({ ...base.funding, principalCents: 90_000_000 });
    expect(saved.costsAndCredits).toMatchObject({ closingCostPayers: next.costsAndCredits.closingCostPayers, sellerCreditIncluded: true, sellerCreditCents: 500_00 });
    expect(saved.parties).toEqual(base.parties);
    expect(saved.possession).toEqual(base.possession);
    expect(saved.hoa).toEqual(next.hoa);
    expect(saved.timing.closingDays).toBe(45);
  });

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

  it("does not replace effective expiry with a read-only eligibility outcome", async () => {
    const row = {
      ...access(1, "AWAITING_BUYER_RESPONSE"),
      current_response_deadline: new Date(Date.now() - 1),
      property_ready: false,
    };
    mocks.prisma.$queryRaw
      .mockResolvedValueOnce([row])
      .mockResolvedValueOnce([{ locked: true }])
      .mockResolvedValueOnce([{ id: row.invite_id }])
      .mockResolvedValueOnce([{ id: row.conversation_id }])
      .mockResolvedValueOnce([{ id: negotiationId }])
      .mockResolvedValueOnce([row]);

    await expect(saveLoiDraft({ expectedDraftVersion: 0, expectedSequence: 1, negotiationId, terms })).rejects.toMatchObject({ code: "UNAVAILABLE" });
    expect(mocks.prisma.loiNegotiation.update).not.toHaveBeenCalled();
    expect(mocks.prisma.loiEvent.create).not.toHaveBeenCalled();
    expect(mocks.prisma.loiDraft.deleteMany).not.toHaveBeenCalled();
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

  it.each([2, 3, 4, 5, 6] as const)("reads a stored calculation version %s without recomputing its cash amounts", async (version) => {
    const computed = calculateLoiSummary(terms);
    const v3OnlyKeys = new Set(["buyerHomeWarrantyCents", "sellerHomeWarrantyCents", "buyerItemizedCostsCents", "sellerItemizedCostsCents", "rentBackAtClosingCents", "monthlyRentBackCents"]);
    const v4OnlyKeys = new Set(["escrowFeePerSideCents", "buyerEscrowCents", "sellerEscrowCents"]);
    const v5OnlyKeys = new Set(["transferTaxSchedule", "laCountyTransferTaxCents", "laCityTransferTaxCents", "measureUlaCents", "measureUlaRateBps", "buyerTransferTaxCents", "sellerTransferTaxCents"]);
    const v6OnlyKeys = new Set(["titlePolicyEstimateCents", "miscClosingCostEstimateCents", "buyerTitleInsuranceCents", "sellerTitleInsuranceCents", "buyerOtherClosingCostsCents", "sellerOtherClosingCostsCents", "buyerClosingCostEstimateComplete", "sellerClosingCostEstimateComplete"]);
    const v5 = Object.fromEntries(Object.entries(computed).filter(([key]) => !v6OnlyKeys.has(key)));
    const v4 = Object.fromEntries(Object.entries(v5).filter(([key]) => !v5OnlyKeys.has(key)));
    const v3 = Object.fromEntries(Object.entries(v4).filter(([key]) => !v4OnlyKeys.has(key)));
    const v2 = Object.fromEntries(Object.entries(v3).filter(([key]) => !v3OnlyKeys.has(key)));
    const stored = { ...(version === 2 ? v2 : version === 3 ? v3 : version === 4 ? v4 : version === 5 ? v5 : computed), calculationVersion: version, buyerCashDueAtClosingCents: 12345, sellerCashBeforePayoffsCents: 67890 };
    mocks.prisma.$queryRaw.mockResolvedValueOnce([access(1, "AWAITING_SELLER_RESPONSE")]);
    mocks.prisma.loiNegotiation.findUnique.mockResolvedValue(negotiation(1, "AWAITING_SELLER_RESPONSE"));
    mocks.prisma.loiRevision.findMany.mockResolvedValue([{ ...revision(), calculationVersion: version, computedSummary: stored }]);
    mocks.prisma.loiDraft.findUnique.mockResolvedValue(null);
    const result = await getLoiNegotiation(negotiationId);
    expect(result.revisions[0]?.computedSummary).toEqual(stored);
  });

  it("negotiates warranty shares and itemized charges without changing the base warranty company", async () => {
    const base: LoiTermsV1 = { ...terms, costsAndCredits: { ...terms.costsAndCredits, homeWarranty: { ...terms.costsAndCredits.homeWarranty, included: true, maximumCents: 80000, company: "Fixture Warranty" } } };
    const next: LoiTermsV1 = { ...base, costsAndCredits: { ...base.costsAndCredits, homeWarranty: { ...base.costsAndCredits.homeWarranty, company: "Changed company", payer: "OTHER", payerNote: "Buyer 250 / seller 450", buyerShareCents: 25000, sellerShareCents: 45000 }, closingCostEstimates: { buyerEscrowCents: 0, sellerEscrowCents: 0, buyerTitleInsuranceCents: 0, sellerTitleInsuranceCents: 0, buyerOtherClosingCostsCents: 0, sellerOtherClosingCostsCents: 0, sellerAgentCommissionAmount: "0", note: "Fixture", itemizedCosts: { transferTaxes: { amountCents: 100000 }, governmentRetrofit: { amountCents: 0 } } } }, possession: { type: "SELLER_RENT_BACK", amountCents: 150000, days: 30, frequency: "THROUGH_ESCROW" } };
    const row = access(1, "AWAITING_SELLER_RESPONSE");
    mocks.getSessionUser.mockResolvedValue({ id: sellerId, roles: ["SELLER"] });
    mocks.prisma.$queryRaw.mockImplementation(async (query: TemplateStringsArray | { strings: TemplateStringsArray }) => (Array.isArray(query) ? query : (query as { strings: TemplateStringsArray }).strings).join("").includes('SELECT "draftVersion"') ? [] : [row]);
    const current = { ...revision(), terms: base };
    mocks.prisma.loiRevision.findUnique.mockResolvedValue(current);
    mocks.prisma.loiRevision.findMany.mockResolvedValue([current]);
    mocks.prisma.loiNegotiation.findUnique.mockResolvedValue(negotiation(1, "AWAITING_SELLER_RESPONSE"));
    mocks.prisma.loiDraft.findUnique.mockResolvedValue(null);
    const result = await saveLoiDraft({ expectedDraftVersion: 0, expectedSequence: 1, negotiationId, terms: next });
    expect(result.preview).toMatchObject({ calculationVersion: 6, buyerHomeWarrantyCents: 25000, sellerHomeWarrantyCents: 45000, sellerItemizedCostsCents: 100000, rentBackAtClosingCents: 150000, buyerClosingCostsCents: 25000, sellerClosingCostsCents: 295000, closingCostEstimateComplete: true });
    const saved = mocks.prisma.loiDraft.create.mock.calls[0]![0].data.terms;
    expect(saved.costsAndCredits.homeWarranty).toMatchObject({ company: "Fixture Warranty", payer: "OTHER", buyerShareCents: 25000, sellerShareCents: 45000 });
    expect(saved.costsAndCredits.closingCostEstimates.itemizedCosts).toEqual(next.costsAndCredits.closingCostEstimates!.itemizedCosts);
  });

  it("tells only the buyer whether their pre-approval evidence already satisfies financed terms", async () => {
    const row = access(1, "AWAITING_SELLER_RESPONSE");
    const stub = () => {
      mocks.prisma.loiNegotiation.findUnique.mockResolvedValue(negotiation(1, "AWAITING_SELLER_RESPONSE"));
      mocks.prisma.loiRevision.findMany.mockResolvedValue([revision()]);
      mocks.prisma.loiDraft.findUnique.mockResolvedValue(null);
    };
    stub();
    mocks.prisma.$queryRaw.mockResolvedValueOnce([row]).mockResolvedValueOnce([{ badge_active: true, document_uploaded: true }]);
    expect((await getLoiNegotiation(negotiationId)).buyerFinancingEvidence).toBe("BADGE");

    stub();
    mocks.prisma.$queryRaw.mockResolvedValueOnce([row]).mockResolvedValueOnce([{ badge_active: false, document_uploaded: true }]);
    expect((await getLoiNegotiation(negotiationId)).buyerFinancingEvidence).toBe("DOCUMENT");

    stub();
    mocks.getSessionUser.mockResolvedValue({ id: sellerId, roles: ["SELLER"] });
    mocks.prisma.$queryRaw.mockReset();
    mocks.prisma.$queryRaw.mockResolvedValueOnce([row]);
    expect((await getLoiNegotiation(negotiationId)).buyerFinancingEvidence).toBeNull();
    expect(mocks.prisma.$queryRaw).toHaveBeenCalledTimes(1);
  });

  it("exposes starter terms only for an eligible actionable initial negotiation", async () => {
    const row = { ...access(), property_price: { toString: () => "2000000" }, property_snapshot: { price: 1_000_000 } };
    mocks.prisma.$queryRaw.mockResolvedValueOnce([row]);
    mocks.prisma.loiNegotiation.findUnique.mockResolvedValue(negotiation(0, "AWAITING_BUYER_SUBMISSION"));
    mocks.prisma.loiRevision.findMany.mockResolvedValue([]);
    mocks.prisma.loiDraft.findUnique.mockResolvedValue(null);

    const result = await getLoiNegotiation(negotiationId);
    expect(result.starterTerms?.purchasePriceCents).toBe(100_000_000);
    expect(result.starterTerms?.providers.escrow.feePayer).toBe("EACH_OWN");
    expect(result.allowedActions).toContain("EDIT");

    const ineligible = { ...row, property_ready: false };
    mocks.prisma.$queryRaw.mockResolvedValueOnce([ineligible]);
    mocks.prisma.loiNegotiation.findUnique.mockResolvedValue(negotiation(0, "AWAITING_BUYER_SUBMISSION"));
    mocks.prisma.loiRevision.findMany.mockResolvedValue([]);
    mocks.prisma.loiDraft.findUnique.mockResolvedValue(null);
    const frozenRead = await getLoiNegotiation(negotiationId);
    expect(frozenRead).toMatchObject({ allowedActions: [], starterTerms: null, status: "READ_ONLY" });
  });

  it.each([0, "0", "", null, undefined])("opens an eligible LOI with missing asking price (%s), without inventing a price", async (price) => {
    const row = { ...access(), negotiation_id: null, negotiation_status: null, property_snapshot: { price } };
    mocks.prisma.$queryRaw.mockResolvedValue([row]);
    expect(await getLoiForConversation(conversationId)).toMatchObject({ available: true, canCreate: true });
    mocks.prisma.loiNegotiation.create.mockResolvedValue(negotiation(0, "AWAITING_BUYER_SUBMISSION"));
    mocks.prisma.loiNegotiation.findUnique.mockResolvedValue(negotiation(0, "AWAITING_BUYER_SUBMISSION"));
    mocks.prisma.loiRevision.findMany.mockResolvedValue([]);
    mocks.prisma.loiDraft.findUnique.mockResolvedValue(null);

    const result = await createLoiNegotiation({ clientActionId: actionId, inviteId: row.invite_id });
    expect(result).toMatchObject({ id: negotiationId, starterTerms: { purchasePriceCents: 0 } });
    expect(result.allowedActions).toContain("EDIT");
    expect(mocks.prisma.loiNegotiation.create.mock.calls[0]![0].data.propertySnapshot).toEqual({ price });
    expect(loiTermsV1Schema.safeParse(result.starterTerms).success).toBe(false);
    expect(previewLoiCalculation(result.starterTerms)).toBeNull();
    expect(loiTermsV1Schema.safeParse({ ...result.starterTerms, purchasePriceCents: 75_000_000 }).success).toBe(true);
  });

  it("fails closed before advertising or creating an invalid starter payload", async () => {
    const notStarted = { ...access(), negotiation_id: null, negotiation_status: null };
    const invalidRows = [
      { ...notStarted, property_snapshot: { price: 100_000_000.01 } },
      { ...notStarted, property_snapshot: { price: -1 } },
      { ...notStarted, property_snapshot: { price: "invalid" } },
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
