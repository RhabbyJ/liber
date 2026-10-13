import { describe, expect, it } from "vitest";
import { calculateLoiSummary, loiComputedSummaryV1Schema, loiComputedSummaryV2Schema, type LoiComputedSummary, type LoiTermsV1 } from "@liber/validators";
import { loiFeeBreakdown } from "./loi-fee-breakdown";
import { cashTerms } from "./loi-test-fixtures.test-helper";

function completeTerms(): LoiTermsV1 {
  return {
    ...cashTerms,
    representation: { ...cashTerms.representation, buyerRepresented: true, agent: { ...cashTerms.representation.agent, name: "Synthetic Agent", email: "agent@example.test" }, commissionAmount: "2.5%", commissionPayer: "SELLER" },
    providers: { escrow: { choice: "LIBER_PREFERRED", feePayer: "EACH_OWN" }, title: { choice: "LIBER_PREFERRED", feePayer: "SELLER" } },
    hoa: { documentFeePayer: "BUYER", certificateFeePayer: "EACH_OWN", transferFeePayer: "SELLER" },
    personalProperty: { ...cashTerms.personalProperty, included: true, includedItems: ["Washer"], payer: "BUYER" },
    possession: { type: "SELLER_RENT_BACK", amountCents: 300_00, frequency: "THROUGH_ESCROW", days: 30 },
    costsAndCredits: {
      ...cashTerms.costsAndCredits, customaryClosingCosts: false, alternateClosingCostAllocation: "Synthetic estimates", closingCostPayers: { transferTaxes: "SPLIT_EQUALLY", governmentRetrofitItems: "SELLER" },
      homeWarranty: { company: "Test", included: true, maximumCents: 800_00, payer: "OTHER", payerNote: "Buyer 250, seller 550", buyerShareCents: 250_00, sellerShareCents: 550_00, specialInclusions: "" },
      closingCostEstimates: { buyerEscrowCents: 120_00, sellerEscrowCents: 180_00, buyerTitleInsuranceCents: null, sellerTitleInsuranceCents: 500_00, buyerOtherClosingCostsCents: 40_00, sellerOtherClosingCostsCents: 60_00, sellerAgentCommissionAmount: "1.5%", note: "Synthetic", otherCostsExcludeItemized: true,
        itemizedCosts: { transferTaxes: { amountCents: 101 }, governmentRetrofit: { amountCents: 200_00 }, hoaDocument: { amountCents: 75_00 }, hoaCertificate: { buyerCents: 25_00, sellerCents: 30_00 }, hoaTransfer: { amountCents: 80_00 }, personalProperty: { amountCents: 150_00 } } },
    },
  };
}

function expectBalanced(terms: LoiTermsV1, summary: LoiComputedSummary) {
  if (summary.calculationVersion === 1) throw new Error("Cash summaries require version 2 or 3");
  const rows = loiFeeBreakdown(terms, summary);
  expect(rows.reduce((sum, row) => sum + (row.buyerCents ?? 0), 0)).toBe(summary.buyerClosingCostsCents);
  expect(rows.reduce((sum, row) => sum + (row.sellerCents ?? 0), 0)).toBe(summary.sellerClosingCostsCents);
  return rows;
}

