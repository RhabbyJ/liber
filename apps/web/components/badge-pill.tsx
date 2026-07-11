import { Icon } from "./icon";

type DisplayBadge = {
  type: string;
  label: string;
  status: "active" | "pending" | "expired";
  expiresInDays?: number;
};

const badgeIcon: Record<string, "shield" | "money" | "diamond" | "check-shield"> = {
  PRE_APPROVED: "check-shield",
  CASH_BUYER: "diamond",
  VERIFIED_IDENTITY: "shield",
  VERIFIED_FUNDS: "money",
};

export function BadgePill({ badge }: { badge: DisplayBadge }) {
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
