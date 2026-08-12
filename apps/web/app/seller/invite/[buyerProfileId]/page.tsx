import Link from "next/link";
import { BadgePill } from "../../../../components/badge-pill";
import { EmptyState } from "../../../../components/empty-state";
import { GeneratedAvatar } from "../../../../components/generated-avatar";
import { Icon } from "../../../../components/icon";
import { PropertyTypeArtwork } from "../../../../components/property-type-artwork";
import { PageTitle } from "../../../../components/page-title";
import { messagingTemplateLabel } from "../../../../components/messaging/types";
import { formatMoney } from "../../../../lib/format";
import {
  sellerInvitePropertyState,
  type SellerInvitePropertyBlockReason,
} from "../../../../lib/invite-property-state";
import { propertySubtypeLabel } from "../../../../lib/property-types";
import { canViewBuyerDirectory } from "../../../../server/access";
import { getBuyerProfileForSeller, listSellerProperties } from "../../../../server/contracts";
import { submitInvite } from "../../../../server/form-actions";
import { sellerOpeningTemplates } from "../../../../server/messaging/templates";
import { getSessionUser } from "../../../../server/session";

const sellerOpeningTemplateVersion = sellerOpeningTemplates[0]?.version;
if (
  !sellerOpeningTemplateVersion
  || sellerOpeningTemplates.some((template) => template.version !== sellerOpeningTemplateVersion)
) {
  throw new Error("Seller opening templates must share one form version.");
}

