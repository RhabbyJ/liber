import Link from "next/link";
import { formatRange } from "../lib/format";
import type { SellerBuyerSummaryDTO } from "../lib/buyer-dtos";
import { BadgePill } from "./badge-pill";
import { GeneratedAvatar } from "./generated-avatar";
import { Icon } from "./icon";

export function BuyerCard({
  buyer,
  variant = "row",
}: {
  buyer: SellerBuyerSummaryDTO;
  variant?: "home" | "row";
}) {
  const activeBadges = buyer.badges.filter((badge) => badge.status === "active");
  const profileSummary = [buyer.type, buyer.purpose].filter(Boolean).join(" - ") || "Buyer";
  const profileLocationSummary = [profileSummary, buyer.location].filter(Boolean).join(" - ");

  if (variant === "home") {
    return (
      <article className="buyer-card" data-buyer-id={buyer.id}>
        <div className="buyer-card-head">
          <GeneratedAvatar seed={buyer.avatarSeed} size="lg" variant={buyer.avatarVariant} />
          <div>
            <h3>{buyer.name}</h3>
            {buyer.isDemo ? <span className="status-dot warning">Demo buyer</span> : null}
            <p className="muted small" style={{ marginTop: 2 }}>
              {profileLocationSummary}
            </p>
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

  const fitSummary = buyerFitSummary(buyer);
  const preApprovalBadge = activeBadges.find((badge) => badge.type === "PRE_APPROVED");

  return (
    <article className="buyer-row" data-buyer-id={buyer.id}>
      <div className="buyer-row-profile">
        <GeneratedAvatar seed={buyer.avatarSeed} size="lg" variant={buyer.avatarVariant} />
        <div>
          <h3>{buyer.name}</h3>
          {buyer.isDemo ? <span className="status-dot warning">Demo buyer</span> : null}
          <p>{profileSummary}</p>
        </div>
      </div>

      <div className="buyer-row-status">
        <div className={preApprovalBadge ? "buyer-row-status-label active" : "buyer-row-status-label"}>
          {preApprovalBadge ? (
            <span className="buyer-row-status-icon">
              <Icon name="check-shield" size={15} />
            </span>
          ) : null}
          <strong>{preApprovalBadge ? "Pre-approved" : "Not pre-approved"}</strong>
        </div>
        <span>{buyerApprovalSummary(preApprovalBadge)}</span>
      </div>

      <div className="buyer-row-fit">
        <strong>{formatRange(buyer.budgetMin, buyer.budgetMax)}</strong>
        <span>{fitSummary}</span>
      </div>

      <Link className="buyer-row-see-more" href={`/buyers/${buyer.id}`}>
        View profile
      </Link>
    </article>
  );
}

function buyerFitSummary(buyer: SellerBuyerSummaryDTO) {
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

function buyerApprovalSummary(badge?: { expiresInDays?: number }) {
  if (!badge) return "No verified pre-approval";
  if (typeof badge.expiresInDays === "number") {
    return `Expires in ${badge.expiresInDays} day${badge.expiresInDays === 1 ? "" : "s"}`;
  }
  return "Verified by Liber";
}
