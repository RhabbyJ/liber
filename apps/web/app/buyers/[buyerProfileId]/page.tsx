import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { BuyerProfileHeader } from "../../../components/buyer-profile-header";
import { GeneratedAvatar } from "../../../components/generated-avatar";
import { Icon, type IconName } from "../../../components/icon";
import { approximateBuyerPoint } from "../../../lib/buyer-map-point";
import { compactBudgetRange } from "../../../lib/listing-format";
import { mapboxAreaImageUrl } from "../../../lib/mapbox-static-image";
import { getAuthorizedBuyerProfile } from "../../../server/contracts";
import { getSessionUser } from "../../../server/session";
import { blockBuyerProfile } from "../../../server/form-actions";

export const metadata: Metadata = {
  robots: "noindex, noarchive",
  title: "Buyer profile",
};

const inviteDisclaimer = "This is a manual invite only. It is not an offer, escrow instruction, funds custody, or automated transaction.";

export default async function PublicBuyerProfilePage({
  params,
}: {
  params: Promise<{ buyerProfileId: string }>;
}) {
  const { buyerProfileId } = await params;
  const result = await getAuthorizedBuyerProfile(buyerProfileId);
  const user = await getSessionUser();

  if (!result.ok) {
    if (result.error === "NOT_FOUND") notFound();
    return (
      <div className="page narrow">
        <section className="access-panel">
          <span className="access-panel-icon" aria-hidden="true"><Icon name="lock" size={24} /></span>
          <h1>Buyer profile unavailable</h1>
          <p>Buyer profiles are only available to approved sellers, admins, or the buyer who owns the profile.</p>
          <Link className="button primary" href="/">
            View seller access status
          </Link>
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
  const isOwner = buyer.viewerIsOwner;
  const backHref = isOwner ? "/buyer/profile" : "/";
  const areaMapUrl = mapboxAreaImageUrl({
    point: approximateBuyerPoint(buyer),
    token: process.env.NEXT_PUBLIC_MAPBOX_TOKEN,
  });

  return (
    <div className={`hdp${inviteHref && !isOwner ? " has-mobile-cta" : ""}`}>
      <div className="hdp-actionbar">
        <Link className="hdp-back" href={backHref}>
          <Icon name="chevron-left" size={20} />
          {isOwner ? "Back to your profile" : "Back to search"}
        </Link>
        <div className="hdp-actionbar-meta">
          {buyer.isDemo ? <span className="status-dot warning">Demo buyer</span> : null}
          <span className="hdp-private-note">
            <Icon name="lock" size={14} />
            Private profile<span className="hdp-private-extra"> · not publicly listed</span>
          </span>
        </div>
      </div>

      {isOwner ? (
        <div className="inline-alert info hdp-owner-note" role="note">
          <Icon name="eye" size={20} />
          <p><strong>Preview.</strong> This is how approved sellers see your profile. Your name, email, and documents are never shown.</p>
          <Link className="text-link" href="/buyer/profile">Edit profile</Link>
        </div>
      ) : null}

      <BuyerProfileHeader areaMapUrl={areaMapUrl} buyer={buyer} />

      <div className="hdp-layout">
        <article className="hdp-main">
          <section className="hdp-section" aria-labelledby="hdp-overview">
            <h2 id="hdp-overview">Overview</h2>
            <p className="hdp-bio">{buyer.bio || "This buyer has not added a bio yet."}</p>
          </section>

          <section className="hdp-section" aria-labelledby="hdp-needs">
            <h2 id="hdp-needs">Needs and wants</h2>
            <div className="hdp-facts">
              <div>
                <h3>Needs</h3>
                {buyer.needs.length > 0 ? (
                  <ul>
                    {buyer.needs.map((need) => <li key={need}><Icon name="check" size={16} />{need}</li>)}
                  </ul>
                ) : <p className="muted">No required features listed.</p>}
              </div>
              <div>
                <h3>Wants</h3>
                {buyer.wants.length > 0 ? (
                  <ul>
                    {buyer.wants.map((want) => <li key={want}><Icon name="plus" size={16} />{want}</li>)}
                  </ul>
                ) : <p className="muted">No extra wants listed.</p>}
              </div>
            </div>
          </section>

          <section className="hdp-section" aria-labelledby="hdp-trust">
            <h2 id="hdp-trust">Trust and verification</h2>
            {activeBadges.length > 0 ? (
              <ul className="hdp-trust-list">
                {activeBadges.map((badge) => (
                  <li key={badge.type}>
                    <span className={`hdp-trust-icon${badge.type === "TEST_PRE_APPROVED" ? " unverified" : ""}`} aria-hidden="true"><Icon name={badgeIcon(badge.type)} size={18} /></span>
                    <span>
                      <strong>{badgeDisplayLabel(badge)}</strong>
                      <small>{badgeHelperText(badge)}</small>
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="muted">No verification badges yet.</p>
            )}
            <p className="hdp-fineprint">Badges reflect Liber’s review of private evidence. Documents are never shared with sellers.</p>
          </section>
        </article>

        <aside className="hdp-rail" aria-label="Contact this buyer">
          <div className="hdp-cta-card">
            <div className="hdp-cta-identity">
              <GeneratedAvatar decorative name={buyer.name} seed={buyer.avatarSeed} variant={buyer.avatarVariant} />
              <span>
                <strong>{buyer.name}</strong>
                <small>{compactBudgetRange(buyer.budgetMin, buyer.budgetMax)} · {buyer.location || "Liber service area"}</small>
              </span>
            </div>
            {!isOwner && inviteHref ? (
              <>
                <Link className="button primary block lg" href={inviteHref}>
                  Send invite
                </Link>
                <p className="hdp-cta-note">{inviteDisclaimer}</p>
                <form action={blockBuyerProfile}>
                  <input name="buyerProfileId" type="hidden" value={buyer.id} />
                  <button className="link-button hdp-block" type="submit">Block this buyer</button>
                </form>
              </>
            ) : isOwner ? (
              <Link className="button secondary block" href="/buyer/profile">
                Back to your profile
              </Link>
            ) : (
              <p className="hdp-locked">
                <Icon name="lock" size={16} />
                Approved seller access required to send invites.
              </p>
            )}
          </div>
        </aside>
      </div>

      {!isOwner && inviteHref ? (
        <div className="hdp-mobile-cta">
          <div>
            <strong>{compactBudgetRange(buyer.budgetMin, buyer.budgetMax)}</strong>
            <small>{buyer.name}</small>
          </div>
          <Link className="button primary" href={inviteHref}>Send invite</Link>
        </div>
      ) : null}
    </div>
  );
}

function badgeIcon(type: string): IconName {
  if (type === "TEST_PRE_APPROVED") return "info";
  if (type === "PRE_APPROVED") return "check-shield";
  if (type === "VERIFIED_FUNDS" || type === "CASH_BUYER") return "money";
  return "shield";
}

// Test pre-approvals are admin QA aids and must never read as verified financing.
function badgeDisplayLabel(badge: { label: string; type?: string }) {
  if (badge.type === "TEST_PRE_APPROVED") return "Test pre-approval — not verified";
  if (badge.type === "PRE_APPROVED") return "Pre-approved";
  return badge.label;
}

function badgeHelperText(badge: { type?: string; expiresInDays?: number }) {
  if (badge.type === "TEST_PRE_APPROVED") return "Testing only. Financing has not been verified.";
  if (typeof badge.expiresInDays === "number") {
    return `Reviewed by Liber · expires in ${badge.expiresInDays} day${badge.expiresInDays === 1 ? "" : "s"}`;
  }
  return "Reviewed by Liber";
}
