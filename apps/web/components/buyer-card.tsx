import Link from "next/link";
import { formatRange } from "../lib/format";
import type { Buyer } from "../lib/mock-data";
import { BadgePill } from "./badge-pill";
import { RatingStars } from "./rating-stars";

export function BuyerCard({
  buyer,
  variant = "row",
}: {
  buyer: Buyer;
  variant?: "home" | "row";
}) {
  const activeBadges = buyer.badges.filter((badge) => badge.status === "active");
  const rating = <RatingStars rating={buyer.rating} />;

  if (variant === "home") {
    return (
      <article className="buyer-card home">
        <div className={`buyer-card-media ${buyer.id}`} />
        <div className="buyer-card-body">
          <h3 style={{ margin: 0 }}>{buyer.name}</h3>
          <p className="muted" style={{ margin: 0 }}>{buyer.bio}</p>
          <div className="section-head compact">
            <span>Rating</span>
            {rating}
          </div>
        </div>
      </article>
    );
  }

  return (
    <article className="buyer-row">
      <span />
      <div className={`buyer-avatar ${buyer.id}`}>{buyer.name.slice(0, 1)}</div>
      <div>
        <h3 style={{ margin: "0 0 6px" }}>{buyer.name}</h3>
        <p className="muted" style={{ margin: 0 }}>{buyer.type}</p>
      </div>
      <div>
        <div className="pill-row">
          {activeBadges.slice(0, 1).map((badge) => (
            <BadgePill badge={badge} key={badge.label} />
          ))}
        </div>
        <p className="muted" style={{ margin: "8px 0 0" }}>
          <RatingStars rating={buyer.rating} reviewCount={buyer.reviewCount} />
        </p>
      </div>
      <div className="actions inline">
        <Link href={`/buyers/${buyer.id}`}>See More</Link>
        <Link className="button" href={`/seller/invite/${buyer.id}`}>Send Invite</Link>
      </div>
      <span className="muted" style={{ gridColumn: "3 / -1" }}>
        {buyer.purpose} · {formatRange(buyer.budgetMin, buyer.budgetMax)}
      </span>
    </article>
  );
}
