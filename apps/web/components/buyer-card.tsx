import Link from "next/link";
import { formatRange } from "../lib/format";
import type { Buyer } from "../lib/mock-data";
import { Avatar } from "./avatar";
import { BadgePill } from "./badge-pill";
import { Icon } from "./icon";
import { RatingStars } from "./rating-stars";

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

  return (
    <article className="buyer-row" data-buyer-id={buyer.id}>
      <Avatar name={buyer.name} size="lg" src={buyer.avatarUrl} />
      <div>
        <div className="buyer-row-head">
          <h3>{buyer.name}</h3>
          <RatingStars rating={buyer.rating} reviewCount={buyer.reviewCount} />
        </div>
        <p className="muted small" style={{ marginTop: 4 }}>{buyer.type} · {buyer.location}</p>
        <div className="buyer-row-detail">
          <span className="status-dot">
            <Icon name="money" size={12} />
            {formatRange(buyer.budgetMin, buyer.budgetMax)}
          </span>
          <span className="status-dot">
            <Icon name="tag" size={12} />
            {buyer.purpose}
          </span>
        </div>
      </div>
      <div className="stack tight">
        {activeBadges.length > 0 ? (
          <div className="pill-row">
            {activeBadges.slice(0, 2).map((badge) => (
              <BadgePill badge={badge} key={badge.label} />
            ))}
          </div>
        ) : (
          <span className="muted small">No active badges</span>
        )}
        {buyer.needs.length > 0 ? (
          <p className="muted small" style={{ margin: 0 }}>
            {buyer.needs.slice(0, 2).join(" · ")}
          </p>
        ) : null}
      </div>
      <div className="buyer-row-actions">
        <Link className="button primary sm" href={`/seller/invite/${buyer.id}`}>
          <Icon name="mail" size={13} />
          Send invite
        </Link>
        <Link className="button ghost sm" href={`/buyers/${buyer.id}`}>
          View profile
          <Icon name="arrow-right" size={13} />
        </Link>
      </div>
    </article>
  );
}
