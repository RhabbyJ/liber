import Link from "next/link";
import { Avatar } from "../../../../components/avatar";
import { BadgePill } from "../../../../components/badge-pill";
import { Icon } from "../../../../components/icon";
import { ModeChip } from "../../../../components/mode-chip";
import { PageTitle } from "../../../../components/page-title";
import { formatMoney } from "../../../../lib/format";
import { getBuyerProfileForSeller, listSellerProperties } from "../../../../server/contracts";
import { submitInvite } from "../../../../server/form-actions";

export default async function InviteBuyerPage({
  params,
}: {
  params: Promise<{ buyerProfileId: string }>;
}) {
  const { buyerProfileId } = await params;
  const { data: buyer } = await getBuyerProfileForSeller(buyerProfileId);
  const { data: properties } = await listSellerProperties();
  const property = properties[0];

  const activeBadges = buyer.badges.filter((badge) => badge.status === "active");

  if (!property) {
    return (
      <div className="page stack loose">
        <PageTitle
          eyebrow={`Invite ${buyer.name}`}
          title="Add a property first"
          tone="seller"
          badge={<ModeChip mode="seller" />}
        >
          Add a private property record before sending an invite. Your property is only shown to buyers you choose.
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
            Liber needs a private property record so {buyer.name.split(".")[0]} knows what you're inviting them to review.
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
    <div className="page wide stack loose">
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

      <section className="grid sidebar">
        <form action={submitInvite} className="card stack loose" encType="multipart/form-data">
          <input name="buyerProfileId" type="hidden" value={buyer.id} />

          <div className="section-stack">
            <p className="eyebrow">Step 1</p>
            <h2>Choose property &amp; write your message</h2>
          </div>
          <div className="field">
            <label htmlFor="property">Property</label>
            <select id="property" name="propertyId" defaultValue={property.id}>
              {properties.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.title} — {item.status}
                </option>
              ))}
            </select>
          </div>
          <div className="form-grid">
            <div className="field full">
              <label htmlFor="title">Message title</label>
              <input id="title" name="title" defaultValue="Your Northridge criteria match this home" />
            </div>
            <div className="field full">
              <label htmlFor="message">Message body</label>
              <textarea
                id="message"
                name="message"
                defaultValue="This property appears to fit your preferred location, budget, and low-maintenance needs."
              />
              <span className="field-hint">Keep it short. {buyer.name.split(".")[0]} will see this in their invite inbox.</span>
            </div>
          </div>

          <div className="divider" />

          <div className="section-stack">
            <p className="eyebrow">Step 2</p>
            <h2>Confirm property details</h2>
            <p className="muted small">These are shown to {buyer.name.split(".")[0]} inside the invite. Update them if anything changed.</p>
          </div>
          <div className="form-grid">
            <div className="field">
              <label htmlFor="address">Address</label>
              <input id="address" name="addressLine1" defaultValue={property.title} />
            </div>
            <div className="field">
              <label htmlFor="city">City</label>
              <input id="city" name="city" defaultValue={property.location.split(",")[0]?.trim()} />
            </div>
            <div className="field">
              <label htmlFor="state">State</label>
              <input id="state" name="state" defaultValue={property.location.split(",")[1]?.trim().slice(0, 2)} />
            </div>
            <div className="field">
              <label htmlFor="zip">Zip</label>
              <input id="zip" name="zip" inputMode="numeric" />
            </div>
            <div className="field">
              <label htmlFor="price">Asking price</label>
              <input id="price" name="price" defaultValue={property.price} inputMode="numeric" />
            </div>
            <div className="field">
              <label htmlFor="beds">Bedrooms</label>
              <input id="beds" name="bedrooms" defaultValue={property.beds} inputMode="numeric" />
            </div>
            <div className="field">
              <label htmlFor="baths">Bathrooms</label>
              <input id="baths" name="bathrooms" defaultValue={property.baths} inputMode="numeric" />
            </div>
            <div className="field">
              <label htmlFor="area">Area (sqft)</label>
              <input id="area" name="squareFeet" defaultValue={property.area} inputMode="numeric" />
            </div>
            <div className="field">
              <label htmlFor="garage">Garage area</label>
              <input id="garage" name="garageArea" defaultValue={property.garageArea} inputMode="numeric" />
            </div>
            <div className="field full">
              <label htmlFor="description">Property description</label>
              <textarea id="description" name="description" defaultValue={property.description} />
            </div>
            <div className="field full">
              <label htmlFor="images">Add property images</label>
              <input id="images" name="images" type="file" accept="image/png,image/jpeg,image/webp" multiple />
              <span className="field-hint">Images appear inside the invite only.</span>
            </div>
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

        <aside className="public-profile-aside">
          <article className="card stack">
            <p className="eyebrow">Recipient</p>
            <div style={{ alignItems: "center", display: "flex", gap: 12 }}>
              <Avatar name={buyer.name} size="lg" src={buyer.avatarUrl} />
              <div>
                <h3 style={{ margin: 0 }}>{buyer.name}</h3>
                <p className="muted small" style={{ margin: "4px 0 0" }}>{buyer.type} · {buyer.location}</p>
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

          <article className="property-card">
            <div className="media-preview">
              <span className="media-hint">
                <Icon name="home" size={12} />
                {property.propertyType}
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
              {buyer.name.split(".")[0]} can accept or decline. No offer or escrow is created.
            </p>
          </article>
        </aside>
      </section>
    </div>
  );
}
