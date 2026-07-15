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
