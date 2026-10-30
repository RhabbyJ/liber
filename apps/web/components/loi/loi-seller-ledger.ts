import { loiSideEstimateComplete, type LoiComputedSummary, type LoiTermsV1 } from "@liber/validators";
import { loiTransferTaxDescription } from "./loi-editor-values";
import { loiFeeBreakdown, type LoiFeeRowKey } from "./loi-fee-breakdown";

export type LoiSellerLedgerLine = {
  key: LoiFeeRowKey | "price" | "sellerFinancing" | "sellerCredit";
  label: string;
  detail?: string;
  // The seller's share; null is an unknown estimate. Costs reduce proceeds.
  cents: number | null;
  cost: boolean;
  // Editor input a counter opens, or null when the term is locked in counters.
  counterInputId: string | null;
};

export type LoiSellerLedger = { lines: LoiSellerLedgerLine[]; totalLabel: string; totalCents: number; complete: boolean };

const SELLER_LABELS: Partial<Record<LoiFeeRowKey, string>> = {
  buyerAgentCommission: "Buyer's agent commission",
  sellerAgentCommission: "Your listing agent's commission",
  measureUla: "Measure ULA (City of Los Angeles)",
};

// Funding is copied unchanged into counters and Measure ULA is set by law, so those lines have no counter.
function counterInputId(key: LoiFeeRowKey, terms: LoiTermsV1): string | null {
  const customary = terms.costsAndCredits.customaryClosingCosts;
  switch (key) {
    case "buyerAgentCommission": return "loi-agent-commission";
    case "sellerAgentCommission": return "loi-estimate-seller-commission";
    case "escrow": return "loi-escrow-fee-payer";
    case "title": return "loi-title-fee-payer";
    case "misc": return "loi-estimate-seller-other";
    case "homeWarranty": return "loi-warranty-payer";
    case "transferTaxes": return customary ? "loi-customary-costs" : "loi-transfer-tax-payer";
    case "governmentRetrofit": return customary ? "loi-customary-costs" : "loi-retrofit-payer";
    case "hoaDocument": return "hoa-document-fee-payer";
    case "hoaCertificate": return "hoa-certificate-fee-payer";
    case "hoaTransfer": return "hoa-transfer-fee-payer";
    case "personalProperty": return "loi-personal-property-payer";
    case "rentBack": return "loi-rentback-amount";
    default: return null;
  }
}

// The seller's costs and credits, one line each, in proceeds order. Lines that
// cost the seller nothing in this deal are left out; unknown estimates stay.
export function loiSellerLedger(terms: LoiTermsV1, summary: LoiComputedSummary): LoiSellerLedger | null {
  if (summary.calculationVersion === 1) return null;
  const lines: LoiSellerLedgerLine[] = [{ key: "price", label: "Purchase price", cents: terms.purchasePriceCents, cost: false, counterInputId: "loi-price" }];
  if (terms.funding.type === "SELLER_FINANCING") {
    lines.push({ key: "sellerFinancing", label: "Seller-financed principal", cents: summary.loanAmountCents, cost: true, counterInputId: null });
  }
  for (const row of loiFeeBreakdown(terms, summary)) {
    if (row.sellerCents === 0) continue;
    lines.push({
      key: row.key,
      label: SELLER_LABELS[row.key] ?? row.label,
      detail: row.key === "transferTaxes" ? loiTransferTaxDescription(terms) : undefined,
      cents: row.sellerCents,
      cost: true,
      counterInputId: counterInputId(row.key, terms),
    });
  }
  if (terms.costsAndCredits.sellerCreditCents > 0) {
    lines.push({ key: "sellerCredit", label: "Seller credit to buyer", cents: terms.costsAndCredits.sellerCreditCents, cost: true, counterInputId: "loi-credit" });
  }
  return { lines, totalLabel: "Your cash before loan payoff", totalCents: summary.sellerCashBeforePayoffsCents, complete: loiSideEstimateComplete(summary, "SELLER") };
}
