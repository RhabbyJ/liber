import { LOI_MAX_PRICE_CENTS } from "@liber/validators";

// Accept a leading "$" and thousands separators, as people type amounts, so
// every keystroke that forms a valid amount reaches the live calculator.
export function parseLoiMoneyInput(value: string): { cents: number | null; error: string | null } {
  const normalized = value.trim().replace(/^\$\s*/, "").replace(/,/g, "");
  if (!normalized) return { cents: null, error: null };
  if (!/^(?:\d+(?:\.\d{0,2})?|\.\d{1,2})$/.test(normalized)) return { cents: null, error: "Enter a dollar amount, such as 450,000 or 450,000.50." };
  const [whole, fraction = ""] = normalized.split(".");
  const cents = Number(whole || "0") * 100 + Number(fraction.padEnd(2, "0"));
  return Number.isSafeInteger(cents) && cents <= LOI_MAX_PRICE_CENTS
    ? { cents, error: null }
    : { cents: null, error: "Enter $100,000,000 or less." };
}

export function formatLoiMoneyInput(cents: number | null) {
  if (cents === null) return "";
  return new Intl.NumberFormat("en-US", { maximumFractionDigits: 2, minimumFractionDigits: cents % 100 ? 2 : 0 }).format(cents / 100);
}
