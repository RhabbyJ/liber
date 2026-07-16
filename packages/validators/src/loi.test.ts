import { describe, expect, it } from "vitest";
import {
  calculateLoiPreview,
  calculateLoiSummary,
  loiActionIdSchema,
  loiDraftIdSchema,
  loiNegotiationIdSchema,
  loiRevisionIdSchema,
  loiTermsV1Schema,
  type LoiTermsV1,
} from "./loi";

const terms: LoiTermsV1 = {
  additionalTerms: { exclusions: "", proposedTerms: "" },
  costsAndCredits: { alternateClosingCostAllocation: "", customaryClosingCosts: true, homeWarranty: { company: "", included: false, maximumCents: 0, payer: "SELLER", payerNote: "" }, sellerCreditCents: 500_000, sellerCreditNote: "" },
  deposit: { basis: "PERCENT", percentageBps: 300 },
  funding: { downPaymentCents: 25_000_000, lender: { company: "Liber Test Bank", email: "", name: "", phone: "" }, loanType: "CONVENTIONAL", note: "", type: "FINANCED" },
  hoa: { certificateFeePayer: "NOT_APPLICABLE", documentFeePayer: "NOT_APPLICABLE", transferFeePayer: "NOT_APPLICABLE" },
  parties: { buyerContact: { company: "", email: "", name: "", phone: "" }, buyerLegalName: "Buyer LLC", vestingNote: "" },
  personalProperty: { excludedItems: "", included: false, includedItems: [] },
  possession: { type: "AT_CLOSING" },
  providers: { escrow: { choice: "LIBER_PREFERRED" }, title: { choice: "LIBER_PREFERRED" } },
  purchasePriceCents: 100_000_000,
  representation: { agent: { company: "", email: "", name: "", phone: "" }, buyerRepresented: false },
  schemaVersion: 1,
  timing: { appraisalContingencyDays: 17, closingDays: 30, inspectionContingencyDays: 10, loanContingencyDays: 21, sellerDisclosureReviewDays: 7, titleReviewDays: 7 },
};

