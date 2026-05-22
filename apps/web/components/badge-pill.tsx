import type { Badge } from "../lib/mock-data";

export function BadgePill({ badge }: { badge: Badge }) {
  const suffix = badge.expiresInDays !== undefined
    ? ` - expires in ${badge.expiresInDays} days`
    : "";

  return (
    <span className={`pill ${badge.status === "active" ? "active" : ""}`}>
      {badge.label}
      {suffix}
    </span>
  );
}
