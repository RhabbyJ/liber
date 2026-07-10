import type { Badge } from "../lib/domain-types";
import { Icon } from "./icon";

const badgeIcon: Record<Badge["type"], "shield" | "money" | "diamond" | "star" | "check-shield" | "key" | "doc"> = {
  PRE_APPROVED: "check-shield",
  EARNEST_MONEY_DEPOSITED: "money",
  CASH_BUYER: "diamond",
  NON_CONTINGENT: "key",
  VERIFIED_IDENTITY: "shield",
  VERIFIED_FUNDS: "money",
  COMPLETED_TRANSACTION: "star",
};

export function BadgePill({ badge }: { badge: Omit<Badge, "id"> }) {
  const status = badge.status === "active" ? "active" : badge.status === "expired" ? "expired" : "pending";
  const meta = badge.expiresInDays !== undefined
    ? badge.expiresInDays < 0
      ? "Expired"
      : `${badge.expiresInDays}d left`
    : null;

  return (
    <span className={`trust-badge ${status}`}>
      <span className="trust-badge-icon">
        <Icon name={badgeIcon[badge.type] || "shield"} size={11} />
      </span>
      <span>{badge.label}</span>
      {meta ? <span className="trust-badge-meta">· {meta}</span> : null}
    </span>
  );
}
