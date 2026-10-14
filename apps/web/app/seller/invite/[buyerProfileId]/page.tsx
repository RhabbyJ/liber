import Link from "next/link";
import { BadgePill } from "../../../../components/badge-pill";
import { EmptyState } from "../../../../components/empty-state";
import { GeneratedAvatar } from "../../../../components/generated-avatar";
import { Icon } from "../../../../components/icon";
import { PropertyCoverPhoto } from "../../../../components/property-cover-photo";
import { PropertyFeatureSummary } from "../../../../components/property-details-fields";
import { PageTitle } from "../../../../components/page-title";
import { SellerInviteForm } from "../../../../components/seller-invite-form";
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
              <Link className="button secondary" href="/">
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
              <Link className="button secondary" href="/">
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
              <Link className="button secondary" href="/">
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
              <Link className="button ghost" href="/">
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
  const verified = property.status === "Ownership verified";

  return (
    <div className="page wide stack loose invite-compose-page">
      <Link className="page-back" href={`/buyers/${buyer.id}`}>
        <Icon name="chevron-left" size={18} />
        {buyer.name}
      </Link>
      <PageTitle title={`Invite ${buyer.name}`}>Choose a property, send the invite, and continue in chat.</PageTitle>

      <section className="invite-compose-grid">
        <SellerInviteForm
          action={submitInvite}
          buyer={{ id: buyer.id, name: buyer.name }}
          properties={readyProperties.map(({ coverImageId, id, propertyType, status, title }) => ({ coverImageId, id, propertyType, status, title }))}
          propertyId={property.id}
          templateVersion={sellerOpeningTemplateVersion}
        />

        <aside className="public-profile-aside invite-compose-aside">
          <article className="invite-recipient-card">
            <div className="invite-recipient">
              <GeneratedAvatar decorative name={buyer.name} seed={buyer.avatarSeed} size="lg" variant={buyer.avatarVariant} />
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
                <PropertyCoverPhoto
                  className="listing-card-art"
                  imageId={property.coverImageId}
                  propertyType={property.propertyType}
                  seed={property.id}
                  sizes="340px"
                />
                <div className="listing-card-flags">
                  <span className="listing-flag">
                    <Icon name="lock" size={13} />
                    Invite only
                  </span>
                  <span className={`listing-flag${verified ? "" : " pending"}`}>
                    <Icon name={verified ? "check-shield" : "info"} size={13} />
                    {property.status}
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
                <PropertyFeatureSummary condition={property.condition} features={property.features} />
                {property.description ? <p className="listing-card-note">{property.description}</p> : null}
              </div>
            </article>
          </section>
        </aside>
      </section>
    </div>
  );
}
