import type { LoiComputedSummary } from "@liber/validators";
import { parseLoiMoneyInput } from "./loi-money-input";

export function parseSellerLoanPayoff(value: string): { cents: number | null; error: string | null } {
  return parseLoiMoneyInput(value);
}

export function sellerNetProceeds(summary: LoiComputedSummary | null, payoffCents: number | null): number | null {
  if (!summary || summary.calculationVersion === 1 || payoffCents === null) return null;
  return summary.sellerCashBeforePayoffsCents - payoffCents;
}
