import Link from "next/link";
import { BadgePill } from "../../../../components/badge-pill";
import { GeneratedAvatar } from "../../../../components/generated-avatar";
import { Icon } from "../../../../components/icon";
import { ModeChip } from "../../../../components/mode-chip";
import { PageTitle } from "../../../../components/page-title";
import { formatMoney } from "../../../../lib/format";
import { propertySubtypeLabel } from "../../../../lib/property-types";
import { canViewBuyerDirectory } from "../../../../server/access";
import { getBuyerProfileForSeller, listSellerProperties } from "../../../../server/contracts";
import { submitInvite } from "../../../../server/form-actions";
import { getSessionUser } from "../../../../server/session";

export default async function InviteBuyerPage({
  params,
}: {
  params: Promise<{ buyerProfileId: string }>;
}) {
  const { buyerProfileId } = await params;
  const user = await getSessionUser();
  const canInvite = user ? await canViewBuyerDirectory(user) : false;

  if (!canInvite) {
    return (
      <div className="page stack loose">
        <PageTitle
          eyebrow="Manual outreach"
          title="Seller access pending"
          tone="seller"
          badge={<ModeChip mode="seller" />}
        >
          A Liber admin must approve seller directory access before buyer profile viewing or invites are available.
        </PageTitle>
        <section className="card cream stack">
          <div className="section-head compact">
            <div className="stack tight">
              <p className="eyebrow amber">Access review</p>
              <h2 style={{ fontSize: 22 }}>Buyer invites are locked for now</h2>
            </div>
            <span className="status-dot warning">
              <Icon name="lock" size={12} />
              Awaiting approval
            </span>
          </div>
          <p>
            You can keep preparing private property records while seller-directory access is reviewed.
          </p>
          <div className="actions">
            <Link className="button primary" href="/seller/properties">
              <Icon name="home" size={14} />
              Manage properties
            </Link>
            <Link className="button secondary" href="/seller/search">
              <Icon name="arrow-right" size={14} />
              View access status
            </Link>
          </div>
        </section>
      </div>
    );
  }

  const { data: buyer } = await getBuyerProfileForSeller(buyerProfileId);

  if (!buyer.canInvite) {
    return (
      <div className="page stack loose">
        <PageTitle
          eyebrow="Manual outreach"
          title="This is your buyer profile"
          tone="seller"
          badge={<ModeChip mode="seller" />}
        >
          You can view your buyer demand in seller search, but invites are only for outreach to other buyers.
        </PageTitle>
        <section className="card cream stack">
          <p>
            Use the buyer profile preview to see what approved sellers can see, or return to buyer search.
          </p>
          <div className="actions">
            <Link className="button primary" href={`/buyers/${buyer.id}`}>
              <Icon name="user" size={14} />
              View profile
            </Link>
            <Link className="button secondary" href="/seller/search">
              <Icon name="arrow-right" size={14} style={{ transform: "rotate(180deg)" }} />
              Back to buyers
            </Link>
          </div>
        </section>
      </div>
    );
  }

  const { data: properties } = await listSellerProperties();
  const readyProperties = properties.filter((item) => item.lifecycleStatus === "READY_FOR_INVITES");
  const property = readyProperties[0];

  const activeBadges = buyer.badges.filter((badge) => badge.status === "active");
  const buyerSummary = [buyer.type, buyer.purpose, buyer.location].filter(Boolean).join(" - ") || "Buyer";

  if (!property) {
    return (
      <div className="page stack loose">
        <PageTitle
          eyebrow={`Invite ${buyer.name}`}
          title="Add a property first"
          tone="seller"
          badge={<ModeChip mode="seller" />}
        >
          Add and verify a private property record before sending an invite. Your property is only shown to buyers you choose.
        </PageTitle>
        <section className="card cream stack">
          <div className="section-head compact">
            <div className="stack tight">
              <p className="eyebrow amber">Private property required</p>
              <h2 style={{ fontSize: 22 }}>You haven't added a property yet</h2>
            </div>
            <span className="status-dot warning">
              <Icon name="info" size={12} />
              Required to invite
            </span>
          </div>
          <p>
            Liber needs a currently ownership-approved property so {buyer.name} knows what you're inviting them to review.
            Your property is not listed publicly.
          </p>
          <div className="actions">
            <Link
              className="button primary"
              href={`/seller/properties/new?next=${encodeURIComponent(`/seller/invite/${buyer.id}`)}`}
            >
              <Icon name="plus" size={14} />
              Add private property
            </Link>
            <Link className="button secondary" href="/seller/search">
              <Icon name="arrow-right" size={14} style={{ transform: "rotate(180deg)" }} />
              Back to buyers
            </Link>
          </div>
        </section>
      </div>
    );
  }

  const verified = property.status.toLowerCase().includes("verified");

  return (
    <div className="page wide stack loose invite-compose-page">
      <PageTitle
        eyebrow="Manual outreach"
        title={`Invite ${buyer.name}`}
        tone="seller"
        badge={<ModeChip mode="seller" />}
        actions={
          <Link className="button ghost" href={`/buyers/${buyer.id}`}>
            <Icon name="user" size={14} />
            Back to profile
          </Link>
        }
      >
        Manual invites only. Liber never sends offers, creates contracts, or moves money on your behalf.
      </PageTitle>

      <section className="invite-compose-grid">
        <form action={submitInvite} className="invite-compose-form">
          <input name="buyerProfileId" type="hidden" value={buyer.id} />

          <div className="invite-compose-heading">
            <p className="eyebrow seller">Manual invite</p>
            <h2>Send Message to {buyer.name}</h2>
          </div>
          <div className="field">
            <label htmlFor="property">Property</label>
            <select id="property" name="propertyId" defaultValue={property.id}>
              {readyProperties.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.title} — {item.status}
                </option>
              ))}
            </select>
          </div>
          <div className="reference-form-section">
            <h3>Personal Info</h3>
            <div className="field full">
              <label htmlFor="title">Message title</label>
              <input id="title" name="title" defaultValue="Invite to buy a house" />
            </div>
            <div className="field full">
              <label htmlFor="message">Message body</label>
              <textarea
                id="message"
                name="message"
                defaultValue={`Hi ${buyer.name}, I'm inviting you to review my property because it appears to fit your preferred location, budget, and home needs.`}
              />
              <span className="field-hint">Keep it short. {buyer.name} will see this in their invite inbox.</span>
            </div>
          </div>

          <div className="auth-alert info">
            Property identity and images are locked to the currently approved property version. Edit the property first if anything changed; identity changes require new ownership review.
          </div>

          <div className="divider" />

          <label className="checkbox-row">
            <input type="checkbox" name="termsAccepted" value="true" />
            <span>
              I confirm this is a manual invite and does not create an offer, escrow, or funds custody. I own this property
              or am authorized to invite buyers on the owner's behalf.
            </span>
          </label>

          <div className="actions between">
            <Link className="button ghost" href={`/buyers/${buyer.id}`}>
              Cancel
            </Link>
            <button className="button primary lg" type="submit">
              <Icon name="mail" size={15} />
              Send invite
            </button>
          </div>
        </form>

        <aside className="public-profile-aside invite-compose-aside">
          <article className="card stack invite-recipient-card">
            <p className="eyebrow">Recipient</p>
            <div style={{ alignItems: "center", display: "flex", gap: 12 }}>
              <GeneratedAvatar seed={buyer.avatarSeed} size="lg" variant={buyer.avatarVariant} />
              <div>
                <h3 style={{ margin: 0 }}>{buyer.name}</h3>
                <p className="muted small" style={{ margin: "4px 0 0" }}>{buyerSummary}</p>
              </div>
            </div>
            {activeBadges.length > 0 ? (
              <div className="pill-row">
                {activeBadges.slice(0, 3).map((badge) => (
                  <BadgePill badge={badge} key={badge.label} />
                ))}
              </div>
            ) : null}
          </article>

          <article className="property-card quick-overview-card">
            <p className="eyebrow seller">Quick overview</p>
            <div className="media-preview">
              <span className="media-hint">
                <Icon name="home" size={12} />
                {propertySubtypeLabel(property.propertyType)}
              </span>
            </div>
            <div className="property-card-body">
              <div className="section-head compact">
                <h3 style={{ margin: 0 }}>{property.title}</h3>
                <span className={`status-dot ${verified ? "active" : "warning"}`}>
                  <Icon name={verified ? "check-shield" : "info"} size={12} />
                  {verified ? "Verified" : "Pending"}
                </span>
              </div>
              <p className="muted small" style={{ margin: 0 }}>
                <Icon name="map-pin" size={12} /> {property.location}
              </p>
              <div className="property-card-stats">
                {property.beds ? <span className="pill active">{property.beds} beds</span> : null}
                {property.baths ? <span className="pill active">{property.baths} baths</span> : null}
                {property.area ? <span className="pill active">{property.area} sqft</span> : null}
              </div>
              <strong style={{ fontSize: 20 }}>{formatMoney(property.price)}</strong>
              {property.description ? <p className="muted small">{property.description}</p> : null}
            </div>
          </article>

          <article className="card flat stack tight" style={{ background: "var(--surface-cream)", borderColor: "var(--amber-line)" }}>
            <span className="status-dot amber">
              <Icon name="lock" size={12} />
              Private outreach
            </span>
            <p className="muted small" style={{ margin: 0 }}>
              {buyer.name} can accept or decline. No offer or escrow is created.
            </p>
          </article>
        </aside>
      </section>
    </div>
  );
}
