import Link from "next/link";
import { formatRange } from "../lib/format";
import type { Buyer } from "../lib/mock-data";
import { BadgePill } from "./badge-pill";

export function BuyerCard({
  buyer,
  selectable = false,
  variant = "row",
}: {
  buyer: Buyer;
  selectable?: boolean;
  variant?: "home" | "row";
}) {
  const rating = (
    <span className="rating" aria-label={`${buyer.rating} star rating`}>
      {"★★★★★"}
      <strong>{buyer.rating}</strong>
    </span>
  );

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
      {selectable ? <input aria-label={`Select ${buyer.name}`} type="checkbox" /> : <span />}
      <div className={`buyer-avatar ${buyer.id}`}>{buyer.name.slice(0, 1)}</div>
      <div>
        <h3 style={{ margin: "0 0 6px" }}>{buyer.name}</h3>
        <p className="muted" style={{ margin: 0 }}>{buyer.type}</p>
      </div>
      <div>
        <div className="pill-row">
          {buyer.badges.slice(0, 1).map((badge) => (
            <BadgePill badge={badge} key={badge.label} />
          ))}
        </div>
        <p className="muted" style={{ margin: "8px 0 0" }}>
          {rating} ({buyer.reviewCount} reviews)
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
