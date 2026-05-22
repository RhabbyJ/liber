export function formatMoney(value?: number | null) {
  if (value === undefined || value === null) return "Not set";
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(value);
}

export function formatRange(min?: number | null, max?: number | null) {
  if (min && max) return `${formatMoney(min)} - ${formatMoney(max)}`;
  if (min) return `${formatMoney(min)}+`;
  if (max) return `Up to ${formatMoney(max)}`;
  return "Not set";
}

export function formatBadgeType(value: string) {
  const labels: Record<string, string> = {
    PRE_APPROVED: "Admin-verified pre-approval",
    EARNEST_MONEY_DEPOSITED: "Earnest money review",
    CASH_BUYER: "Cash buyer",
    NON_CONTINGENT: "Non-contingent",
    VERIFIED_IDENTITY: "Verified identity",
    VERIFIED_FUNDS: "Verified funds",
    COMPLETED_TRANSACTION: "Completed transaction",
  };

  if (labels[value]) return labels[value];

  return value
    .toLowerCase()
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ")
    .replace("Stnl", "STNL");
}
