import Link from "next/link";
import { notFound } from "next/navigation";
import { BadgePill } from "../../../components/badge-pill";
import { GeneratedAvatar } from "../../../components/generated-avatar";
import { Icon } from "../../../components/icon";
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
  const primaryBadge = activeBadges[0];

  return (
    <div className="page wide buyer-reference-page">
      {isOwner ? (
        <section className="buyer-reference-owner-note">
          <div>
            <p className="eyebrow">Preview only</p>
            <h2>This is how sellers see your profile.</h2>
          </div>
          <Link className="button secondary" href="/buyer/profile">
            <Icon name="pencil" size={14} />
            Edit profile
          </Link>
        </section>
      ) : null}

      <section className="public-profile buyer-reference-profile">
        <aside className="public-profile-aside buyer-reference-aside">
          <div className="buyer-reference-photo">
            <div className="profile-avatar-mark">
              <GeneratedAvatar seed={buyer.userId || buyer.id} size="xl" variant={buyer.avatarVariant} />
            </div>
          </div>

          <section className="buyer-reference-bio">
            <h3>Bio:</h3>
            <p>{buyer.bio || "No bio added yet."}</p>
          </section>
        </aside>

        <article className="public-profile-main buyer-reference-main">
          <section className="buyer-reference-hero">
            <div className="buyer-reference-head">
              <div className="buyer-reference-name-line">
                <h1>{buyer.name}</h1>
                <span className="buyer-reference-location">
                  <Icon name="map-pin" size={16} />
                  {buyer.location}
                </span>
              </div>
              <p className="buyer-reference-type">{buyer.type}</p>
            </div>

            {primaryBadge ? (
              <div className="buyer-reference-verified">
                <span className="buyer-reference-verified-icon">
                  <Icon name="check-shield" size={16} />
                </span>
                <div>
                  <strong>{badgeDisplayLabel(primaryBadge)}</strong>
                  <span>{badgeHelperText(primaryBadge)}</span>
                </div>
              </div>
            ) : null}

            <div className="buyer-reference-facts">
              <ProfileFact label="Buying for" value={buyer.purpose} />
              <ProfileFact label="Down payment" value={formatRange(buyer.downPaymentMin, buyer.downPaymentMax)} />
              <ProfileFact label="Budget" value={formatRange(buyer.budgetMin, buyer.budgetMax)} />
            </div>

            {activeBadges.length > 1 || otherBadges.length > 0 ? (
              <div className="buyer-reference-badge-row">
                {activeBadges.slice(primaryBadge ? 1 : 0).map((badge) => (
                  <BadgePill badge={badge} key={badge.label} />
                ))}
                {otherBadges.map((badge) => (
                  <BadgePill badge={badge} key={badge.label} />
                ))}
              </div>
            ) : null}

            {!isOwner && inviteHref ? (
              <Link className="button primary buyer-reference-invite" href={inviteHref}>
                Send Invite
              </Link>
            ) : isOwner ? (
              <Link className="button secondary buyer-reference-invite" href="/buyer/profile">
                Back to your profile
              </Link>
            ) : (
              <span className="status-dot warning">
                <Icon name="lock" size={12} />
                Approved seller access required
              </span>
            )}
          </section>

          <section className="buyer-reference-detail">
            <h2>Needs and wants</h2>
            <div className="buyer-reference-needs-grid">
              <div>
                <h3>Need:</h3>
                <ul className="clean-list">
                  {buyer.needs.map((need) => <li key={need}>{need}</li>)}
                </ul>
              </div>
              <div>
                <h3>Want:</h3>
                <ul className="clean-list">
                  {buyer.wants.map((want) => <li key={want}>{want}</li>)}
                </ul>
              </div>
            </div>
          </section>
        </article>
      </section>
    </div>
  );
}

function ProfileFact({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <span>{label}:</span>
      <strong>{value || "Not set"}</strong>
    </div>
  );
}

function badgeDisplayLabel(badge: { label: string; type?: string }) {
  if (badge.type === "PRE_APPROVED") return "Pre-approved";
  return badge.label;
}

function badgeHelperText(badge: { expiresInDays?: number }) {
  if (typeof badge.expiresInDays === "number") {
    return `Expires in ${badge.expiresInDays} day${badge.expiresInDays === 1 ? "" : "s"}`;
  }

  return "Documents stay private";
}
