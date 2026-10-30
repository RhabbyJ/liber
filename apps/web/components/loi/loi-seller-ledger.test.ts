import { readFileSync } from "node:fs";
import path from "node:path";
import { calculateLoiSummary, loiComputedSummaryV1Schema, type LoiTermsV1 } from "@liber/validators";
import { describe, expect, it } from "vitest";
import { loiTransferTaxDescription } from "./loi-editor-values";
import { loiSellerLedger } from "./loi-seller-ledger";
import { cashTerms } from "./loi-test-fixtures.test-helper";

const ledgerFor = (terms: LoiTermsV1) => loiSellerLedger(terms, calculateLoiSummary(terms))!;
const keys = (terms: LoiTermsV1) => ledgerFor(terms).lines.map((line) => line.key);

describe("seller LOI cost ledger", () => {
  it("lists only lines that cost the seller something, keeping unknown estimates visible", () => {
    // Customary costs put transfer taxes and retrofit on the seller; their quotes are still unknown.
    expect(keys(cashTerms)).toEqual(["price", "sellerAgentCommission", "escrow", "title", "misc", "transferTaxes", "governmentRetrofit"]);
    const ledger = ledgerFor(cashTerms);
    expect(ledger.lines.find((line) => line.key === "transferTaxes")?.cents).toBeNull();
    // A blank seller misc estimate uses 0.2% of the price.
    expect(ledger.lines.find((line) => line.key === "misc")?.cents).toBe(200_000);
    expect(ledger.lines.find((line) => line.key === "title")?.cents).toBe(250_000);
    expect(ledger.complete).toBe(false);
  });

  it("drops a buyer-paid commission, an explicit zero, Measure ULA below its threshold, and absent rent-back", () => {
    const terms: LoiTermsV1 = {
      ...cashTerms,
      representation: { agent: { company: "", email: "agent@example.test", license: "", name: "Agent", phone: "" }, buyerRepresented: true, commissionAmount: "2%", commissionPayer: "BUYER" },
      costsAndCredits: { ...cashTerms.costsAndCredits, transferTaxSchedule: "LA_CITY_2026_2027", closingCostEstimates: { buyerEscrowCents: null, sellerEscrowCents: null, buyerTitleInsuranceCents: null, sellerTitleInsuranceCents: null, buyerOtherClosingCostsCents: null, sellerOtherClosingCostsCents: 0, sellerAgentCommissionAmount: "0", note: "" } },
    };
    const lineKeys = keys(terms);
    for (const hidden of ["buyerAgentCommission", "sellerAgentCommission", "misc", "measureUla", "rentBack", "sellerCredit"]) expect(lineKeys).not.toContain(hidden);
    expect(lineKeys).toContain("transferTaxes");
    expect(ledgerFor({ ...terms, purchasePriceCents: 600_000_000 }).lines.find((line) => line.key === "measureUla")).toMatchObject({ cents: 24_000_000, counterInputId: null });
  });

  it("shows seller-paid commission, through-escrow rent-back, and seller credit when they apply", () => {
    const terms: LoiTermsV1 = {
      ...cashTerms,
      possession: { type: "SELLER_RENT_BACK", days: 14, amountCents: 300_000, frequency: "THROUGH_ESCROW" },
      representation: { agent: { company: "", email: "agent@example.test", license: "", name: "Agent", phone: "" }, buyerRepresented: true, commissionAmount: "2%", commissionPayer: "SELLER" },
      costsAndCredits: { ...cashTerms.costsAndCredits, sellerCreditCents: 500_000, sellerCreditIncluded: true },
    };
    const ledger = ledgerFor(terms);
    expect(ledger.lines.find((line) => line.key === "buyerAgentCommission")).toMatchObject({ label: "Buyer's agent commission", cents: 2_000_000, counterInputId: "loi-agent-commission" });
    expect(ledger.lines.find((line) => line.key === "rentBack")).toMatchObject({ cents: 300_000, counterInputId: "loi-rentback-amount" });
    expect(ledger.lines.at(-1)).toMatchObject({ key: "sellerCredit", cents: 500_000, counterInputId: "loi-credit" });
  });

  it("adds up to the stored seller cash before payoff", () => {
    const terms: LoiTermsV1 = { ...cashTerms, costsAndCredits: { ...cashTerms.costsAndCredits, sellerCreditCents: 100_000, sellerCreditIncluded: true, closingCostEstimates: { buyerEscrowCents: null, sellerEscrowCents: null, buyerTitleInsuranceCents: null, sellerTitleInsuranceCents: null, buyerOtherClosingCostsCents: null, sellerOtherClosingCostsCents: 150_000, sellerAgentCommissionAmount: "2.5%", note: "", otherCostsExcludeItemized: true, itemizedCosts: { transferTaxes: { amountCents: 110_000 }, governmentRetrofit: { amountCents: 40_000 } } } } };
    const ledger = ledgerFor(terms);
    const [price, ...costs] = ledger.lines;
    expect(price!.cents! - costs.reduce((sum, line) => sum + (line.cents ?? 0), 0)).toBe(ledger.totalCents);
    expect(ledger.totalCents).toBe(calculateLoiSummary(terms).sellerCashBeforePayoffsCents);
    expect(ledger.complete).toBe(true);
  });

  it("describes transfer tax plainly, including who pays", () => {
    expect(loiTransferTaxDescription(cashTerms)).toBe("County and city tax on the sale price, from an escrow quote · seller pays");
    const scheduled: LoiTermsV1 = { ...cashTerms, costsAndCredits: { ...cashTerms.costsAndCredits, customaryClosingCosts: false, closingCostPayers: { transferTaxes: "SPLIT_EQUALLY", governmentRetrofitItems: "SELLER" }, transferTaxSchedule: "LA_CITY_2026_2027" } };
    expect(loiTransferTaxDescription(scheduled)).toBe("County and city tax on the sale price, at City of Los Angeles rates · split equally");
    expect(ledgerFor(scheduled).lines.find((line) => line.key === "transferTaxes")).toMatchObject({ detail: loiTransferTaxDescription(scheduled), counterInputId: "loi-transfer-tax-payer" });
  });

  it("leaves historical version-one summaries to their stored view", () => {
    const current = calculateLoiSummary(cashTerms);
    const v1 = loiComputedSummaryV1Schema.parse({ calculationVersion: 1, earnestMoneyBps: current.earnestMoneyBps, earnestMoneyCents: current.earnestMoneyCents, effectivePriceAfterSellerCreditCents: current.effectivePriceAfterSellerCreditCents, loanAmountCents: current.loanAmountCents, loanToValueBps: current.loanToValueBps, remainingDownPaymentAfterDepositCents: current.remainingDownPaymentAfterDepositCents });
    expect(loiSellerLedger(cashTerms, v1)).toBeNull();
  });
});

describe("new LOI celebration", () => {
  it("has a single owner switch and no motion for reduced-motion viewers", () => {
    const source = readFileSync(path.resolve("components/loi/loi-received-celebration.tsx"), "utf8");
    expect(source).toContain("export const LOI_RECEIVED_CELEBRATION_ENABLED = true;");
    expect(source).toContain("if (!LOI_RECEIVED_CELEBRATION_ENABLED) return;");
    const css = readFileSync(path.resolve("components/loi/loi-received-celebration.css"), "utf8");
    expect(css).toMatch(/@media \(prefers-reduced-motion: reduce\) \{\s+\.loi-received \{\s+animation: none;\s+\}\s+\.loi-received-burst \{\s+display: none;/);
  });
});