describe("LOI itemized displayed fees", () => {
  it("lists all thirteen fee categories, allocates explicit shares and odd cents, and reconciles both totals", () => {
    const terms = completeTerms();
    const rows = expectBalanced(terms, calculateLoiSummary(terms));
    expect(rows.map((row) => row.label)).toEqual(["Buyer agent commission", "Seller agent commission", "Escrow fees", "Title insurance", "Other closing costs", "Home warranty", "City and county transfer taxes", "Government-required retrofit items", "HOA document fees", "HOA certificate fees", "HOA transfer fees", "Included personal property", "Rent-back paid at closing"]);
    expect(rows.find((row) => row.label === "Home warranty")).toMatchObject({ buyerCents: 250_00, sellerCents: 550_00 });
    expect(rows.find((row) => row.label === "City and county transfer taxes")).toMatchObject({ buyerCents: 51, sellerCents: 50 });
    expect(rows.find((row) => row.label === "HOA certificate fees")).toMatchObject({ buyerCents: 25_00, sellerCents: 30_00 });
    expect(rows.find((row) => row.label === "Rent-back paid at closing")).toMatchObject({ buyerCents: 0, sellerCents: 300_00 });
  });

  it.each(["BUYER", "SELLER"] as const)("moves warranty and buyer-agent commission to %s without changing the combined charge", (payer) => {
    const initial = completeTerms();
    const terms: LoiTermsV1 = { ...initial, representation: { ...initial.representation, commissionPayer: payer }, costsAndCredits: { ...initial.costsAndCredits, homeWarranty: { ...initial.costsAndCredits.homeWarranty, payer, payerNote: "", buyerShareCents: undefined, sellerShareCents: undefined } } };
    const rows = expectBalanced(terms, calculateLoiSummary(terms));
    expect(rows.find((row) => row.label === "Home warranty")).toMatchObject({ buyerCents: payer === "BUYER" ? 800_00 : 0, sellerCents: payer === "SELLER" ? 800_00 : 0 });
    expect(rows.find((row) => row.label === "Buyer agent commission")).toMatchObject({ buyerCents: payer === "BUYER" ? 2_500_000 : 0, sellerCents: payer === "SELLER" ? 2_500_000 : 0 });
  });

  it("masks stale exclusive-payer quotes while retaining unknown versus explicit zero", () => {
    const initial = completeTerms();
    const terms: LoiTermsV1 = { ...initial, providers: { escrow: { choice: "LIBER_PREFERRED", feePayer: "SELLER" }, title: { choice: "LIBER_PREFERRED", feePayer: "BUYER" } }, costsAndCredits: { ...initial.costsAndCredits, closingCostEstimates: { ...initial.costsAndCredits.closingCostEstimates!, buyerEscrowCents: 9_999, sellerEscrowCents: null, buyerTitleInsuranceCents: 0, sellerTitleInsuranceCents: 8_888 } } };
    const summary = calculateLoiSummary(terms);
    const rows = expectBalanced(terms, summary);
    expect(rows.find((row) => row.label === "Escrow fees")).toMatchObject({ buyerCents: 0, sellerCents: 410_000 });
    expect(rows.find((row) => row.label === "Title insurance")).toMatchObject({ buyerCents: 0, sellerCents: 0 });
    expect(summary.closingCostEstimateComplete).toBe(true);
  });

  it("preserves omitted historical title payers and separate quotes", () => {
    const initial = completeTerms();
    const terms: LoiTermsV1 = { ...initial, providers: { ...initial.providers, title: { choice: "LIBER_PREFERRED" } }, costsAndCredits: { ...initial.costsAndCredits, closingCostEstimates: { ...initial.costsAndCredits.closingCostEstimates!, buyerTitleInsuranceCents: 45_00, sellerTitleInsuranceCents: null } } };
    expect(expectBalanced(terms, calculateLoiSummary(terms)).find((row) => row.label === "Title insurance")).toMatchObject({ buyerCents: 45_00, sellerCents: null });
  });

  it("ignores stale excluded items and leaves monthly rent outside closing costs", () => {
    const initial = completeTerms();
    const terms: LoiTermsV1 = { ...initial, personalProperty: { ...initial.personalProperty, included: false, includedItems: [] }, hoa: { ...initial.hoa, documentFeePayer: "NOT_APPLICABLE" }, possession: { type: "SELLER_RENT_BACK", amountCents: 300_00, frequency: "MONTHLY", days: 30 } };
    const rows = expectBalanced(terms, calculateLoiSummary(terms));
    for (const label of ["Included personal property", "HOA document fees", "Rent-back paid at closing"]) expect(rows.find((row) => row.label === label)).toMatchObject({ buyerCents: 0, sellerCents: 0 });
  });

  it("reconciles frozen historical V2 totals without applying V3 warranty or itemized math", () => {
    const terms = completeTerms();
    const current = calculateLoiSummary(terms);
    const historical = loiComputedSummaryV2Schema.parse(Object.fromEntries(Object.keys(loiComputedSummaryV2Schema.shape).map((key) => [key, key === "calculationVersion" ? 2 : current[key as keyof typeof current]])));
    historical.buyerClosingCostsCents = 123;
    historical.sellerClosingCostsCents = 456;
    const frozen = JSON.stringify(historical);
    const rows = expectBalanced(terms, historical);
    expect(rows).toHaveLength(6);
    expect(rows.some((row) => row.label === "Home warranty")).toBe(false);
    expect(rows.at(-1)?.label).toBe("Stored estimate adjustment");
    expect(rows.at(-1)!.sellerCents!).toBeLessThan(0);
    expect(JSON.stringify(historical)).toBe(frozen);
  });

  it("does not invent closing-cost breakdowns for calculation V1", () => {
    const terms = completeTerms();
    const current = calculateLoiSummary(terms);
    const historical = loiComputedSummaryV1Schema.parse(Object.fromEntries(Object.keys(loiComputedSummaryV1Schema.shape).map((key) => [key, key === "calculationVersion" ? 1 : current[key as keyof typeof current]])));
    expect(loiFeeBreakdown(terms, historical)).toEqual([]);
  });
});
