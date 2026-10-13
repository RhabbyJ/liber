export const BUYER_BUDGET_MAX = 9_999_999_999.99;

// Zillow's list-price filter uses equal-width stops with progressively larger dollar steps.
export const BUYER_BUDGET_STOPS = (() => {
  const values = [0, 50_000];
  for (const [end, step] of [[500_000, 25_000], [1_000_000, 50_000], [2_000_000, 100_000], [5_000_000, 250_000], [10_000_000, 1_000_000]]) {
    while (values.at(-1)! < end) values.push(values.at(-1)! + step);
  }
  return values;
})();

// Profile DTOs map a missing saved budget to 0, and a $0 maximum is never a chosen purchase budget,
// so only a positive saved maximum pre-fills the form. A saved $0 minimum is still kept.
export function savedBuyerBudget(budgetMin: number, budgetMax: number) {
  return budgetMax > 0 ? { max: String(budgetMax), min: String(budgetMin) } : { max: "", min: "" };
}

export function readBuyerBudget(value: string): number | null {
  if (!value.trim()) return null;
  const amount = Number(value);
  return Number.isFinite(amount) && amount >= 0 && amount <= BUYER_BUDGET_MAX ? amount : null;
}

export function buyerBudgetStops(min: number | null, max: number | null) {
  // Keep saved luxury/custom budgets reachable without truncating their exact amount.
  return [...new Set([...BUYER_BUDGET_STOPS, ...[min, max].filter((value): value is number => value !== null && value > 10_000_000)])].sort((a, b) => a - b);
}

export function buyerBudgetIndex(stops: number[], amount: number | null, fallback: number) {
  if (amount === null) return fallback;
  return stops.reduce((best, value, index) => Math.abs(value - amount) < Math.abs(stops[best] - amount) ? index : best, 0);
}

export function moveBuyerBudget(stops: number[], index: number, side: "min" | "max", other: number | null) {
  const amount = stops[Math.max(0, Math.min(stops.length - 1, Math.round(index)))];
  return other === null ? amount : side === "min" ? Math.min(amount, other) : Math.max(amount, other);
}

export function formatBuyerBudget(amount: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: Number.isInteger(amount) ? 0 : 2 }).format(amount);
}
