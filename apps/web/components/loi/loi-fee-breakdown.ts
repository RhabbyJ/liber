import { calculateLoiCostAllocation, loiSummaryFromVersion, type LoiComputedSummary, type LoiTermsV1 } from "@liber/validators";
import { LOI_ITEMIZED_COST_FIELDS, loiItemizedCostPayer, type LoiItemizedCostKey } from "./loi-editor-values";

export type LoiFeeRowKey = "buyerAgentCommission" | "sellerAgentCommission" | "escrow" | "title" | "misc" | "homeWarranty" | LoiItemizedCostKey | "measureUla" | "rentBack" | "storedAdjustment";
// `sellerOnly` rows never apply to the buyer, so buyer views omit them.
export type LoiFeeRow = { key: LoiFeeRowKey; label: string; buyerCents: number | null; sellerCents: number | null; sellerOnly?: true };

export function loiFeeBreakdown(terms: LoiTermsV1, summary: LoiComputedSummary): LoiFeeRow[] {
  if (summary.calculationVersion === 1) return [];
  const estimates = terms.costsAndCredits.closingCostEstimates;
  const commissionPayer = terms.representation.buyerRepresented ? terms.representation.commissionPayer : null;
  const rows: LoiFeeRow[] = [
    { key: "buyerAgentCommission", label: "Buyer agent commission", buyerCents: commissionPayer === "BUYER" ? summary.buyerAgentCommissionCents : 0, sellerCents: commissionPayer === "SELLER" ? summary.buyerAgentCommissionCents : 0 },
    { key: "sellerAgentCommission", label: "Seller agent commission", buyerCents: 0, sellerCents: summary.sellerAgentCommissionCents, sellerOnly: true },
    loiSummaryFromVersion(summary, 4)
      ? { key: "escrow", label: "Escrow fees", buyerCents: summary.buyerEscrowCents, sellerCents: summary.sellerEscrowCents }
      : { key: "escrow", label: "Escrow fees", buyerCents: terms.providers.escrow.feePayer === "SELLER" ? 0 : estimates?.buyerEscrowCents ?? null, sellerCents: terms.providers.escrow.feePayer === "BUYER" ? 0 : estimates?.sellerEscrowCents ?? null },
    // V6 stores the resolved amounts, including scheduled estimates for blank fields.
    loiSummaryFromVersion(summary, 6)
      ? { key: "title", label: "Title policy", buyerCents: summary.buyerTitleInsuranceCents, sellerCents: summary.sellerTitleInsuranceCents }
      : { key: "title", label: "Title policy", buyerCents: terms.providers.title.feePayer === "SELLER" ? 0 : estimates?.buyerTitleInsuranceCents ?? null, sellerCents: terms.providers.title.feePayer === "BUYER" ? 0 : estimates?.sellerTitleInsuranceCents ?? null },
    loiSummaryFromVersion(summary, 6)
      ? { key: "misc", label: "Misc. closing costs", buyerCents: summary.buyerOtherClosingCostsCents, sellerCents: summary.sellerOtherClosingCostsCents }
      : { key: "misc", label: "Misc. closing costs", buyerCents: estimates?.buyerOtherClosingCostsCents ?? null, sellerCents: estimates?.sellerOtherClosingCostsCents ?? null },
  ];
  if (loiSummaryFromVersion(summary, 3)) {
    rows.push({ key: "homeWarranty", label: "Home warranty", buyerCents: summary.buyerHomeWarrantyCents, sellerCents: summary.sellerHomeWarrantyCents });
    for (const field of LOI_ITEMIZED_COST_FIELDS) {
      if (field.key === "transferTaxes" && loiSummaryFromVersion(summary, 5)) {
        rows.push({ key: field.key, label: field.label, buyerCents: summary.buyerTransferTaxCents, sellerCents: summary.sellerTransferTaxCents === null ? null : summary.sellerTransferTaxCents - (summary.measureUlaCents ?? 0) });
        if (summary.measureUlaCents !== null) rows.push({ key: "measureUla", label: "Measure ULA (seller · City of LA only)", buyerCents: 0, sellerCents: summary.measureUlaCents });
        continue;
      }
      const allocated = calculateLoiCostAllocation(loiItemizedCostPayer(terms, field.key), estimates?.itemizedCosts?.[field.key]);
      rows.push({ key: field.key, label: field.label, buyerCents: allocated.buyerCents, sellerCents: allocated.sellerCents });
    }
    rows.push({ key: "rentBack", label: "Rent-back paid at closing", buyerCents: 0, sellerCents: summary.rentBackAtClosingCents });
  }
  // Frozen historical totals remain authoritative if older calculation rules
  // cannot be fully described by the available terms. Never replace their total.
  const buyerResidual = summary.buyerClosingCostsCents - rows.reduce((sum, row) => sum + (row.buyerCents ?? 0), 0);
  const sellerResidual = summary.sellerClosingCostsCents - rows.reduce((sum, row) => sum + (row.sellerCents ?? 0), 0);
  if (buyerResidual || sellerResidual) rows.push({ key: "storedAdjustment", label: "Stored estimate adjustment", buyerCents: buyerResidual, sellerCents: sellerResidual });
  return rows;
}