describe("LOI terms", () => {
  it("calculates canonical financed summaries in integer cents and basis points", () => {
    expect(calculateLoiSummary(terms)).toEqual({
      calculationVersion: 1,
      earnestMoneyBps: 300,
      earnestMoneyCents: 3_000_000,
      effectivePriceAfterSellerCreditCents: 99_500_000,
      loanAmountCents: 75_000_000,
      loanToValueBps: 7_500,
      remainingDownPaymentAfterDepositCents: 22_000_000,
    });
  });

  it("rejects unknown keys and contradictory financed terms", () => {
    expect(loiTermsV1Schema.safeParse({ ...terms, surprise: true }).success).toBe(false);
    expect(loiTermsV1Schema.safeParse({ ...terms, funding: { ...terms.funding, downPaymentCents: 100_000_001 } }).success).toBe(false);
  });

  it("derives the percentage for a fixed deposit with half-up rounding", () => {
    expect(calculateLoiSummary({ ...terms, deposit: { amountCents: 3_333_333, basis: "FIXED" } }).earnestMoneyBps).toBe(333);
  });

  it("keeps the financial preview live while unrelated required fields are incomplete", () => {
    const incomplete = structuredClone(terms) as unknown as LoiTermsV1;
    if (incomplete.funding.type !== "FINANCED") throw new Error("Expected financed fixture.");
    incomplete.funding.lender = { company: "", email: "invalid", name: "", phone: "" };
    expect(loiTermsV1Schema.safeParse(incomplete).success).toBe(false);
    expect(calculateLoiPreview(incomplete)).toMatchObject({
      earnestMoneyCents: 3_000_000,
      loanAmountCents: 75_000_000,
    });
    expect(calculateLoiPreview({ ...incomplete, funding: { ...incomplete.funding, downPaymentCents: incomplete.purchasePriceCents + 1 } })).toBeNull();
  });

  it("rejects hidden or incoherent material terms", () => {
    expect(loiTermsV1Schema.safeParse({ ...terms, deposit: { amountCents: terms.purchasePriceCents + 1, basis: "FIXED" } }).success).toBe(false);
    expect(loiTermsV1Schema.safeParse({ ...terms, funding: { note: "unstructured", type: "OTHER" } }).success).toBe(false);
    expect(loiTermsV1Schema.safeParse({ ...terms, personalProperty: { excludedItems: "", included: true, includedItems: [] } }).success).toBe(false);
    expect(loiTermsV1Schema.safeParse({ ...terms, personalProperty: { excludedItems: "", included: true, includedItems: ["   "] } }).success).toBe(false);
  });

  it("rejects ambiguous conditional terms and hidden values", () => {
    expect(loiTermsV1Schema.safeParse({ ...terms, funding: { type: "CASH" } }).success).toBe(false);
    expect(loiTermsV1Schema.safeParse({ ...terms, possession: { daysAfterClosing: 0, type: "DAYS_AFTER_CLOSING" } }).success).toBe(false);
    expect(loiTermsV1Schema.safeParse({ ...terms, possession: { amountCents: 0, days: 0, frequency: "DAILY", type: "SELLER_RENT_BACK" } }).success).toBe(false);
    expect(loiTermsV1Schema.safeParse({ ...terms, possession: { estoppelRequired: false, note: "", type: "TENANT_REMAINS" } }).success).toBe(false);
    expect(loiTermsV1Schema.safeParse({ ...terms, costsAndCredits: { ...terms.costsAndCredits, customaryClosingCosts: false } }).success).toBe(false);
    expect(loiTermsV1Schema.safeParse({
      ...terms,
      costsAndCredits: {
        ...terms.costsAndCredits,
        homeWarranty: { company: "Warranty Co", included: true, maximumCents: 50_000, payer: "OTHER", payerNote: "" },
      },
    }).success).toBe(false);
    expect(loiTermsV1Schema.safeParse({ ...terms, representation: { agent: { company: "Hidden", email: "", name: "", phone: "" }, buyerRepresented: false } }).success).toBe(false);
  });

  it("returns precise paths for material aggregate validation failures", () => {
    const warranty = loiTermsV1Schema.safeParse({
      ...terms,
      costsAndCredits: {
        ...terms.costsAndCredits,
        homeWarranty: { company: "Warranty Co", included: true, maximumCents: 0, payer: "SELLER", payerNote: "" },
      },
    });
    expect(warranty.success ? [] : warranty.error.issues.map((issue) => issue.path.join("."))).toContain("costsAndCredits.homeWarranty.maximumCents");

    const agent = loiTermsV1Schema.safeParse({
      ...terms,
      representation: { agent: { company: "Brokerage", email: "", name: "Agent Name", phone: "" }, buyerRepresented: true },
    });
    expect(agent.success ? [] : agent.error.issues.map((issue) => issue.path.join("."))).toContain("representation.agent.email");

    const sellerFinancing = loiTermsV1Schema.safeParse({
      ...terms,
      funding: {
        amortizationMonths: 360,
        annualInterestBps: 600,
        balloonMonth: null,
        cashDownPaymentCents: terms.purchasePriceCents,
        interestOnly: false,
        note: "",
        principalCents: 0,
        termMonths: 120,
        type: "SELLER_FINANCING",
      },
    });
    expect(sellerFinancing.success ? [] : sellerFinancing.error.issues.map((issue) => issue.path.join("."))).toContain("funding.cashDownPaymentCents");
  });

  it("canonicalizes every LOI UUID boundary to lowercase", () => {
    const uppercase = "AAAAAAAA-AAAA-4AAA-8AAA-AAAAAAAAAAAA";
    const lowercase = uppercase.toLowerCase();
    for (const schema of [loiNegotiationIdSchema, loiRevisionIdSchema, loiDraftIdSchema, loiActionIdSchema]) {
      expect(schema.parse(`  ${uppercase}  `)).toBe(lowercase);
    }
  });
});
