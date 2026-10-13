import Link from "next/link";
import { notFound } from "next/navigation";
import { GeneratedAvatar } from "../../../components/generated-avatar";
import { Icon, type IconName } from "../../../components/icon";
import { PropertyTypeArtwork } from "../../../components/property-type-artwork";
import { formatRange } from "../../../lib/format";
import { compactBudgetRange, seekingLabel } from "../../../lib/listing-format";
import { getAuthorizedBuyerProfile } from "../../../server/contracts";
import { getSessionUser } from "../../../server/session";
import { blockBuyerProfile } from "../../../server/form-actions";

export const metadata = {
  robots: "noindex, noarchive",
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
          <p className="page-kicker">Buyer profile</p>
          <h1>Access unavailable</h1>
          <p>Buyer profiles are only available to approved sellers, admins, or the buyer who owns the profile.</p>
          <Link className="button primary" href="/seller/search">
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
  const criteria = buyer.criteriaDetails[0];
  const preApproval = activeBadges.find((badge) => badge.type === "PRE_APPROVED");
  const stats = [
    criteria?.bedroomsMin ? { label: "beds", value: `${criteria.bedroomsMin}+` } : null,
    criteria?.bathroomsMin ? { label: "baths", value: `${criteria.bathroomsMin}+` } : null,
    criteria?.squareFeetMin
      ? { label: "sqft", value: `${criteria.squareFeetMin.toLocaleString("en-US")}+` }
      : criteria?.lotSizeMin
        ? { label: "sqft lot", value: `${criteria.lotSizeMin.toLocaleString("en-US")}+` }
        : null,
  ].filter((stat): stat is { label: string; value: string } => stat !== null);
  const glance: Array<{ icon: IconName; label: string; value: string }> = [
    { icon: "home", label: "Seeking", value: buyer.purpose || "Not set" },
    { icon: "money", label: "Purchase type", value: buyer.type || "Not set" },
    { icon: "key", label: "Down payment", value: formatRange(buyer.downPaymentMin, buyer.downPaymentMax) },
    { icon: "sparkle", label: "Condition", value: criteria?.condition || "Any condition" },
    {
      icon: "check-shield",
      label: "Pre-approval",
      value: preApproval
        ? typeof preApproval.expiresInDays === "number" ? `Active · ${preApproval.expiresInDays}d left` : "Active"
        : "Not verified",
    },
    { icon: "calendar", label: "Profile updated", value: formatUpdated(buyer.refreshedAt) },
  ];
  const backHref = isOwner ? "/buyer/profile" : "/seller/search";

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
        <section className="hdp-owner-note" aria-label="Owner preview">
          <div>
            <strong>This is how approved sellers see your profile.</strong>
            <span>Your account name, email, and documents are never shown.</span>
          </div>
          <Link className="button secondary sm" href="/buyer/profile">
            <Icon name="pencil" size={14} />
            Edit profile
          </Link>
        </section>
      ) : null}

      <div className="hdp-media" aria-hidden="true">
        <div className="hdp-media-main">
          <PropertyTypeArtwork className="hdp-media-art" motion="none" priority sizes="(max-width: 899px) 100vw, 66vw" value={buyer.purpose} />
          <span className="hdp-media-tag">{seekingLabel(buyer.purpose)}</span>
        </div>
        <div className="hdp-media-side">
          <div className="hdp-media-avatar">
            <GeneratedAvatar seed={buyer.avatarSeed} size="xl" variant={buyer.avatarVariant} />
          </div>
          <div className="hdp-media-area">
            <Icon name="map-pin" size={28} />
            <span>{buyer.location || "Liber service area"}</span>
          </div>
        </div>
      </div>

      <div className="hdp-layout">
        <article className="hdp-main">
          <p className="hdp-status">
            <span className="hdp-status-dot" aria-hidden="true" />
            Active buyer · {seekingLabel(buyer.purpose)}
          </p>
          <div className="hdp-headline">
            <p className="hdp-price">
              <span className="visually-hidden">Budget </span>
              {compactBudgetRange(buyer.budgetMin, buyer.budgetMax)}
            </p>
            {stats.length > 0 ? (
              <dl className="hdp-stats">
                {stats.map((stat) => (
                  <div key={stat.label}>
                    <dt className="visually-hidden">{stat.label}</dt>
                    <dd><b>{stat.value}</b> {stat.label}</dd>
                  </div>
                ))}
              </dl>
            ) : null}
          </div>
          <h1 className="hdp-title">
            {buyer.name}
            <span>{buyer.location || "Liber service area"}</span>
          </h1>
          <p className="hdp-budget-chip">
            <Icon name="money" size={20} />
            Budget {formatRange(buyer.budgetMin, buyer.budgetMax)}
          </p>

          <ul className="hdp-glance" aria-label="At a glance">
            {glance.map((item) => (
              <li key={item.label}>
                <Icon name={item.icon} size={22} />
                <span>
                  <small>{item.label}</small>
                  <strong>{item.value}</strong>
                </span>
              </li>
            ))}
          </ul>

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
                    <span className="hdp-trust-icon" aria-hidden="true"><Icon name={badgeIcon(badge.type)} size={18} /></span>
                    <span>
                      <strong>{badge.type === "PRE_APPROVED" ? "Pre-approved" : badge.label}</strong>
                      <small>
                        {typeof badge.expiresInDays === "number"
                          ? `Reviewed by Liber · expires in ${badge.expiresInDays} day${badge.expiresInDays === 1 ? "" : "s"}`
                          : "Reviewed by Liber"}
                      </small>
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
              <GeneratedAvatar seed={buyer.avatarSeed} size="md" variant={buyer.avatarVariant} />
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
  if (type === "PRE_APPROVED") return "check-shield";
  if (type === "VERIFIED_FUNDS" || type === "CASH_BUYER") return "money";
  return "shield";
}

function formatUpdated(value?: string) {
  if (!value) return "Recently";
  const date = new Date(`${value}T12:00:00Z`);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("en-US", { day: "numeric", month: "short", timeZone: "UTC", year: "numeric" }).format(date);
}
