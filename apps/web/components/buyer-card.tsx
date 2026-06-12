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

  // Helper for "Looking in..." neighborhoods
  let lookingIn = `Woodland Hills, Tarzana, Encino`;
  if (buyer.name.includes("Alex")) {
    lookingIn = `Sherman Oaks, Studio City, Encino`;
  } else if (buyer.name.includes("Morgan")) {
    lookingIn = `Northridge, Chatsworth, Porter Ranch`;
  } else if (buyer.city) {
    lookingIn = buyer.city;
  }

  // Calculate Match Score based on recommended score
  const isBadgeActive = (badge: any) => badge.status === "active";
  const recommendedScore = (b: Buyer) => {
    return (
      b.badges.filter(isBadgeActive).length * 8 +
      Math.min(b.budgetMax / 250000, 20)
    );
  };
  const score = recommendedScore(buyer);
  const matchPercent = Math.min(98, Math.max(90, Math.round(score + 25)));
  const activeDots = matchPercent >= 95 ? 5 : matchPercent >= 90 ? 4 : matchPercent >= 80 ? 3 : 2;

  return (
    <article className="buyer-row" data-buyer-id={buyer.id}>
      {/* Column 1: Info */}
      <div className="buyer-col-info">
        <Avatar name={buyer.name} initials={initials.slice(0, 2)} size="lg" src={buyer.avatarUrl} />
        <div className="buyer-info-details">
          <h3>{buyer.name}</h3>
          <p className="buyer-location">{buyer.city}, {buyer.state}</p>
          <p className="buyer-looking-in">
            <Icon name="home" size={13} className="home-icon" />
            <span>Looking in {lookingIn}</span>
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
          <svg className="paper-plane-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" width="13" height="13">
            <line x1="22" y1="2" x2="11" y2="13"></line>
            <polygon points="22 2 15 22 11 13 2 9 22 2"></polygon>
          </svg>
        </Link>
        <span className="invite-subtext">Private invite</span>
        
        <div className="match-score-indicator">
          <span className="match-percent">{matchPercent}% match</span>
          <div className="match-dots">
            {[1, 2, 3, 4, 5].map((dot) => (
              <span key={dot} className={`dot ${dot <= activeDots ? "active" : ""}`} />
            ))}
          </div>
        </div>
      </div>
    </article>
  );
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
