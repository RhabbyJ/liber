import type { LoiComputedSummary, LoiTermsV1 } from "@liber/validators";

export type LoiCashEquation = {
  label: string;
  rows: { label: string; operator: "" | "+" | "−"; cents: number }[];
  totalLabel: string;
  totalCents: number;
};

// Use the displayed summary, including immutable historical figures. Never
// recalculate a submitted revision with a newer calculation version.
export function loiCashEquations(terms: LoiTermsV1, summary: LoiComputedSummary): LoiCashEquation[] {
  if (summary.calculationVersion === 1) return [];
  const rentBack = (summary.calculationVersion === 3 || (summary.calculationVersion === 4 || summary.calculationVersion === 5)) ? summary.rentBackAtClosingCents : 0;
  return [
    {
      label: "Buyer cash calculation",
      rows: [
        { label: "Down payment / cash purchase", operator: "", cents: terms.purchasePriceCents - summary.loanAmountCents },
        { label: "Earnest-money deposit", operator: "−", cents: summary.earnestMoneyCents },
        { label: "Buyer closing costs", operator: "+", cents: summary.buyerClosingCostsCents },
        { label: "Seller credit", operator: "−", cents: terms.costsAndCredits.sellerCreditCents },
        ...(rentBack ? [{ label: "Rent-back received at closing", operator: "−" as const, cents: rentBack }] : []),
      ],
      totalLabel: "Expected cash to close",
      totalCents: summary.buyerCashDueAtClosingCents,
    },
    {
      label: "Seller cash calculation",
      rows: [
        { label: "Purchase price", operator: "", cents: terms.purchasePriceCents },
        ...(terms.funding.type === "SELLER_FINANCING" ? [{ label: "Seller-financed principal", operator: "−" as const, cents: summary.loanAmountCents }] : []),
        { label: "Seller closing costs", operator: "−", cents: summary.sellerClosingCostsCents - rentBack },
        { label: "Seller credit", operator: "−", cents: terms.costsAndCredits.sellerCreditCents },
        ...(rentBack ? [{ label: "Rent-back paid at closing", operator: "−" as const, cents: rentBack }] : []),
      ],
      totalLabel: "Seller cash before mortgage payoffs",
      totalCents: summary.sellerCashBeforePayoffsCents,
    },
  ];
}
