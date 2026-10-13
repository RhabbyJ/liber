import { calculateLoiCostAllocation, type LoiComputedSummary, type LoiTermsV1 } from "@liber/validators";
import { LOI_ITEMIZED_COST_FIELDS, loiItemizedCostPayer } from "./loi-editor-values";

export type LoiFeeRow = { label: string; buyerCents: number | null; sellerCents: number | null };

export function loiFeeBreakdown(terms: LoiTermsV1, summary: LoiComputedSummary): LoiFeeRow[] {
  if (summary.calculationVersion === 1) return [];
  const estimates = terms.costsAndCredits.closingCostEstimates;
  const commissionPayer = terms.representation.buyerRepresented ? terms.representation.commissionPayer : null;
  const rows: LoiFeeRow[] = [
    { label: "Buyer agent commission", buyerCents: commissionPayer === "BUYER" ? summary.buyerAgentCommissionCents : 0, sellerCents: commissionPayer === "SELLER" ? summary.buyerAgentCommissionCents : 0 },
    { label: "Seller agent commission", buyerCents: 0, sellerCents: summary.sellerAgentCommissionCents },
    { label: "Escrow fees", buyerCents: (summary.calculationVersion === 4 || summary.calculationVersion === 5) ? summary.buyerEscrowCents : terms.providers.escrow.feePayer === "SELLER" ? 0 : estimates?.buyerEscrowCents ?? null, sellerCents: (summary.calculationVersion === 4 || summary.calculationVersion === 5) ? summary.sellerEscrowCents : terms.providers.escrow.feePayer === "BUYER" ? 0 : estimates?.sellerEscrowCents ?? null },
    { label: "Title insurance", buyerCents: terms.providers.title.feePayer === "SELLER" ? 0 : estimates?.buyerTitleInsuranceCents ?? null, sellerCents: terms.providers.title.feePayer === "BUYER" ? 0 : estimates?.sellerTitleInsuranceCents ?? null },
    { label: "Other closing costs", buyerCents: estimates?.buyerOtherClosingCostsCents ?? null, sellerCents: estimates?.sellerOtherClosingCostsCents ?? null },
  ];
  if ((summary.calculationVersion === 3 || (summary.calculationVersion === 4 || summary.calculationVersion === 5))) {
    rows.push({ label: "Home warranty", buyerCents: summary.buyerHomeWarrantyCents, sellerCents: summary.sellerHomeWarrantyCents });
    for (const field of LOI_ITEMIZED_COST_FIELDS) {
      if (field.key === "transferTaxes" && summary.calculationVersion === 5) {
        rows.push({label: field.label, buyerCents: summary.buyerTransferTaxCents, sellerCents: summary.sellerTransferTaxCents === null ? null : summary.sellerTransferTaxCents - (summary.measureUlaCents ?? 0)});
        if (summary.measureUlaCents !== null) rows.push({label: "Measure ULA (seller)", buyerCents: 0, sellerCents: summary.measureUlaCents});
        continue;
      }
      const allocated = calculateLoiCostAllocation(loiItemizedCostPayer(terms, field.key), estimates?.itemizedCosts?.[field.key]);
      rows.push({ label: field.label, buyerCents: allocated.buyerCents, sellerCents: allocated.sellerCents });
    }
    rows.push({ label: "Rent-back paid at closing", buyerCents: 0, sellerCents: summary.rentBackAtClosingCents });
  }
  // Frozen historical totals remain authoritative if older calculation rules
  // cannot be fully described by the available terms. Never replace their total.
  const buyerResidual = summary.buyerClosingCostsCents - rows.reduce((sum, row) => sum + (row.buyerCents ?? 0), 0);
  const sellerResidual = summary.sellerClosingCostsCents - rows.reduce((sum, row) => sum + (row.sellerCents ?? 0), 0);
  if (buyerResidual || sellerResidual) rows.push({ label: "Stored estimate adjustment", buyerCents: buyerResidual, sellerCents: sellerResidual });
  return rows;
}
