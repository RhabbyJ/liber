import { calculateLoiSummary, type LoiTermsV1 } from "@liber/validators";
import type { LoiNegotiation, LoiRevision } from "./loi-types";

export const cashTerms: LoiTermsV1 = {
  additionalTerms: { exclusions: "", proposedTerms: "" },
  costsAndCredits: {
    alternateClosingCostAllocation: "",
    customaryClosingCosts: true,
    homeWarranty: { company: "", included: false, maximumCents: 0, payer: "SELLER", payerNote: "" },
    sellerCreditCents: 0,
    sellerCreditNote: "",
  },
  deposit: { basis: "PERCENT", percentageBps: 300 },
  funding: { type: "CASH" },
  hoa: { certificateFeePayer: "NOT_APPLICABLE", documentFeePayer: "NOT_APPLICABLE", transferFeePayer: "NOT_APPLICABLE" },
  parties: { buyerContact: { company: "", email: "buyer@example.test", name: "Buyer Test", phone: "" }, buyerLegalName: "Buyer Test LLC", vestingNote: "" },
  personalProperty: { excludedItems: "", included: false, includedItems: [] },
  possession: { type: "AT_CLOSING" },
  providers: { escrow: { choice: "LIBER_PREFERRED" }, title: { choice: "LIBER_PREFERRED" } },
  purchasePriceCents: 100_000_000,
  representation: { agent: { company: "", email: "", name: "", phone: "" }, buyerRepresented: false },
  schemaVersion: 1,
  timing: { appraisalContingencyDays: 17, closingDays: 30, inspectionContingencyDays: 10, loanContingencyDays: null, sellerDisclosureReviewDays: 7, titleReviewDays: 7 },
};

export const financedTerms: LoiTermsV1 = {
  ...cashTerms,
  funding: {
    downPaymentCents: 25_000_000,
    lender: { company: "Liber Test Bank", email: "lender@example.test", name: "", phone: "" },
    loanType: "CONVENTIONAL",
    note: "",
    type: "FINANCED",
  },
  timing: { ...cashTerms.timing, loanContingencyDays: 21 },
};

export function revision(sequence: number, terms: LoiTermsV1 = cashTerms): LoiRevision {
  return {
    computedSummary: calculateLoiSummary(terms),
    id: `00000000-0000-4000-8000-${String(sequence).padStart(12, "0")}`,
    kind: sequence === 1 ? "INITIAL" : "COUNTER",
    responseDeadline: "2026-08-01T19:00:00.000Z",
    sequence,
    submittedAt: `2026-07-${String(15 + sequence).padStart(2, "0")}T19:00:00.000Z`,
    submittedByRole: sequence % 2 ? "BUYER" : "SELLER",
    terms,
  };
}

export function negotiation(overrides: Partial<LoiNegotiation> = {}): LoiNegotiation {
  const revisions = overrides.revisions ?? [];
  return {
    allowedActions: ["EDIT", "SUBMIT", "WITHDRAW"],
    conversationId: "10000000-0000-4000-8000-000000000000",
    currentSequence: revisions.at(-1)?.sequence ?? 0,
    draft: null,
    effectivelyExpired: false,
    id: "20000000-0000-4000-8000-000000000000",
    propertySnapshot: { addressLine1: "123 Test Street", location: "Los Angeles, CA", propertyIdentityVersion: 2 },
    revisionPageInfo: { hasOlder: false, oldestSequence: revisions.at(0)?.sequence ?? null },
    revisions,
    starterTerms: revisions.length ? null : cashTerms,
    status: revisions.length ? "AWAITING_SELLER_RESPONSE" : "AWAITING_BUYER_SUBMISSION",
    viewerRole: "BUYER",
    ...overrides,
  };
}
