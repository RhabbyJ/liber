import { describe, expect, it } from "vitest";
import { calculateLoiEscrowFees, calculateLoiPreview, calculateLoiSummary, loiComputedSummaryV3Schema, loiComputedSummaryV5Schema, type LoiTermsV1 } from "@liber/validators";
import { cashTerms } from "./loi-test-fixtures.test-helper";
import { updateLoiEscrowProvider } from "./loi-editor-values";
import { loiFeeBreakdown } from "./loi-fee-breakdown";
function terms(price = 100_000_000): LoiTermsV1 {
  return { ...structuredClone(cashTerms), purchasePriceCents: price,
    providers: { escrow: { choice: "LIBER_PREFERRED" as const, feePayer: "EACH_OWN" as const }, title: { choice: "LIBER_PREFERRED" as const } },
    costsAndCredits: { ...structuredClone(cashTerms.costsAndCredits), closingCostEstimates: {
      buyerEscrowCents: null, sellerEscrowCents: null, buyerTitleInsuranceCents: 0, sellerTitleInsuranceCents: 0,
      buyerOtherClosingCostsCents: 0, sellerOtherClosingCostsCents: 0, sellerAgentCommissionAmount: "0", note: "",
      itemizedCosts: { transferTaxes: { amountCents: 0 }, governmentRetrofit: { amountCents: 0 } }
    } } };
}
describe("scheduled escrow fees", () => {
  it.each([[100_000_000,205_000],[75_000_000,161_250],[2_000,30_004],[1,30_000],[10_000_000_000,17_530_000]])("uses proportional, per-side half-up cents for %i", (price, fee) => {
    expect(calculateLoiEscrowFees(price,"EACH_OWN")).toEqual({perSideCents:fee,buyerCents:fee,sellerCents:fee});
  });
  it.each([0,-1,0.5,10_000_000_001])("does not calculate a fee for invalid price %s", price => {
    expect(calculateLoiEscrowFees(price,"EACH_OWN").perSideCents).toBeNull();
    expect(calculateLoiPreview(terms(price))).toBeNull();
  });
  it.each(["EACH_OWN","BUYER","SELLER"] as const)("adds %s fees exactly once to cash and proceeds", payer => {
    const value=terms(); const updated={...value,providers:{...value.providers,escrow:{...value.providers.escrow,feePayer:payer}}};
    const buyer=payer==="SELLER"?0:payer==="BUYER"?410_000:205_000;
    const seller=payer==="BUYER"?0:payer==="SELLER"?410_000:205_000;
    expect(calculateLoiSummary(updated)).toMatchObject({calculationVersion:5,escrowFeePerSideCents:205_000,buyerEscrowCents:buyer,sellerEscrowCents:seller,buyerClosingCostsCents:buyer,sellerClosingCostsCents:seller,buyerCashDueAtClosingCents:97_000_000+buyer,sellerCashBeforePayoffsCents:100_000_000-seller,closingCostEstimateComplete:true});
  });
  it("reprices automatic fees after a payer change while retaining quotes and zero overrides", () => {
    const value=terms();
    const buyer=updateLoiEscrowProvider(value,{...value.providers.escrow,feePayer:"BUYER"});
    expect(buyer.costsAndCredits.closingCostEstimates?.buyerEscrowCents).toBeNull();
    expect(calculateLoiSummary({...buyer,purchasePriceCents:75_000_000})).toMatchObject({buyerEscrowCents:322_500,sellerEscrowCents:0});
    value.costsAndCredits.closingCostEstimates!.buyerEscrowCents=0;
    expect(calculateLoiSummary(value)).toMatchObject({buyerEscrowCents:0,sellerEscrowCents:205_000});
    const quoted=updateLoiEscrowProvider(value,{...value.providers.escrow,feePayer:"SELLER"});
    expect(calculateLoiSummary({...quoted,purchasePriceCents:75_000_000})).toMatchObject({buyerEscrowCents:0,sellerEscrowCents:205_000});
    expect(calculateLoiEscrowFees(100_000_000,"BUYER",{buyerEscrowCents:12345,sellerEscrowCents:null})).toMatchObject({buyerCents:12345,sellerCents:0});
  });
  it("preserves V3 stored values and uses frozen V4 fees in the ledger", () => {
    const value=terms();const current=calculateLoiSummary(value);
    const legacy = Object.fromEntries(Object.entries(current).filter(([key]) => !["escrowFeePerSideCents", "buyerEscrowCents", "sellerEscrowCents", "transferTaxSchedule", "laCountyTransferTaxCents", "laCityTransferTaxCents", "measureUlaCents", "measureUlaRateBps", "buyerTransferTaxCents", "sellerTransferTaxCents"].includes(key)));
    const v3={...legacy,calculationVersion:3,buyerClosingCostsCents:0,sellerClosingCostsCents:0,buyerCashDueAtClosingCents:97_000_000,sellerCashBeforePayoffsCents:100_000_000};
    expect(loiComputedSummaryV3Schema.parse(v3)).toEqual(v3);
    const stored={...current,buyerEscrowCents:12345};
    expect(loiComputedSummaryV5Schema.parse(stored).buyerEscrowCents).toBe(12345);
    expect(loiFeeBreakdown({...value,purchasePriceCents:75_000_000},stored).find(row=>row.label==="Escrow fees")?.buyerCents).toBe(12345);
  });
});
