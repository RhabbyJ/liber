import { describe, expect, it } from "vitest";
import {
  calculateLoiPreview,
  previewLoiCalculation,
  calculateLoiCommissionCents,
  calculateLoiSummary,
  loiActionIdSchema,
  loiDraftIdSchema,
  loiEditableTermsV1Schema,
  parseLoiDraftTerms,
  loiCounterEditableTermsV1Schema,
  loiNegotiationIdSchema,
  loiRevisionIdSchema,
  loiTermsV1Schema,
  loiComputedSummaryV1Schema,
  loiComputedSummaryV2Schema,
  loiComputedSummaryV5Schema,
  submitLoiRevisionSchema,
  type LoiTermsV1,
} from "./loi";

const terms: LoiTermsV1 = {
  additionalTerms: { exclusions: "", proposedTerms: "" },
  costsAndCredits: { alternateClosingCostAllocation: "", customaryClosingCosts: true, homeWarranty: { company: "", included: false, maximumCents: 0, payer: "SELLER", payerNote: "", specialInclusions: "" }, sellerCreditCents: 500_000, sellerCreditNote: "" },
  deposit: { basis: "PERCENT", percentageBps: 300 },
  disclosures: { condition: "", conditionsOfSale: "", deathOnProperty: "UNKNOWN" },
  funding: { downPaymentCents: 25_000_000, lender: { company: "Liber Test Bank", email: "", name: "", phone: "" }, loanType: "CONVENTIONAL", note: "", type: "FINANCED" },
  hoa: { certificateFeePayer: "NOT_APPLICABLE", documentFeePayer: "NOT_APPLICABLE", transferFeePayer: "NOT_APPLICABLE" },
  parties: { buyerContact: { company: "", email: "", name: "", phone: "" }, buyerLegalName: "Buyer LLC", vestingNote: "" },
  personalProperty: { excludedItems: "", included: false, includedItems: [], payer: "SELLER" },
  possession: { type: "AT_CLOSING" },
  providers: { escrow: { choice: "LIBER_PREFERRED", feePayer: "SELLER" }, title: { choice: "LIBER_PREFERRED" } },
  purchasePriceCents: 100_000_000,
  representation: { agent: { company: "", email: "", license: "", name: "", phone: "" }, buyerRepresented: false, commissionAmount: "", commissionPayer: null },
  schemaVersion: 1,
  timing: { appraisalContingencyDays: 17, closingDays: 30, inspectionContingencyDays: 10, loanContingencyDays: 21, sellerDisclosureReviewDays: 7, titleReviewDays: 7 },
};

const completeCostTerms: LoiTermsV1 = {
  ...terms,
  costsAndCredits: {
    ...terms.costsAndCredits,
    closingCostEstimates: {
      buyerEscrowCents: null, sellerEscrowCents: 0,
      buyerTitleInsuranceCents: 0, sellerTitleInsuranceCents: 0,
      buyerOtherClosingCostsCents: 0, sellerOtherClosingCostsCents: 0,
      sellerAgentCommissionAmount: "0", note: "",
      itemizedCosts: { transferTaxes: { amountCents: 0 }, governmentRetrofit: { amountCents: 0 } },
    },
  },
};