const blockedPropertyCopy: Record<SellerInvitePropertyBlockReason, {
  actionLabel: string;
  guidance: string;
  title: string;
}> = {
  archived: {
    actionLabel: "Review property",
    guidance: "This property is archived. Use an active ownership-approved property to invite.",
    title: "Choose an active property",
  },
  "needs-evidence": {
    actionLabel: "Finish property verification",
    guidance: "Upload ID and a matching property bill, then wait for admin approval.",
    title: "Finish verifying your property",
  },
  rejected: {
    actionLabel: "Update verification",
    guidance: "Update the ownership documents for this property, then resubmit for review.",
    title: "Finish verifying your property",
  },
  "review-pending": {
    actionLabel: "View review status",
    guidance: "Ownership evidence is in review. Invites unlock after approval.",
    title: "Ownership review in progress",
  },
};

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
        <PageTitle eyebrow="Manual outreach" title="Seller access pending" tone="seller">
          Directory access is still under review.
        </PageTitle>
        <EmptyState
          icon="shield"
          title="Invites are locked for now"
          description="You can keep preparing properties while access is reviewed."
          actions={
            <>
              <Link className="button primary" href="/seller/properties">
                <Icon name="home" size={14} />
                Manage properties
              </Link>
              <Link className="button secondary" href="/seller/search">
                <Icon name="arrow-right" size={14} />
                View access status
              </Link>
            </>
          }
        />
      </div>
    );
  }

  const { data: buyer } = await getBuyerProfileForSeller(buyerProfileId);

  if (!buyer.canInvite) {
    return (
      <div className="page stack loose">
        <PageTitle eyebrow="Manual outreach" title="This is your buyer profile" tone="seller">
          Invites are only for outreach to other buyers.
        </PageTitle>
        <EmptyState
          icon="people"
          title="Choose a different buyer"
          description="Preview your own profile, or return to buyer search."
          actions={
            <>
              <Link className="button primary" href={`/buyers/${buyer.id}`}>
                <Icon name="user" size={14} />
                View profile
              </Link>
              <Link className="button secondary" href="/seller/search">
                <Icon name="arrow-right" size={14} style={{ transform: "rotate(180deg)" }} />
                Back to buyers
              </Link>
            </>
          }
        />
      </div>
    );
  }

  const { data: properties } = await listSellerProperties();
  const propertyState = sellerInvitePropertyState(properties);

  const activeBadges = buyer.badges.filter((badge) => badge.status === "active");
  const buyerSummary = [buyer.type, buyer.purpose, buyer.location].filter(Boolean).join(" - ") || "Buyer";

  if (propertyState.kind === "missing") {
    return (
      <div className="page stack loose">
        <PageTitle eyebrow={`Invite ${buyer.name}`} title="Add a property first" tone="seller">
          You need an ownership-approved property before inviting {buyer.name}.
        </PageTitle>
        <EmptyState
          icon="home"
          title="No property ready yet"
          description="Add and verify a property, then return to send the invite."
          actions={
            <>
              <Link
                className="button primary"
                href={`/seller/properties/new?next=${encodeURIComponent(`/seller/invite/${buyer.id}`)}`}
              >
                <Icon name="plus" size={14} />
                Add property
              </Link>
              <Link className="button secondary" href="/seller/search">
                <Icon name="arrow-right" size={14} style={{ transform: "rotate(180deg)" }} />
                Back to buyers
              </Link>
            </>
          }
        />
      </div>
    );
  }

  if (propertyState.kind === "blocked") {
    const { property, reason } = propertyState;
    const copy = blockedPropertyCopy[reason];

    return (
      <div className="page stack loose">
        <PageTitle eyebrow={`Invite ${buyer.name}`} title={copy.title} tone="seller">
          {property.title} · {property.location}
        </PageTitle>
        <EmptyState
          icon="doc"
          title={copy.title}
          description={copy.guidance}
          actions={
            <>
              <Link className="button primary" href={`/seller/properties/${property.id}/edit`}>
                <Icon name="pencil" size={14} />
                {copy.actionLabel}
              </Link>
              <Link className="button secondary" href="/seller/properties">
                <Icon name="home" size={14} />
                Manage properties
              </Link>
              <Link className="button ghost" href="/seller/search">
                <Icon name="arrow-right" size={14} style={{ transform: "rotate(180deg)" }} />
                Back to buyers
              </Link>
            </>
          }
        />
      </div>
    );
  }

  const { property, readyProperties } = propertyState;
  const verified = property.status.toLowerCase().includes("verified");

  return (
    <div className="page wide stack loose invite-compose-page">
      <PageTitle
        eyebrow="Manual outreach"
        title={`Invite ${buyer.name}`}
        tone="seller"
        actions={
          <Link className="button ghost" href={`/buyers/${buyer.id}`}>
            <Icon name="user" size={14} />
            Back to profile
          </Link>
        }
      >
        Choose a property and opening, then send.
      </PageTitle>

      <section className="invite-compose-grid">
        <form action={submitInvite} className="invite-compose-form">
          <input name="buyerProfileId" type="hidden" value={buyer.id} />
          <input name="templateVersion" type="hidden" value={sellerOpeningTemplateVersion} />

          <div className="invite-compose-heading">
            <p className="eyebrow seller">Manual invite</p>
            <h2>Choose an opening for {buyer.name}</h2>
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
            <span className="field-hint">Uses the approved property version. Edit the property first if details changed.</span>
          </div>
          <fieldset className="invite-template-fieldset">
            <legend>Guided opening</legend>
            <p className="field-hint">Choose one reviewed property-focused question.</p>
            <div className="invite-template-options">
              {sellerOpeningTemplates.map((template, index) => (
                <label className="invite-template-option" key={template.key}>
                  <input defaultChecked={index === 0} name="templateKey" required type="radio" value={template.key} />
                  <span>
                    <strong>{messagingTemplateLabel(template.key)}</strong>
                    <small>{template.text}</small>
                  </span>
                </label>
              ))}
            </div>
          </fieldset>
          <div className="field full">
            <label htmlFor="note">Short note (optional)</label>
            <textarea
              id="note"
              maxLength={500}
              name="note"
              placeholder={`Add brief property context for ${buyer.name}`}
            />
            <span className="field-hint">Plain text only, up to 500 characters.</span>
          </div>

          <div className="divider" />

          <label className="checkbox-row">
            <input name="termsAccepted" required type="checkbox" value="true" />
            <span>
              I confirm this is a manual invite only — not an offer, escrow, or funds transfer — and I am authorized
              to invite buyers for this property.
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
                {buyer.isDemo ? <span className="status-dot warning">Demo buyer</span> : null}
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
              <PropertyTypeArtwork
                className="property-card-artwork"
                sizes="340px"
                value={property.propertyType}
              />
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
        </aside>
      </section>
    </div>
  );
}
