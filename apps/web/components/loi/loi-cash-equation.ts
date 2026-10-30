import { loiSummaryFromVersion, type LoiComputedSummary, type LoiTermsV1 } from "@liber/validators";

export type LoiCashEquation = {
  label: string;
  rows: { label: string; operator: "" | "+" | "−"; cents: number }[];
  totalLabel: string;
  totalCents: number;
  // When the total is paid; the parts add up to the total.
  paidAs?: { label: string; cents: number }[];
};

// Use the displayed summary, including immutable historical figures. Never
// recalculate a submitted revision with a newer calculation version.
export function loiCashEquations(terms: LoiTermsV1, summary: LoiComputedSummary): LoiCashEquation[] {
  if (summary.calculationVersion === 1) return [];
  const rentBack = loiSummaryFromVersion(summary, 3) ? summary.rentBackAtClosingCents : 0;
  return [
    {
      label: "Buyer cash calculation",
      rows: [
        { label: "Down payment / cash purchase", operator: "", cents: terms.purchasePriceCents - summary.loanAmountCents },
        { label: "Buyer closing costs", operator: "+", cents: summary.buyerClosingCostsCents },
        { label: "Seller credit", operator: "−", cents: terms.costsAndCredits.sellerCreditCents },
        ...(rentBack ? [{ label: "Rent-back received at closing", operator: "−" as const, cents: rentBack }] : []),
      ],
      // The deposit is part of the down payment, so it counts toward the total rather than adding to it.
      totalLabel: "Estimated total cash needed",
      totalCents: summary.buyerCashDueAtClosingCents + summary.earnestMoneyCents,
      paidAs: [
        { label: "Earnest-money deposit, paid after acceptance", cents: summary.earnestMoneyCents },
        { label: "Balance due at closing", cents: summary.buyerCashDueAtClosingCents },
      ],
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