describe("LOI itemized cash calculations", () => {
  it("keeps historical each-own warranty readable while rejecting it for editable drafts and counters", () => {
    const legacy: LoiTermsV1 = { ...completeCostTerms, costsAndCredits: { ...completeCostTerms.costsAndCredits, homeWarranty: { company: "Fixture", included: true, maximumCents: 60000, payer: "EACH_OWN", payerNote: "", specialInclusions: "", buyerShareCents: 20000, sellerShareCents: 40000 } } };
    expect(loiTermsV1Schema.safeParse(legacy).success).toBe(true);
    expect(calculateLoiSummary(legacy)).toMatchObject({ buyerHomeWarrantyCents: 20000, sellerHomeWarrantyCents: 40000 });
    for (const schema of [loiEditableTermsV1Schema, loiCounterEditableTermsV1Schema]) {
      const result = schema.safeParse(legacy);
      expect(result.success ? [] : result.error.issues.map((issue) => issue.path.join("."))).toContain("costsAndCredits.homeWarranty.payer");
    }
    for (const payer of ["BUYER", "SELLER", "OTHER"] as const) {
      expect(loiEditableTermsV1Schema.safeParse({ ...legacy, costsAndCredits: { ...legacy.costsAndCredits, homeWarranty: { ...legacy.costsAndCredits.homeWarranty, payer, payerNote: payer === "OTHER" ? "Buyer 200 / seller 400" : "" } } }).success).toBe(true);
    }
  });
  it.each(["BUYER", "SELLER"] as const)("charges the warranty maximum to %s and updates cash", (payer) => {
    const proposed: LoiTermsV1 = { ...completeCostTerms, costsAndCredits: { ...completeCostTerms.costsAndCredits, homeWarranty: { company: "Warranty Co", included: true, maximumCents: 85_000, payer, payerNote: "", specialInclusions: "" } } };
    const summary = calculateLoiSummary(proposed);
    expect(summary).toMatchObject({
      calculationVersion: 5,
      buyerHomeWarrantyCents: payer === "BUYER" ? 85_000 : 0,
      sellerHomeWarrantyCents: payer === "SELLER" ? 85_000 : 0,
      buyerCashDueAtClosingCents: 21_500_000 + (payer === "BUYER" ? 85_000 : 0),
      sellerCashBeforePayoffsCents: 99_500_000 - (payer === "SELLER" ? 85_000 : 0),
      closingCostEstimateComplete: true,
    });
    expect(calculateLoiPreview(proposed)).toEqual(summary);
  });

  it("updates the preview while the warranty company and unrelated details are incomplete", () => {
    const proposed = { ...completeCostTerms, costsAndCredits: { ...completeCostTerms.costsAndCredits, homeWarranty: { included: true, maximumCents: 60_000, payer: "BUYER", company: "", payerNote: "", specialInclusions: "" } } };
    expect(loiEditableTermsV1Schema.safeParse(proposed).success).toBe(false);
    expect(calculateLoiPreview(proposed)).toMatchObject({ buyerHomeWarrantyCents: 60_000, buyerCashDueAtClosingCents: 21_560_000 });
  });

  it("keeps a newly enabled warranty with an unfinished maximum incomplete without stopping the preview", () => {
    const proposed = { ...completeCostTerms, costsAndCredits: { ...completeCostTerms.costsAndCredits, homeWarranty: { included: true, maximumCents: 0, payer: "SELLER" } } };
    expect(calculateLoiPreview(proposed)).toMatchObject({ buyerHomeWarrantyCents: 0, sellerHomeWarrantyCents: 0, buyerCashDueAtClosingCents: 21_500_000, sellerCashBeforePayoffsCents: 99_500_000, closingCostEstimateComplete: false });
    expect(calculateLoiPreview({ ...proposed, costsAndCredits: { ...proposed.costsAndCredits, homeWarranty: { ...proposed.costsAndCredits.homeWarranty, maximumCents: 1 } } })).toMatchObject({ sellerHomeWarrantyCents: 1, closingCostEstimateComplete: true });
  });

  it.each(["EACH_OWN", "OTHER"] as const)("uses explicit warranty shares for %s without assuming a split", (payer) => {
    const warranty = { company: "Warranty Co", included: true, maximumCents: 100_000, payer, payerNote: payer === "OTHER" ? "Custom allocation" : "", specialInclusions: "" };
    const proposed: LoiTermsV1 = { ...completeCostTerms, costsAndCredits: { ...completeCostTerms.costsAndCredits, homeWarranty: warranty } };
    expect(calculateLoiSummary(proposed)).toMatchObject({ buyerHomeWarrantyCents: null, sellerHomeWarrantyCents: null, closingCostEstimateComplete: false });
    const withShares = { ...proposed, costsAndCredits: { ...proposed.costsAndCredits, homeWarranty: { ...warranty, buyerShareCents: 30_000, sellerShareCents: 60_000 } } };
    expect(calculateLoiSummary(withShares)).toMatchObject({ buyerHomeWarrantyCents: 30_000, sellerHomeWarrantyCents: 60_000, buyerClosingCostsCents: 30_000, sellerClosingCostsCents: 60_000, closingCostEstimateComplete: true });
    const partial = { ...withShares, costsAndCredits: { ...withShares.costsAndCredits, homeWarranty: { ...withShares.costsAndCredits.homeWarranty, sellerShareCents: null } } };
    expect(calculateLoiPreview(partial)).toMatchObject({ buyerHomeWarrantyCents: 30_000, sellerHomeWarrantyCents: null, closingCostEstimateComplete: false });
  });

  it("rejects warranty shares above the maximum on edits while keeping base stored parsing compatible", () => {
    const proposed = { ...completeCostTerms, costsAndCredits: { ...completeCostTerms.costsAndCredits, homeWarranty: { company: "Warranty Co", included: true, maximumCents: 100_000, payer: "EACH_OWN", payerNote: "", specialInclusions: "", buyerShareCents: 60_000, sellerShareCents: 60_000 } } };
    expect(loiTermsV1Schema.safeParse(proposed).success).toBe(true);
    const parsed = loiEditableTermsV1Schema.safeParse(proposed);
    expect(parsed.success ? [] : parsed.error.issues.map((issue) => issue.path.join("."))).toContain("costsAndCredits.homeWarranty.buyerShareCents");
    // The live preview keeps following the entered shares and reports the conflict at its field.
    expect(previewLoiCalculation(proposed)).toMatchObject({
      issues: [{ path: "costsAndCredits.homeWarranty.buyerShareCents" }],
      summary: { buyerHomeWarrantyCents: 60_000, sellerHomeWarrantyCents: 60_000 },
    });
  });

  it("ignores stale disabled warranty details in the preview", () => {
    expect(calculateLoiPreview({ ...completeCostTerms, costsAndCredits: { ...completeCostTerms.costsAndCredits, homeWarranty: { included: false, maximumCents: 75_000, payer: "BUYER", buyerShareCents: 15_000, sellerShareCents: 60_000 } } })).toMatchObject({ buyerHomeWarrantyCents: 0, sellerHomeWarrantyCents: 0, buyerClosingCostsCents: 0, sellerClosingCostsCents: 0 });
  });

  it("uses customary seller payers and exactly splits odd cents when explicitly chosen", () => {
    const estimates = { ...completeCostTerms.costsAndCredits.closingCostEstimates!, itemizedCosts: { transferTaxes: { amountCents: 101 }, governmentRetrofit: { amountCents: 99 } } };
    const customary = { ...completeCostTerms, costsAndCredits: { ...completeCostTerms.costsAndCredits, closingCostEstimates: estimates } };
    expect(calculateLoiSummary(customary)).toMatchObject({ buyerItemizedCostsCents: 0, sellerItemizedCostsCents: 200 });
    const split = { ...customary, costsAndCredits: { ...customary.costsAndCredits, customaryClosingCosts: false, closingCostPayers: { transferTaxes: "SPLIT_EQUALLY" as const, governmentRetrofitItems: "BUYER" as const } } };
    expect(calculateLoiSummary(split)).toMatchObject({ buyerItemizedCostsCents: 150, sellerItemizedCostsCents: 50, buyerCashDueAtClosingCents: 21_500_150, sellerCashBeforePayoffsCents: 99_499_950, closingCostEstimateComplete: true });
    expect(loiEditableTermsV1Schema.safeParse(split).success).toBe(true);
  });

  it("uses separate HOA estimates for Each own and ignores irrelevant totals", () => {
    const proposed: LoiTermsV1 = { ...completeCostTerms, hoa: { documentFeePayer: "BUYER", certificateFeePayer: "EACH_OWN", transferFeePayer: "SELLER" }, costsAndCredits: { ...completeCostTerms.costsAndCredits, closingCostEstimates: { ...completeCostTerms.costsAndCredits.closingCostEstimates!, itemizedCosts: { ...completeCostTerms.costsAndCredits.closingCostEstimates!.itemizedCosts, hoaDocument: { amountCents: 25_000, sellerCents: 999_999 }, hoaCertificate: { amountCents: 999_999, buyerCents: 10_000, sellerCents: 30_000 }, hoaTransfer: { amountCents: 35_000, buyerCents: 999_999 } } } } };
    expect(calculateLoiSummary(proposed)).toMatchObject({ buyerItemizedCostsCents: 35_000, sellerItemizedCostsCents: 65_000, closingCostEstimateComplete: true });
    const unknown = { ...proposed, costsAndCredits: { ...proposed.costsAndCredits, closingCostEstimates: { ...proposed.costsAndCredits.closingCostEstimates!, itemizedCosts: { ...proposed.costsAndCredits.closingCostEstimates!.itemizedCosts, hoaCertificate: { amountCents: 40_000 } } } } };
    expect(calculateLoiSummary(unknown)).toMatchObject({ buyerItemizedCostsCents: 25_000, sellerItemizedCostsCents: 35_000, closingCostEstimateComplete: false });
  });

  it("keeps missing rates unknown and explicit zero complete", () => {
    expect(calculateLoiSummary(terms)).toMatchObject({ buyerItemizedCostsCents: 0, sellerItemizedCostsCents: 0, closingCostEstimateComplete: false });
    expect(calculateLoiSummary(completeCostTerms).closingCostEstimateComplete).toBe(true);
    const missingTax = { ...completeCostTerms, costsAndCredits: { ...completeCostTerms.costsAndCredits, closingCostEstimates: { ...completeCostTerms.costsAndCredits.closingCostEstimates!, itemizedCosts: { transferTaxes: { amountCents: null }, governmentRetrofit: { amountCents: 0 } } } } };
    expect(calculateLoiSummary(missingTax).closingCostEstimateComplete).toBe(false);
  });

  it("ignores stale not-applicable costs and personal property that is excluded", () => {
    const proposed: LoiTermsV1 = { ...completeCostTerms, costsAndCredits: { ...completeCostTerms.costsAndCredits, customaryClosingCosts: false, closingCostPayers: { transferTaxes: "NOT_APPLICABLE", governmentRetrofitItems: "NOT_APPLICABLE" }, closingCostEstimates: { ...completeCostTerms.costsAndCredits.closingCostEstimates!, itemizedCosts: { transferTaxes: { amountCents: 500_000 }, governmentRetrofit: { amountCents: 500_000 }, hoaDocument: { amountCents: 500_000 }, hoaCertificate: { buyerCents: 500_000, sellerCents: 500_000 }, hoaTransfer: { amountCents: 500_000 }, personalProperty: { amountCents: 500_000 } } } } };
    expect(calculateLoiSummary(proposed)).toMatchObject({ buyerItemizedCostsCents: 0, sellerItemizedCostsCents: 0, closingCostEstimateComplete: true });
  });

  it.each(["BUYER", "SELLER"] as const)("allocates only an entered additional personal-property charge to %s", (payer) => {
    const proposed: LoiTermsV1 = { ...completeCostTerms, personalProperty: { excludedItems: "", included: true, includedItems: ["Refrigerator"], payer }, costsAndCredits: { ...completeCostTerms.costsAndCredits, closingCostEstimates: { ...completeCostTerms.costsAndCredits.closingCostEstimates!, itemizedCosts: { ...completeCostTerms.costsAndCredits.closingCostEstimates!.itemizedCosts, personalProperty: { amountCents: 20_000 } } } } };
    expect(calculateLoiSummary(proposed)).toMatchObject({ buyerItemizedCostsCents: payer === "BUYER" ? 20_000 : 0, sellerItemizedCostsCents: payer === "SELLER" ? 20_000 : 0, closingCostEstimateComplete: true });
    const includedInPrice = { ...proposed, costsAndCredits: { ...proposed.costsAndCredits, closingCostEstimates: { ...proposed.costsAndCredits.closingCostEstimates!, itemizedCosts: { ...proposed.costsAndCredits.closingCostEstimates!.itemizedCosts, personalProperty: { amountCents: 0 } } } } };
    expect(calculateLoiSummary(includedInPrice)).toMatchObject({ buyerItemizedCostsCents: 0, sellerItemizedCostsCents: 0, closingCostEstimateComplete: true });
  });

  it("credits escrow rent-back to the buyer and subtracts it from seller proceeds once", () => {
    const proposed: LoiTermsV1 = { ...completeCostTerms, possession: { type: "SELLER_RENT_BACK", amountCents: 250_000, days: 30, frequency: "THROUGH_ESCROW" } };
    expect(calculateLoiSummary(proposed)).toMatchObject({ rentBackAtClosingCents: 250_000, monthlyRentBackCents: 0, buyerClosingCostsCents: 0, sellerClosingCostsCents: 250_000, buyerCashDueAtClosingCents: 21_250_000, sellerCashBeforePayoffsCents: 99_250_000, closingCostEstimateComplete: true });
    expect(calculateLoiPreview(proposed)).toEqual(calculateLoiSummary(proposed));
  });

  it("shows monthly rent-back separately without inventing prorating or closing deductions", () => {
    const proposed: LoiTermsV1 = { ...completeCostTerms, possession: { type: "SELLER_RENT_BACK", amountCents: 250_000, days: 45, frequency: "MONTHLY" } };
    expect(calculateLoiSummary(proposed)).toMatchObject({ rentBackAtClosingCents: 0, monthlyRentBackCents: 250_000, buyerCashDueAtClosingCents: 21_500_000, sellerCashBeforePayoffsCents: 99_500_000, sellerClosingCostsCents: 0, closingCostEstimateComplete: true });
    expect(calculateLoiPreview({ ...proposed, possession: { type: "SELLER_RENT_BACK", amountCents: 250_000 } })).toMatchObject({ rentBackAtClosingCents: 0, closingCostEstimateComplete: false });
  });

  it("requires explicit exclusion confirmation before adding Other to separately calculated charges", () => {
    const proposed: LoiTermsV1 = { ...completeCostTerms, costsAndCredits: { ...completeCostTerms.costsAndCredits, homeWarranty: { company: "Warranty Co", included: true, maximumCents: 75_000, payer: "SELLER", payerNote: "", specialInclusions: "" }, closingCostEstimates: { ...completeCostTerms.costsAndCredits.closingCostEstimates!, buyerOtherClosingCostsCents: 10_000, sellerOtherClosingCostsCents: 20_000 } } };
    expect(loiTermsV1Schema.safeParse(proposed).success).toBe(true);
    const result = loiEditableTermsV1Schema.safeParse(proposed);
    expect(result.success ? [] : result.error.issues.map((issue) => issue.path.join("."))).toContain("costsAndCredits.closingCostEstimates.otherCostsExcludeItemized");
    expect(loiCounterEditableTermsV1Schema.safeParse(proposed).success).toBe(false);
    expect(calculateLoiSummary(proposed).closingCostEstimateComplete).toBe(false);
    const confirmed = { ...proposed, costsAndCredits: { ...proposed.costsAndCredits, closingCostEstimates: { ...proposed.costsAndCredits.closingCostEstimates!, otherCostsExcludeItemized: true } } };
    expect(loiEditableTermsV1Schema.safeParse(confirmed).success).toBe(true);
    expect(calculateLoiSummary(confirmed)).toMatchObject({ buyerClosingCostsCents: 10_000, sellerClosingCostsCents: 95_000, closingCostEstimateComplete: true });
  });

  it.each([-1, 0.5, 10_000_000_001])("rejects invalid itemized cost cents %s at the new boundary", (amountCents) => {
    const proposed = { ...completeCostTerms, costsAndCredits: { ...completeCostTerms.costsAndCredits, closingCostEstimates: { ...completeCostTerms.costsAndCredits.closingCostEstimates!, itemizedCosts: { transferTaxes: { amountCents } } } } };
    expect(loiTermsV1Schema.safeParse(proposed).success).toBe(false);
    expect(calculateLoiPreview(proposed)).toBeNull();
  });

  it("retains strict historical V1/V2 summary decoders while emitting V5", () => {
    const v1 = { calculationVersion: 1, earnestMoneyBps: 300, earnestMoneyCents: 3_000_000, effectivePriceAfterSellerCreditCents: 99_500_000, loanAmountCents: 75_000_000, loanToValueBps: 7_500, remainingDownPaymentAfterDepositCents: 22_000_000 };
    const v2 = { ...v1, calculationVersion: 2, buyerAgentCommissionCents: 0, sellerAgentCommissionCents: null, buyerClosingCostsCents: 0, sellerClosingCostsCents: 0, buyerCashDueAtClosingCents: 21_500_000, sellerCashBeforePayoffsCents: 99_500_000, closingCostEstimateComplete: false };
    expect(loiComputedSummaryV1Schema.parse(v1)).toEqual(v1);
    expect(loiComputedSummaryV2Schema.parse(v2)).toEqual(v2);
    expect(loiComputedSummaryV5Schema.parse(calculateLoiSummary(completeCostTerms)).calculationVersion).toBe(5);
    expect(loiComputedSummaryV2Schema.safeParse({ ...v2, buyerClosingCostsCents: 80_000_000_001 }).success).toBe(false);
  });

  it("accepts the bounded combined V3 total when many valid cost categories exceed V2 totals", () => {
    const maximum = 10_000_000_000;
    const proposed: LoiTermsV1 = {
      ...completeCostTerms, purchasePriceCents: maximum, funding: { type: "CASH" }, timing: { ...terms.timing, loanContingencyDays: null },
      providers: { escrow: { choice: "LIBER_PREFERRED", feePayer: "BUYER" }, title: { choice: "LIBER_PREFERRED", feePayer: "BUYER" } },
      hoa: { documentFeePayer: "BUYER", certificateFeePayer: "BUYER", transferFeePayer: "BUYER" },
      personalProperty: { included: true, includedItems: ["Furniture"], excludedItems: "", payer: "BUYER" },
      representation: { buyerRepresented: true, commissionAmount: "100%", commissionPayer: "BUYER", agent: { company: "", email: "agent@example.test", license: "", name: "Agent", phone: "" } },
      costsAndCredits: { ...terms.costsAndCredits, customaryClosingCosts: false, closingCostPayers: { transferTaxes: "BUYER", governmentRetrofitItems: "BUYER" }, homeWarranty: { company: "Warranty Co", included: true, maximumCents: maximum, payer: "BUYER", payerNote: "", specialInclusions: "" }, closingCostEstimates: { buyerEscrowCents: maximum, sellerEscrowCents: null, buyerTitleInsuranceCents: maximum, sellerTitleInsuranceCents: null, buyerOtherClosingCostsCents: maximum, sellerOtherClosingCostsCents: 0, otherCostsExcludeItemized: true, sellerAgentCommissionAmount: "0", note: "", itemizedCosts: { transferTaxes: { amountCents: maximum }, governmentRetrofit: { amountCents: maximum }, hoaDocument: { amountCents: maximum }, hoaCertificate: { amountCents: maximum }, hoaTransfer: { amountCents: maximum }, personalProperty: { amountCents: maximum } } } },
    };
    const summary = calculateLoiSummary(proposed);
    expect(summary.buyerClosingCostsCents).toBe(maximum * 11);
    expect(loiComputedSummaryV5Schema.safeParse(summary).success).toBe(true);
    expect(summary.closingCostEstimateComplete).toBe(true);
  });
});

