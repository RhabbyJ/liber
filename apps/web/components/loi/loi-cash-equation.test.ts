import { describe, expect, it } from "vitest";
import { calculateLoiSummary, type LoiComputedSummary, type LoiTermsV1 } from "@liber/validators";
import { loiBuyerCashParts, loiCashEquations } from "./loi-cash-equation";
import { cashTerms, financedTerms } from "./loi-test-fixtures.test-helper";

describe("LOI displayed cash equations", () => {
  it("breaks buyer cash into deposit, remainder of down payment, and closing costs", () => {
    const terms: LoiTermsV1 = { ...financedTerms, purchasePriceCents: 150_000_000, funding: { ...financedTerms.funding as Extract<LoiTermsV1["funding"], { type: "FINANCED" }>, downPaymentCents: 50_000_000 } };
    const summary = calculateLoiSummary(terms);
    const [buyer] = loiCashEquations(terms, summary);
    expect(buyer!.rows).toEqual([
      { label: "Earnest-money deposit (EMD)", operator: "", cents: 4_500_000 },
      { label: "Remainder of down payment", operator: "+", cents: 45_500_000 },
      { label: "Closing costs", operator: "+", cents: summary.buyerClosingCostsCents },
    ]);
    expect(buyer!.totalCents).toBe(50_000_000 + summary.buyerClosingCostsCents);
    expect(buyer!.paidAs).toEqual([{ label: "Due at closing, after your deposit", cents: 45_500_000 + summary.buyerClosingCostsCents }]);

    const credited: LoiTermsV1 = { ...terms, costsAndCredits: { ...terms.costsAndCredits, sellerCreditCents: 100_000, sellerCreditIncluded: true } };
    const parts = loiBuyerCashParts(credited, calculateLoiSummary(credited));
    expect(parts).toMatchObject({ depositCents: 4_500_000, remainderCents: 45_500_000, netOfCredits: true });
    expect(parts.depositCents + parts.remainderCents + parts.netClosingCostsCents).toBe(parts.totalCents);
  });

  it.each([cashTerms, financedTerms])("balances both parties using stored summary figures", (base) => {
    const terms: LoiTermsV1 = { ...base, possession: { type: "SELLER_RENT_BACK", days: 30, amountCents: 300_000, frequency: "THROUGH_ESCROW" }, representation: { ...base.representation, buyerRepresented: true, agent: { ...base.representation.agent, name: "Synthetic Agent", email: "agent@example.test" }, commissionAmount: "2.5%", commissionPayer: "SELLER" }, costsAndCredits: { ...base.costsAndCredits, sellerCreditCents: 100_000, sellerCreditIncluded: true } };
    const summary = calculateLoiSummary(terms);
    for (const equation of loiCashEquations(terms, summary)) {
      expect(equation.rows.reduce((sum, row) => sum + (row.operator === "−" ? -row.cents : row.cents), 0)).toBe(equation.totalCents);
    }
    const seller = loiCashEquations(terms, summary)[1];
    expect(seller.rows.find((row) => row.label === "Seller closing costs")?.cents).toBe(summary.sellerClosingCostsCents - 300_000);
    expect(seller.rows.filter((row) => row.label.includes("Rent-back"))).toHaveLength(1);
  });

  it("shows seller-financed principal separately from cash proceeds", () => {
    const terms: LoiTermsV1 = { ...cashTerms, funding: { type: "SELLER_FINANCING", principalCents: 80_000_000, cashDownPaymentCents: 20_000_000, annualInterestBps: 600, amortizationMonths: 360, termMonths: 360, balloonMonth: null, interestOnly: false, note: "" } };
    const summary = calculateLoiSummary(terms);
    const equations = loiCashEquations(terms, summary);
    expect(equations[0].rows.slice(0, 2)).toEqual([
      { label: "Earnest-money deposit (EMD)", operator: "", cents: 3_000_000 },
      { label: "Remainder of down payment", operator: "+", cents: 17_000_000 },
    ]);
    expect(equations[1].rows.find((row) => row.label === "Seller-financed principal")?.cents).toBe(80_000_000);
    for (const equation of equations) expect(equation.rows.reduce((sum, row) => sum + (row.operator === "−" ? -row.cents : row.cents), 0)).toBe(equation.totalCents);
  });

  it("keeps historical version two and negative balances intact, and hides unsupported version one equations", () => {
    const current = calculateLoiSummary(cashTerms);
    const historical: LoiComputedSummary = { calculationVersion: 2, earnestMoneyBps: current.earnestMoneyBps, earnestMoneyCents: current.earnestMoneyCents, effectivePriceAfterSellerCreditCents: current.effectivePriceAfterSellerCreditCents, loanAmountCents: current.loanAmountCents, loanToValueBps: current.loanToValueBps, remainingDownPaymentAfterDepositCents: current.remainingDownPaymentAfterDepositCents, buyerAgentCommissionCents: 123, sellerAgentCommissionCents: 456, buyerClosingCostsCents: 789, sellerClosingCostsCents: 900, buyerCashDueAtClosingCents: -123, sellerCashBeforePayoffsCents: 456, closingCostEstimateComplete: false };
    // The buyer total counts the deposit; the stored balance due at closing stays exactly as frozen.
    expect(loiCashEquations(cashTerms, historical).map((equation) => equation.totalCents)).toEqual([-123 + current.earnestMoneyCents, 456]);
    expect(loiCashEquations(cashTerms, historical)[0].paidAs?.map((part) => part.cents)).toEqual([-123]);
    expect(loiCashEquations(cashTerms, historical)[1].rows.find((row) => row.label === "Seller closing costs")?.cents).toBe(900);
    expect(loiCashEquations(cashTerms, { calculationVersion: 1, earnestMoneyBps: current.earnestMoneyBps, earnestMoneyCents: current.earnestMoneyCents, effectivePriceAfterSellerCreditCents: current.effectivePriceAfterSellerCreditCents, loanAmountCents: current.loanAmountCents, loanToValueBps: current.loanToValueBps, remainingDownPaymentAfterDepositCents: current.remainingDownPaymentAfterDepositCents })).toEqual([]);
  });
});
