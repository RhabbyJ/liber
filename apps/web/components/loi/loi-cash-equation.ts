import { loiSummaryFromVersion, type LoiComputedSummary, type LoiTermsV1 } from "@liber/validators";

export type LoiCashEquation = {
  label: string;
  rows: { label: string; operator: "" | "+" | "−"; cents: number }[];
  totalLabel: string;
  totalCents: number;
  // When the total is paid; the parts add up to the total.
  paidAs?: { label: string; cents: number }[];
};

type CalculatedLoiSummary = Exclude<LoiComputedSummary, { calculationVersion: 1 }>;

// The buyer's cash as they think about it: the deposit, the rest of the down
// payment, then closing costs less any credits. Parts come from the stored
// total, so they always add up to it, including for historical versions.
export function loiBuyerCashParts(terms: LoiTermsV1, summary: CalculatedLoiSummary) {
  const totalCents = summary.buyerCashDueAtClosingCents + summary.earnestMoneyCents;
  const downPaymentCents = terms.purchasePriceCents - summary.loanAmountCents;
  const netClosingCostsCents = totalCents - downPaymentCents;
  return {
    cashPurchase: terms.funding.type === "CASH",
    depositCents: summary.earnestMoneyCents,
    dueAtClosingCents: summary.buyerCashDueAtClosingCents,
    netClosingCostsCents,
    // True when seller credit or rent-back reduces the closing costs shown.
    netOfCredits: netClosingCostsCents !== summary.buyerClosingCostsCents,
    remainderCents: downPaymentCents - summary.earnestMoneyCents,
    totalCents,
  };
}

// Use the displayed summary, including immutable historical figures. Never
// recalculate a submitted revision with a newer calculation version.
export function loiCashEquations(terms: LoiTermsV1, summary: LoiComputedSummary): LoiCashEquation[] {
  if (summary.calculationVersion === 1) return [];
  const rentBack = loiSummaryFromVersion(summary, 3) ? summary.rentBackAtClosingCents : 0;
  const buyer = loiBuyerCashParts(terms, summary);
  const sellerCreditCents = terms.costsAndCredits.sellerCreditCents;
  return [
    {
      label: "Buyer cash calculation",
      // The deposit is part of the down payment, so it counts toward the total rather than adding to it.
      rows: [
        { label: "Earnest-money deposit (EMD)", operator: "", cents: buyer.depositCents },
        { label: buyer.cashPurchase ? "Remainder of purchase price" : "Remainder of down payment", operator: buyer.remainderCents < 0 ? "−" : "+", cents: Math.abs(buyer.remainderCents) },
        { label: "Closing costs", operator: "+", cents: summary.buyerClosingCostsCents },
        ...(sellerCreditCents ? [{ label: "Seller credit", operator: "−" as const, cents: sellerCreditCents }] : []),
        ...(rentBack ? [{ label: "Rent-back received at closing", operator: "−" as const, cents: rentBack }] : []),
      ],
      totalLabel: "Estimated total cash needed",
      totalCents: buyer.totalCents,
      paidAs: [{ label: "Due at closing, after your deposit", cents: buyer.dueAtClosingCents }],
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