describe("LOI terms", () => {
  it("keeps historical title payer omission and rejects contradictory new title estimates", () => {
    expect(loiTermsV1Schema.parse(terms).providers.title).not.toHaveProperty("feePayer");
    const estimates = { buyerEscrowCents: null, sellerEscrowCents: 0, buyerTitleInsuranceCents: 0, sellerTitleInsuranceCents: 200_000, buyerOtherClosingCostsCents: 0, sellerOtherClosingCostsCents: 0, sellerAgentCommissionAmount: "0", note: "" };
    const proposed = { ...terms, providers: { ...terms.providers, title: { choice: "LIBER_PREFERRED", feePayer: "SELLER" } }, costsAndCredits: { ...terms.costsAndCredits, closingCostEstimates: estimates } };
    expect(loiEditableTermsV1Schema.safeParse(proposed).success).toBe(true);
    expect(loiEditableTermsV1Schema.safeParse({ ...proposed, providers: { ...proposed.providers, title: { choice: "LIBER_PREFERRED", feePayer: "BUYER" } } }).success).toBe(false);
    expect(loiTermsV1Schema.safeParse({ ...proposed, providers: { ...proposed.providers, title: { choice: "LIBER_PREFERRED", feePayer: "UNKNOWN" } } }).success).toBe(false);
    expect(calculateLoiPreview(proposed)).toMatchObject({ buyerClosingCostsCents: 0, sellerClosingCostsCents: 200_000, closingCostEstimateComplete: false });
  });

  it("requires specific noncustomary cost payers for edits while preserving old allocation text on reads", () => {
    const legacy = { ...terms, costsAndCredits: { ...terms.costsAndCredits, customaryClosingCosts: false, alternateClosingCostAllocation: "Discuss later" } };
    expect(loiTermsV1Schema.parse(legacy).costsAndCredits.alternateClosingCostAllocation).toBe("Discuss later");
    const result = loiEditableTermsV1Schema.safeParse(legacy);
    expect(result.success ? [] : result.error.issues.map((issue) => issue.path.join("."))).toEqual(expect.arrayContaining(["costsAndCredits.closingCostPayers.transferTaxes", "costsAndCredits.closingCostPayers.governmentRetrofitItems"]));
    const current = { ...legacy, costsAndCredits: { ...legacy.costsAndCredits, alternateClosingCostAllocation: "", closingCostPayers: { transferTaxes: "SELLER", governmentRetrofitItems: "BUYER" } } };
    expect(loiEditableTermsV1Schema.safeParse(current).success).toBe(true);
    expect(loiEditableTermsV1Schema.safeParse({ ...current, costsAndCredits: { ...current.costsAndCredits, customaryClosingCosts: true } }).success).toBe(false);
  });

  it("validates a selected seller credit and preserves legacy inferred choices", () => {
    expect(loiEditableTermsV1Schema.safeParse(terms).success).toBe(true);
    expect(loiEditableTermsV1Schema.safeParse({ ...terms, costsAndCredits: { ...terms.costsAndCredits, sellerCreditIncluded: true, sellerCreditCents: 0 } }).success).toBe(false);
    expect(loiEditableTermsV1Schema.safeParse({ ...terms, costsAndCredits: { ...terms.costsAndCredits, sellerCreditIncluded: false } }).success).toBe(false);
    expect(loiEditableTermsV1Schema.safeParse({ ...terms, costsAndCredits: { ...terms.costsAndCredits, sellerCreditIncluded: false, sellerCreditCents: 0, sellerCreditNote: "" } }).success).toBe(true);
  });

  it("requires an amortization schedule for new amortizing financing while reading old revisions and preserving locked counter funding", () => {
    const historical = { ...terms, funding: { amortizationMonths: null, annualInterestBps: 600, balloonMonth: null, cashDownPaymentCents: 20_000_000, interestOnly: false, note: "", principalCents: 80_000_000, termMonths: 360, type: "SELLER_FINANCING" } };
    expect(loiTermsV1Schema.safeParse(historical).success).toBe(true);
    expect(loiEditableTermsV1Schema.safeParse(historical).success).toBe(false);
    expect(loiCounterEditableTermsV1Schema.safeParse(historical).success).toBe(true);
    expect(loiEditableTermsV1Schema.safeParse({ ...historical, funding: { ...historical.funding, amortizationMonths: 360 } }).success).toBe(true);
    expect(loiEditableTermsV1Schema.safeParse({ ...historical, funding: { ...historical.funding, interestOnly: true } }).success).toBe(true);
  });

  it.each(["2.5%", "0%", "100%", "$10,000", "$123.45", "15000", "0", " 3.25% "])("accepts a numeric dollar or percent commission %j", (commissionAmount) => {
    const proposed = { ...terms, representation: { agent: { company: "", email: "agent@example.test", license: "", name: "Agent", phone: "" }, buyerRepresented: true, commissionAmount, commissionPayer: "SELLER" } };
    expect(loiEditableTermsV1Schema.safeParse(proposed).success).toBe(true);
  });

  it.each(["banana", "101%", "-1%", "$5%", "$1,00", "1.234%", "1e4", "$100000001"])("rejects invalid new commission %j while preserving stored text", (commissionAmount) => {
    const proposed = { ...terms, representation: { agent: { company: "", email: "agent@example.test", license: "", name: "Agent", phone: "" }, buyerRepresented: true, commissionAmount, commissionPayer: "BUYER" } };
    expect(loiEditableTermsV1Schema.safeParse(proposed).success).toBe(false);
    expect(loiTermsV1Schema.safeParse(proposed).success).toBe(true);
  });

  it("supports each-own escrow fees without changing a historical omitted payer", () => {
    expect(loiEditableTermsV1Schema.parse({ ...terms, providers: { ...terms.providers, escrow: { choice: "LIBER_PREFERRED", feePayer: "EACH_OWN" } } }).providers.escrow.feePayer).toBe("EACH_OWN");
    expect(loiTermsV1Schema.parse({ ...terms, providers: { ...terms.providers, escrow: { choice: "LIBER_PREFERRED" } } }).providers.escrow.feePayer).toBe("SELLER");
  });

  it("accepts submissions without a client deadline and historical retry timestamps", () => {
    const request = { clientActionId: "11111111-1111-4111-8111-111111111111", expectedDraftId: "22222222-2222-4222-8222-222222222222", expectedDraftVersion: 1, expectedSequence: 0 };
    expect(submitLoiRevisionSchema.parse(request)).toEqual(request);
    expect(submitLoiRevisionSchema.safeParse({ ...request, responseDeadline: "2026-09-26T12:00:00.000Z" }).success).toBe(true);
    expect(submitLoiRevisionSchema.safeParse({ ...request, responseDeadline: "not a date" }).success).toBe(false);
  });

  it("calculates canonical financed summaries in integer cents and basis points", () => {
    expect(calculateLoiSummary(terms)).toEqual({
      calculationVersion: 5,
      escrowFeePerSideCents: 205_000, buyerEscrowCents: 0, sellerEscrowCents: 410_000,
      transferTaxSchedule: "MANUAL", laCountyTransferTaxCents: null, laCityTransferTaxCents: null, measureUlaCents: null, measureUlaRateBps: null, buyerTransferTaxCents: 0, sellerTransferTaxCents: null,
      earnestMoneyBps: 300,
      earnestMoneyCents: 3_000_000,
      effectivePriceAfterSellerCreditCents: 99_500_000,
      loanAmountCents: 75_000_000,
      loanToValueBps: 7_500,
      remainingDownPaymentAfterDepositCents: 22_000_000,
      buyerAgentCommissionCents: 0,
      sellerAgentCommissionCents: null,
      buyerHomeWarrantyCents: 0,
      sellerHomeWarrantyCents: 0,
      buyerItemizedCostsCents: 0,
      sellerItemizedCostsCents: 0,
      rentBackAtClosingCents: 0,
      monthlyRentBackCents: 0,
      buyerClosingCostsCents: 0,
      sellerClosingCostsCents: 410_000,
      buyerCashDueAtClosingCents: 21_500_000,
      sellerCashBeforePayoffsCents: 99_090_000,
      closingCostEstimateComplete: false,
    });
  });

  it.each([
    ["2.5%", 880_000_00, 22_000_00],
    ["$12,345.67", 880_000_00, 1_234_567],
    ["0.01%", 5_000, 1],
    ["0.01%", 4_999, 0],
    ["100%", 10_000_000_000, 10_000_000_000],
    ["100000000", 10_000_000_000, 10_000_000_000],
    ["101%", 10_000, null],
    ["", 10_000, null],
  ] as const)("calculates commission %s on %i cents with integer half-up rounding", (value, price, result) => {
    expect(calculateLoiCommissionCents(value, price)).toBe(result);
  });

  it("adds each party's fees and commissions and subtracts deposit and seller credit exactly once", () => {
    const result = calculateLoiSummary({
      ...terms,
      representation: { agent: { company: "", email: "agent@example.test", license: "", name: "Agent", phone: "" }, buyerRepresented: true, commissionAmount: "2.5%", commissionPayer: "BUYER" },
      providers: { ...terms.providers, escrow: { choice: "LIBER_PREFERRED", feePayer: "EACH_OWN" } },
      costsAndCredits: { ...terms.costsAndCredits, closingCostEstimates: { buyerEscrowCents: 1_200_00, sellerEscrowCents: 1_400_00, buyerTitleInsuranceCents: 0, sellerTitleInsuranceCents: 2_000_00, buyerOtherClosingCostsCents: 3_500_00, sellerOtherClosingCostsCents: 4_000_00, sellerAgentCommissionAmount: "2%", note: "Quoted fees" } },
    });
    expect(result).toMatchObject({ buyerAgentCommissionCents: 25_000_00, sellerAgentCommissionCents: 20_000_00, buyerClosingCostsCents: 29_700_00, sellerClosingCostsCents: 27_400_00, buyerCashDueAtClosingCents: 244_700_00, sellerCashBeforePayoffsCents: 967_600_00, closingCostEstimateComplete: false });
  });

  it("uses cash down payment for seller-financed cash proceeds and recalculates percent commissions after a price change", () => {
    const financed: LoiTermsV1 = {
      ...terms,
      funding: { amortizationMonths: 360, annualInterestBps: 600, balloonMonth: null, cashDownPaymentCents: 200_000_00, interestOnly: false, note: "", principalCents: 800_000_00, termMonths: 360, type: "SELLER_FINANCING" },
      costsAndCredits: { ...terms.costsAndCredits, closingCostEstimates: { buyerEscrowCents: null, sellerEscrowCents: 1_400_00, buyerTitleInsuranceCents: 0, sellerTitleInsuranceCents: 2_000_00, buyerOtherClosingCostsCents: 0, sellerOtherClosingCostsCents: 0, sellerAgentCommissionAmount: "2%", note: "" } },
    };
    expect(calculateLoiSummary(financed)).toMatchObject({ sellerCashBeforePayoffsCents: 171_600_00, buyerCashDueAtClosingCents: 165_000_00, closingCostEstimateComplete: false });
    const counter = { ...financed, purchasePriceCents: 1_100_000_00, funding: { ...financed.funding as Extract<LoiTermsV1["funding"], { type: "SELLER_FINANCING" }>, principalCents: 900_000_00 } };
    expect(calculateLoiSummary(counter)).toMatchObject({ sellerAgentCommissionCents: 22_000_00, sellerCashBeforePayoffsCents: 169_600_00 });
  });

  it("charges a seller-paid buyer agent commission to the seller and keeps a cash buyer's full price in cash due", () => {
    const cash: LoiTermsV1 = { ...terms, funding: { type: "CASH" }, timing: { ...terms.timing, loanContingencyDays: null }, representation: { agent: { company: "", email: "agent@example.test", license: "", name: "Agent", phone: "" }, buyerRepresented: true, commissionAmount: "$12,345.67", commissionPayer: "SELLER" } };
    expect(calculateLoiSummary(cash)).toMatchObject({ loanAmountCents: 0, buyerClosingCostsCents: 0, sellerClosingCostsCents: 1_644_567, buyerCashDueAtClosingCents: 96_500_000, sellerCashBeforePayoffsCents: 97_855_433, closingCostEstimateComplete: false });
  });

  it("distinguishes missing fees from explicit zero and preserves modeled negative cash instead of clamping it", () => {
    const estimates = { buyerEscrowCents: null, sellerEscrowCents: 0, buyerTitleInsuranceCents: 0, sellerTitleInsuranceCents: 0, buyerOtherClosingCostsCents: 0, sellerOtherClosingCostsCents: 0, sellerAgentCommissionAmount: "0", note: "" };
    const lowDownPayment = { ...terms, funding: { ...terms.funding as Extract<LoiTermsV1["funding"], { type: "FINANCED" }>, downPaymentCents: 1_000_00 }, costsAndCredits: { ...terms.costsAndCredits, closingCostEstimates: estimates } };
    expect(calculateLoiSummary(lowDownPayment)).toMatchObject({ buyerCashDueAtClosingCents: -34_000_00, closingCostEstimateComplete: false });
    expect(calculateLoiSummary({ ...lowDownPayment, costsAndCredits: { ...lowDownPayment.costsAndCredits, closingCostEstimates: { ...estimates, sellerEscrowCents: null } } }).closingCostEstimateComplete).toBe(false);
  });

  it("rejects conflicting escrow allocations, malformed commissions, and invalid estimate cents", () => {
    const estimates = { buyerEscrowCents: null, sellerEscrowCents: 0, buyerTitleInsuranceCents: 0, sellerTitleInsuranceCents: 0, buyerOtherClosingCostsCents: 0, sellerOtherClosingCostsCents: 0, sellerAgentCommissionAmount: "0", note: "" };
    const proposed = (changes: Record<string, unknown>) => ({ ...terms, costsAndCredits: { ...terms.costsAndCredits, closingCostEstimates: { ...estimates, ...changes } } });
    expect(loiEditableTermsV1Schema.safeParse(proposed({ buyerEscrowCents: 100 })).success).toBe(false);
    expect(loiEditableTermsV1Schema.safeParse(proposed({ sellerAgentCommissionAmount: "one percent" })).success).toBe(false);
    expect(loiEditableTermsV1Schema.safeParse(proposed({ sellerEscrowCents: -1 })).success).toBe(false);
    expect(loiEditableTermsV1Schema.safeParse(proposed({ sellerEscrowCents: 0.5 })).success).toBe(false);
    expect(loiEditableTermsV1Schema.safeParse(proposed({ sellerEscrowCents: 10_000_000_001 })).success).toBe(false);
    expect(loiEditableTermsV1Schema.safeParse(proposed({})).success).toBe(true);
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
    expect(previewLoiCalculation(incomplete)?.issues).toEqual([]);
  });

  it("keeps calculating while a typed amount temporarily conflicts with another field", () => {
    if (terms.funding.type !== "FINANCED") throw new Error("Expected financed fixture.");
    // Retyping the price digit by digit passes through prices below the down payment and seller credit.
    const midTyping = { ...terms, purchasePriceCents: 100, funding: { ...terms.funding, downPaymentCents: 25_000_000 } };
    expect(previewLoiCalculation(midTyping)).toEqual({
      issues: [
        { message: "Down payment cannot exceed purchase price.", path: "funding.downPaymentCents" },
        { message: "Seller credit cannot exceed purchase price.", path: "costsAndCredits.sellerCreditCents" },
      ],
      summary: expect.objectContaining({ earnestMoneyCents: 3, loanAmountCents: 0, loanToValueBps: 0 }),
    });
    const credit = previewLoiCalculation({ ...terms, costsAndCredits: { ...terms.costsAndCredits, sellerCreditCents: terms.purchasePriceCents + 1 } });
    expect(credit?.issues.map((issue) => issue.path)).toEqual(["costsAndCredits.sellerCreditCents"]);
    expect(credit?.summary.sellerCashBeforePayoffsCents).toBeLessThan(0);
    // Structurally incomplete projections still produce no figures.
    expect(previewLoiCalculation({ ...terms, purchasePriceCents: 0 })).toBeNull();
  });

  it("never clamps the loan amount for valid financed terms", () => {
    expect(calculateLoiSummary(terms).loanAmountCents).toBe(75_000_000);
    if (terms.funding.type !== "FINANCED") throw new Error("Expected financed fixture.");
    expect(calculateLoiSummary({ ...terms, funding: { ...terms.funding, downPaymentCents: terms.purchasePriceCents } }).loanAmountCents).toBe(0);
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
        homeWarranty: { company: "Warranty Co", included: true, maximumCents: 50_000, payer: "OTHER", payerNote: "", specialInclusions: "" },
      },
    }).success).toBe(false);
    expect(loiTermsV1Schema.safeParse({ ...terms, representation: { agent: { company: "Hidden", email: "", license: "", name: "", phone: "" }, buyerRepresented: false } }).success).toBe(false);
  });

  it("returns precise paths for material aggregate validation failures", () => {
    const warranty = loiTermsV1Schema.safeParse({
      ...terms,
      costsAndCredits: {
        ...terms.costsAndCredits,
        homeWarranty: { company: "Warranty Co", included: true, maximumCents: 0, payer: "SELLER", payerNote: "", specialInclusions: "" },
      },
    });
    expect(warranty.success ? [] : warranty.error.issues.map((issue) => issue.path.join("."))).toContain("costsAndCredits.homeWarranty.maximumCents");

    const agent = loiTermsV1Schema.safeParse({
      ...terms,
      representation: { agent: { company: "Brokerage", email: "", license: "", name: "Agent Name", phone: "" }, buyerRepresented: true, commissionAmount: "2.5%", commissionPayer: "SELLER" },
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

  it("locks new drafts to 3% earnest money, 90-day escrow, and agent commission when represented", () => {
    expect(loiTermsV1Schema.safeParse({
      ...terms,
      representation: { agent: { company: "Brokerage", email: "agent@example.test", license: "", name: "Agent Name", phone: "" }, buyerRepresented: true },
    }).success).toBe(true);
    expect(loiEditableTermsV1Schema.safeParse({
      ...terms,
      representation: { agent: { company: "Brokerage", email: "agent@example.test", license: "", name: "Agent Name", phone: "" }, buyerRepresented: true, commissionAmount: "", commissionPayer: null },
    }).success).toBe(false);
    expect(loiEditableTermsV1Schema.safeParse({
      ...terms,
      representation: { agent: { company: "Brokerage", email: "agent@example.test", license: "", name: "Agent Name", phone: "" }, buyerRepresented: true, commissionAmount: "2.5%", commissionPayer: "SELLER" },
    }).success).toBe(true);
    expect(loiEditableTermsV1Schema.safeParse({
      ...terms,
      possession: { amountCents: 250_000, days: 30, frequency: "THROUGH_ESCROW", type: "SELLER_RENT_BACK" },
    }).success).toBe(true);
    expect(loiEditableTermsV1Schema.safeParse({
      ...terms,
      timing: { ...terms.timing, closingDays: 91 },
    }).success).toBe(false);
    expect(loiEditableTermsV1Schema.safeParse({
      ...terms,
      deposit: { amountCents: 10_000_00, basis: "FIXED" },
    }).success).toBe(false);
    expect(loiTermsV1Schema.safeParse({
      ...terms,
      deposit: { amountCents: 10_000_00, basis: "FIXED" },
    }).success).toBe(true);
  });

  it("canonicalizes every LOI UUID boundary to lowercase", () => {
    const uppercase = "AAAAAAAA-AAAA-4AAA-8AAA-AAAAAAAAAAAA";
    const lowercase = uppercase.toLowerCase();
    for (const schema of [loiNegotiationIdSchema, loiRevisionIdSchema, loiDraftIdSchema, loiActionIdSchema]) {
      expect(schema.parse(`  ${uppercase}  `)).toBe(lowercase);
    }
  });
});

describe("private draft offer-price boundary", () => {
  it.each([false, true])("saves blank price with funding and credits when counter=%s", (counter) => {
    const blank = { ...terms, purchasePriceCents: 0 };
    expect(parseLoiDraftTerms(blank, counter).purchasePriceCents).toBe(0);
    expect(calculateLoiPreview(blank)).toBeNull();
    expect((counter ? loiCounterEditableTermsV1Schema : loiEditableTermsV1Schema).safeParse(blank).success).toBe(false);
    expect(() => calculateLoiSummary(blank)).toThrow();
    expect((counter ? loiCounterEditableTermsV1Schema : loiEditableTermsV1Schema).safeParse(terms).success).toBe(true);
  });
  it.each([-1, 10_000_000_001, "", null, undefined])("rejects invalid draft price %s", (price) => {
    expect(() => parseLoiDraftTerms({ ...terms, purchasePriceCents: price })).toThrow();
  });
  it("retains unrelated validation and validates funding when a price is present", () => {
    expect(() => parseLoiDraftTerms({ ...terms, purchasePriceCents: 0, parties: { ...terms.parties, buyerLegalName: "" } })).toThrow();
    expect(() => parseLoiDraftTerms({ ...terms, purchasePriceCents: 100 })).toThrow();
  });
});
