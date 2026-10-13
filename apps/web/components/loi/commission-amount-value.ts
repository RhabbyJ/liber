export type CommissionAmountUnit = "PERCENT" | "DOLLAR";
export type CommissionAmountInput = { unit: CommissionAmountUnit; amount: string };

export function readCommissionAmount(value: string): CommissionAmountInput {
  const text = value.trim();
  if (!text) return { unit: "PERCENT", amount: "" };
  if (!text.startsWith("$") && text.endsWith("%")) {
    return { unit: "PERCENT", amount: text.slice(0, -1).trim() };
  }
  return { unit: "DOLLAR", amount: text.replace(/^\$\s*/, "") };
}

export function writeCommissionAmount({ unit, amount }: CommissionAmountInput) {
  const text = amount.trim();
  // Strip only the selected unit's notation. A conflicting pasted symbol must
  // remain invalid rather than silently changing a financial amount's meaning.
  // A trailing decimal point ("2." on the way to "2.5") keeps the typed whole
  // amount, so the live calculator does not flicker to an invalid commission.
  const number = (unit === "PERCENT" ? text.replace(/%$/, "").trim() : text.replace(/^\$\s*/, "")).replace(/(\d)\.$/, "$1");
  if (!number) return "";
  return unit === "PERCENT" ? `${number}%` : `$${number}`;
}

export function selectCommissionAmountUnit(current: CommissionAmountInput, unit: CommissionAmountUnit): CommissionAmountInput {
  return current.unit === unit ? current : { unit, amount: "" };
}
