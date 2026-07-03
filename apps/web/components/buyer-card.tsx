import Link from "next/link";
import { formatRange } from "../lib/format";
import type { Buyer } from "../lib/mock-data";
import { Avatar } from "./avatar";
import { BadgePill } from "./badge-pill";
import { Icon } from "./icon";

export function BuyerCard({
  buyer,
  variant = "row",
}: {
  buyer: Buyer;
  variant?: "home" | "row";
}) {
  const activeBadges = buyer.badges.filter((badge) => badge.status === "active");

  if (variant === "home") {
    return (
      <article className="buyer-card" data-buyer-id={buyer.id}>
        <div className="buyer-card-head">
          <Avatar name={buyer.name} size="lg" src={buyer.avatarUrl} />
          <div>
            <h3>{buyer.name}</h3>
            <p className="muted small" style={{ marginTop: 2 }}>{buyer.type} · {buyer.location}</p>
          </div>
        </div>
        <p className="muted">{buyer.bio}</p>
        <div className="buyer-card-stats">
          <div>
            <span className="buyer-card-stat-label">Budget</span>
            <span className="buyer-card-stat-value">{formatRange(buyer.budgetMin, buyer.budgetMax)}</span>
          </div>
          <div>
            <span className="buyer-card-stat-label">Down</span>
            <span className="buyer-card-stat-value">{formatRange(buyer.downPaymentMin, buyer.downPaymentMax)}</span>
          </div>
        </div>
        {activeBadges.length > 0 ? (
          <div className="pill-row">
            {activeBadges.slice(0, 3).map((badge) => (
              <BadgePill badge={badge} key={badge.label} />
            ))}
          </div>
        ) : null}
        <div className="actions inline">
          <Link className="button secondary block" href={`/buyers/${buyer.id}`}>
            View profile
            <Icon name="arrow-right" size={14} />
          </Link>
        </div>
      </article>
    );
  }

  const initials = buyer.name
    .split(" ")
    .map((n) => n.trim().slice(0, 1))
    .join("")
    .toUpperCase();

  const fitSummary = buyerFitSummary(buyer);

  return (
    <article className="buyer-row" data-buyer-id={buyer.id}>
      {/* Column 1: Info */}
      <div className="buyer-col-info">
        <Avatar name={buyer.name} initials={initials.slice(0, 2)} size="lg" src={buyer.avatarUrl} />
        <div className="buyer-info-details">
          <h3>{buyer.name}</h3>
          <p className="buyer-location">{buyer.city}, {buyer.state}</p>
          <p className="buyer-fit-summary">
            <Icon name="home" size={13} className="home-icon" />
            <span>{fitSummary}</span>
          </p>
        </div>
      </div>

      {/* Column 2: Budget */}
      <div className="buyer-col-budget">
        <span className="budget-range-pill">
          {formatKRange(buyer.budgetMin, buyer.budgetMax)}
        </span>
        <span className="budget-label">Purchase budget</span>
      </div>

      {/* Column 3: Trust */}
      <div className="buyer-col-trust">
        <div className="trust-badges-list">
          {activeBadges.some(b => b.type === "PRE_APPROVED") && (
            <span className="trust-badge-item">
              <Icon name="check-shield" size={15} /> Pre-approved
            </span>
          )}
          {activeBadges.some(b => b.type === "CASH_BUYER") && (
            <span className="trust-badge-item">
              <Icon name="check-shield" size={15} /> Cash buyer
            </span>
          )}
          {activeBadges.some(b => b.type === "NON_CONTINGENT") && (
            <span className="trust-badge-item">
              <Icon name="check-shield" size={15} /> Non-contingent
            </span>
          )}
          {!activeBadges.some(b => ["PRE_APPROVED", "CASH_BUYER", "NON_CONTINGENT"].includes(b.type)) && (
            <span className="trust-badge-item disabled">
              <Icon name="shield" size={15} /> Basic account
            </span>
          )}
        </div>
      </div>

      {/* Column 4: Actions & Match */}
      <div className="buyer-col-actions">
        <Link className="button primary invite-btn" href={`/seller/invite/${buyer.id}`}>
          Invite 
          <Icon name="message" size={13} />
        </Link>
        <span className="invite-subtext">Private invite</span>
      </div>
    </article>
  );
}

function buyerFitSummary(buyer: Buyer) {
  const criteria = buyer.criteriaDetails[0];
  const facts = [
    criteria?.bedroomsMin ? `${criteria.bedroomsMin}+ bd` : null,
    criteria?.bathroomsMin ? `${criteria.bathroomsMin}+ ba` : null,
    criteria?.squareFeetMin ? `${criteria.squareFeetMin.toLocaleString()}+ sqft` : null,
    criteria?.condition || null,
    ...(criteria?.features ?? []),
  ].filter((fact): fact is string => Boolean(fact));

  if (facts.length > 0) return facts.slice(0, 4).join(" / ");
  if (buyer.location) return `Target area: ${buyer.location}`;
  return "Home fit criteria not set";
}

function formatKRange(min?: number | null, max?: number | null) {
  const k = (val?: number | null) => {
    if (val === undefined || val === null) return "";
    if (val >= 1000000) {
      return `$${(val / 1000000).toFixed(1).replace(".0", "")}M`;
    }
    return `$${Math.round(val / 1000)}K`;
  };
  if (min && max) return `${k(min)}–${k(max)}`;
  if (min) return `${k(min)}+`;
  if (max) return `Up to ${k(max)}`;
  return "Not set";
}
