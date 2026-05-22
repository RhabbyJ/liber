import Link from "next/link";
import { notFound } from "next/navigation";
import { BadgePill } from "../../../components/badge-pill";
import { RatingStars } from "../../../components/rating-stars";
import { formatRange } from "../../../lib/format";
import { getPublicBuyerProfile } from "../../../server/contracts";
import { getSessionUser } from "../../../server/session";

export default async function PublicBuyerProfilePage({
  params,
}: {
  params: Promise<{ buyerProfileId: string }>;
}) {
  const { buyerProfileId } = await params;
  const { data: buyer } = await getPublicBuyerProfile(buyerProfileId).catch(() => ({ data: null }));
  const user = await getSessionUser();

  if (!buyer) notFound();

  const activeBadges = buyer.badges.filter((badge) => badge.status === "active");
  const invitePath = `/seller/invite/${buyer.id}`;
  const inviteHref = user ? invitePath : `/login?next=${encodeURIComponent(invitePath)}`;

  return (
    <div className="page">
      <section className="public-profile">
        <aside className="stack">
          <div className="profile-photo">
            {buyer.avatarUrl ? (
              <img src={buyer.avatarUrl} alt={`${buyer.name} profile photo`} />
            ) : null}
          </div>
          <div>
            <h3>Bio:</h3>
            <p className="muted">{buyer.bio}</p>
          </div>
        </aside>

        <article className="public-profile-main">
          <div className="public-profile-summary">
            <div className="section-head">
              <div>
                <h1 style={{ margin: "0 0 8px" }}>{buyer.name}</h1>
                <p className="muted" style={{ margin: 0 }}>{buyer.location}</p>
                <p className="eyebrow" style={{ marginTop: 14 }}>{buyer.type}</p>
              </div>
              <span className="muted">Bookmark</span>
            </div>
            <div>
              <p className="muted">Rankings</p>
              <RatingStars rating={buyer.rating} reviewCount={buyer.reviewCount} />
            </div>
            <div className="pill-row">
              {activeBadges.map((badge) => (
                <BadgePill badge={badge} key={badge.label} />
              ))}
            </div>
            <div className="summary-grid">
              <div>
                <span className="muted">Buying for: </span>
                <strong>{buyer.purpose}</strong>
              </div>
              <strong>{formatRange(buyer.downPaymentMin, buyer.downPaymentMax)} down</strong>
              <strong>{formatRange(buyer.budgetMin, buyer.budgetMax)}</strong>
            </div>
            <Link className="button self-start" href={inviteHref}>Send Invite</Link>
          </div>

          <div>
            <h2>{buyer.name.replace(".", "")}&apos;s wants and needs</h2>
            <div className="grid two">
              <div>
                <p className="eyebrow">Need:</p>
                <ul className="clean-list">
                  {buyer.needs.map((need) => <li key={need}>{need}</li>)}
                </ul>
              </div>
              <div>
                <p className="eyebrow">Want:</p>
                <ul className="clean-list">
                  {buyer.wants.map((want) => <li key={want}>{want}</li>)}
                </ul>
              </div>
            </div>
          </div>
        </article>
      </section>
    </div>
  );
}
