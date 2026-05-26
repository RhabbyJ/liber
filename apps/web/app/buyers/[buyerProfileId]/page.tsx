import Link from "next/link";
import { notFound } from "next/navigation";
import { BadgePill } from "../../../components/badge-pill";
import { RatingStars } from "../../../components/rating-stars";
import { formatRange } from "../../../lib/format";
import { getPublicBuyerProfile } from "../../../server/contracts";
import { getSessionUser } from "../../../server/session";

export const metadata = {
  robots: "noindex, noarchive",
};

export default async function PublicBuyerProfilePage({
  params,
}: {
  params: Promise<{ buyerProfileId: string }>;
}) {
  const { buyerProfileId } = await params;
  const result = await getPublicBuyerProfile(buyerProfileId);
  const user = await getSessionUser();

  if (!result.ok) {
    if (result.error === "NOT_FOUND") notFound();
    return (
      <div className="page stack">
        <section className="card stack">
          <p className="eyebrow">Buyer profile</p>
          <h1>Access unavailable</h1>
          <p className="muted">
            Buyer profiles are only available to approved sellers, admins, or the buyer who owns the profile.
          </p>
          <Link className="button self-start" href="/seller/search">View seller access status</Link>
        </section>
      </div>
    );
  }

  const buyer = result.data;
  const activeBadges = buyer.badges.filter((badge) => badge.status === "active");
  const invitePath = `/seller/invite/${buyer.id}`;
  const inviteHref = buyer.viewerCanInvite
    ? user ? invitePath : `/login?next=${encodeURIComponent(invitePath)}`
    : null;

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
            {inviteHref ? <Link className="button self-start" href={inviteHref}>Send Invite</Link> : null}
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
