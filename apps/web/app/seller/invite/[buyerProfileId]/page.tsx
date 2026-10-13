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
        <PageTitle title="Seller access pending">Directory access is still under review.</PageTitle>
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
        <PageTitle title="This is your buyer profile">Invites are only for outreach to other buyers.</PageTitle>
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
                <Icon name="arrow-left" size={14} />
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
  const buyerSummary = [buyer.type, buyer.purpose, buyer.location].filter(Boolean).join(" · ") || "Buyer";

  if (propertyState.kind === "missing") {
    return (
      <div className="page stack loose">
        <PageTitle title="Add a property first">
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
                <Icon name="arrow-left" size={14} />
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
        <PageTitle title={copy.title}>
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
                <Icon name="arrow-left" size={14} />
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
      <Link className="page-back" href={`/buyers/${buyer.id}`}>
        <Icon name="chevron-left" size={18} />
        {buyer.name}
      </Link>
      <PageTitle title={`Invite ${buyer.name}`} />

      <section className="invite-compose-grid">
        <form action={submitInvite} className="invite-compose-form">
          <input name="buyerProfileId" type="hidden" value={buyer.id} />
          <input name="templateVersion" type="hidden" value={sellerOpeningTemplateVersion} />

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

          <div className="form-actions">
            <button className="button primary lg" type="submit">
              Send invite
            </button>
            <Link className="text-link" href={`/buyers/${buyer.id}`}>
              Cancel
            </Link>
          </div>
        </form>

        <aside className="public-profile-aside invite-compose-aside">
          <article className="invite-recipient-card">
            <div className="invite-recipient">
              <GeneratedAvatar name={buyer.name} seed={buyer.avatarSeed} size="lg" variant={buyer.avatarVariant} />
              <div>
                <h2>{buyer.name}</h2>
                {buyer.isDemo ? <span className="status-dot warning">Demo buyer</span> : null}
                <p>{buyerSummary}</p>
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

          <section className="quick-overview" aria-labelledby="quick-overview-title">
            <h2 className="quick-overview-title" id="quick-overview-title">Property</h2>
            <article className="listing-card static">
              <div className="listing-card-media">
                <PropertyTypeArtwork
                  className="listing-card-art"
                  motion="none"
                  sizes="340px"
                  value={property.propertyType}
                />
                <div className="listing-card-flags">
                  <span className="listing-flag">
                    <Icon name="lock" size={13} />
                    Invite only
                  </span>
                  <span className={`listing-flag${verified ? "" : " pending"}`}>
                    <Icon name={verified ? "check-shield" : "info"} size={13} />
                    {verified ? "Verified" : "Pending"}
                  </span>
                </div>
              </div>
              <div className="listing-card-body">
                <p className="listing-card-price">{property.price > 0 ? formatMoney(property.price) : "Price not set"}</p>
                <ul className="listing-card-facts" aria-label="Home facts">
                  {property.beds ? <li><b>{property.beds}</b> bds</li> : null}
                  {property.baths ? <li><b>{property.baths}</b> ba</li> : null}
                  {property.area ? <li><b>{property.area.toLocaleString("en-US")}</b> sqft</li> : null}
                  <li className="listing-card-kind">{propertySubtypeLabel(property.propertyType)}</li>
                </ul>
                <h3 className="listing-card-address">{property.title}, {property.location}</h3>
                {property.description ? <p className="listing-card-note">{property.description}</p> : null}
              </div>
            </article>
          </section>
        </aside>
      </section>
    </div>
  );
}
