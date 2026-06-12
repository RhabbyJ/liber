import Link from "next/link";
import { notFound } from "next/navigation";
import { Avatar } from "../../../components/avatar";
import { BadgePill } from "../../../components/badge-pill";
import { Icon } from "../../../components/icon";
import { ModeChip } from "../../../components/mode-chip";
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
          <Link className="button self-start" href="/seller/search">
            <Icon name="arrow-right" size={14} />
            View seller access status
          </Link>
        </section>
      </div>
    );
  }

  const buyer = result.data;
  const activeBadges = buyer.badges.filter((badge) => badge.status === "active");
  const otherBadges = buyer.badges.filter((badge) => badge.status !== "active");
  const invitePath = `/seller/invite/${buyer.id}`;
  const inviteHref = buyer.viewerCanInvite
    ? user ? invitePath : `/login?next=${encodeURIComponent(invitePath)}`
    : null;
  const isOwner = buyer.viewerIsOwner;

  return (
    <div className="page wide stack loose">
      <div className="page-title-top">
        <ModeChip mode={isOwner ? "buyer" : "seller"} />
        <span className={`eyebrow${isOwner ? "" : " seller"}`}>
          {isOwner ? "Profile preview · this is what sellers see" : "Buyer profile · seller view"}
        </span>
      </div>

      {isOwner ? (
        <section className="card sage" style={{ padding: 18 }}>
          <div className="section-head compact">
            <div className="stack tight">
              <p className="eyebrow">Preview only</p>
              <h2 style={{ fontSize: 18 }}>This is how sellers see your profile.</h2>
            </div>
            <Link className="button" href="/buyer/profile">
              <Icon name="pencil" size={14} />
              Edit profile
            </Link>
          </div>
        </section>
      ) : null}

      <section className="public-profile">
        <aside className="public-profile-aside">
          <div className="card stack" style={{ alignItems: "center", textAlign: "center" }}>
            <div className="profile-photo">
              <Avatar name={buyer.name} size="xl" src={buyer.avatarUrl} />
            </div>
            <div>
              <h2 style={{ fontSize: 24, margin: 0 }}>{buyer.name}</h2>
              <p className="muted" style={{ marginTop: 6 }}>{buyer.location}</p>
            </div>
            {activeBadges.length > 0 ? (
              <div className="pill-row" style={{ justifyContent: "center" }}>
                {activeBadges.slice(0, 3).map((badge) => (
                  <BadgePill badge={badge} key={badge.label} />
                ))}
              </div>
            ) : null}
            {isOwner ? (
              <Link className="button secondary block" href="/buyer/profile">
                <Icon name="arrow-right" size={14} />
                Back to your profile
              </Link>
            ) : inviteHref ? (
              <Link className="button primary block lg" href={inviteHref}>
                <Icon name="mail" size={16} />
                Send invite
              </Link>
            ) : (
              <span className="status-dot warning">
                <Icon name="lock" size={12} />
                Approved seller access required
              </span>
            )}
            {!isOwner ? (
              <p className="muted small">Outreach is manual. Liber never sends offers on your behalf.</p>
            ) : null}
          </div>

          <div className="card flat stack">
            <p className="eyebrow">Profile freshness</p>
            <p className="muted small">
              Buyers who refresh their profile recently get prioritized in seller search.
            </p>
          </div>
        </aside>

        <article className="public-profile-main">
          <div className="public-profile-summary">
            <div className="section-head">
              <div>
                <p className="eyebrow">{buyer.type}</p>
                <h1 style={{ margin: "8px 0 0" }}>{buyer.name}</h1>
                <p className="muted" style={{ marginTop: 6 }}>{buyer.location}</p>
              </div>
              <button className="button ghost" type="button" aria-label="Bookmark buyer">
                <Icon name="bookmark" size={14} />
                Save
              </button>
            </div>
            <div className="summary-grid">
              <div>
                <span className="summary-label">Buying for</span>
                <span className="summary-value">{buyer.purpose}</span>
              </div>
              <div>
                <span className="summary-label">Budget</span>
                <span className="summary-value">{formatRange(buyer.budgetMin, buyer.budgetMax)}</span>
              </div>
              <div>
                <span className="summary-label">Down payment</span>
                <span className="summary-value">{formatRange(buyer.downPaymentMin, buyer.downPaymentMax)}</span>
              </div>
            </div>
            <div className="stack tight">
              <p className="eyebrow">Bio</p>
              <p>{buyer.bio}</p>
            </div>
          </div>

          {activeBadges.length > 0 ? (
            <div className="card stack">
              <div className="section-head compact">
                <div>
                  <p className="eyebrow">Trust</p>
                  <h2 style={{ fontSize: 22 }}>Verified by Liber</h2>
                </div>
                <span className="status-dot info">
                  <Icon name="lock" size={12} />
                  Documents stay private
                </span>
              </div>
              <div className="pill-row">
                {activeBadges.map((badge) => (
                  <BadgePill badge={badge} key={badge.label} />
                ))}
                {otherBadges.map((badge) => (
                  <BadgePill badge={badge} key={badge.label} />
                ))}
              </div>
            </div>
          ) : null}

          <div className="card stack">
            <div className="section-head compact">
              <h2 style={{ fontSize: 22 }}>What {buyer.name.split(".")[0]} is looking for</h2>
            </div>
            <div className="grid two">
              <div className="stack tight">
                <p className="eyebrow">Needs</p>
                <ul className="clean-list">
                  {buyer.needs.map((need) => <li key={need}>{need}</li>)}
                </ul>
              </div>
              <div className="stack tight">
                <p className="eyebrow">Wants</p>
                <ul className="clean-list">
                  {buyer.wants.map((want) => <li key={want}>{want}</li>)}
                </ul>
              </div>
            </div>
          </div>

          {!isOwner && inviteHref ? (
            <div className="card sage">
              <div className="card-row">
                <div className="stack tight">
                  <p className="eyebrow">Ready to reach out?</p>
                  <h3>Send a manual invite with your private property</h3>
                  <p className="muted small">
                    Your property profile is only shared with this buyer if they accept.
                  </p>
                </div>
                <Link className="button primary lg" href={inviteHref}>
                  <Icon name="mail" size={15} />
                  Send invite
                </Link>
              </div>
            </div>
          ) : null}
        </article>
      </section>
    </div>
  );
}
