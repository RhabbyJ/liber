import Link from "next/link";
import { BadgePill } from "../../../../components/badge-pill";
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
      <div className="page stack">
        <PageTitle eyebrow="Seller" title={`Invite ${buyer.name}`}>
          Add a private property record before sending an invite. Your property is only shown to buyers you choose.
        </PageTitle>
        <section className="card stack">
          <p className="eyebrow">Private property required</p>
          <h2>Add property details first</h2>
          <p className="muted">
            Liber needs a private property record so the buyer knows what you are inviting them to review.
          </p>
          <div className="actions">
            <Link className="button" href={`/seller/properties/new?next=${encodeURIComponent(`/seller/invite/${buyer.id}`)}`}>
              Add Private Property
            </Link>
            <Link className="button secondary" href="/seller/search">Back to buyers</Link>
          </div>
        </section>
      </div>
    );
  }

  return (
    <div className="page stack">
      <PageTitle eyebrow="Seller" title={`Invite ${buyer.name}`}>
        Invite messages are manual outreach only, not offers or transaction execution.
      </PageTitle>

      <section className="grid two">
        <form action={submitInvite} className="card stack" encType="multipart/form-data">
          <input name="buyerProfileId" type="hidden" value={buyer.id} />
          <div className="field">
            <label htmlFor="property">Property</label>
            <select id="property" name="propertyId" defaultValue={property.id}>
              {properties.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.title} - {item.status}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label htmlFor="title">Message title</label>
            <input id="title" name="title" defaultValue="Your Northridge criteria match this home" />
          </div>
          <div className="field">
            <label htmlFor="message">Message body</label>
            <textarea
              id="message"
              name="message"
              defaultValue="This property appears to fit your preferred location, budget, and low-maintenance needs."
            />
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
              <input id="zip" name="zip" />
            </div>
            <div className="field">
              <label htmlFor="price">Asking price</label>
              <input id="price" name="price" defaultValue={property.price} />
            </div>
            <div className="field">
              <label htmlFor="beds">Bedrooms</label>
              <input id="beds" name="bedrooms" defaultValue={property.beds} />
            </div>
            <div className="field">
              <label htmlFor="baths">Bathrooms</label>
              <input id="baths" name="bathrooms" defaultValue={property.baths} />
            </div>
            <div className="field">
              <label htmlFor="area">Area</label>
              <input id="area" name="squareFeet" defaultValue={property.area} />
            </div>
            <div className="field">
              <label htmlFor="garage">Garage area</label>
              <input id="garage" name="garageArea" defaultValue={property.garageArea} />
            </div>
            <div className="field full">
              <label htmlFor="description">Property description</label>
              <textarea id="description" name="description" defaultValue={property.description} />
            </div>
            <div className="field full">
              <label htmlFor="images">Property images</label>
              <input id="images" name="images" type="file" accept="image/png,image/jpeg,image/webp" multiple />
            </div>
          </div>
          <label className="checkbox-row">
            <input type="checkbox" name="termsAccepted" value="true" />
            <span>I confirm this is a manual invite and does not create an offer, escrow, or funds custody.</span>
          </label>
          <div className="actions">
            <Link className="button secondary" href={`/buyers/${buyer.id}`}>Back to buyer</Link>
            <button className="button" type="submit">Send Invite</button>
          </div>
        </form>

        <aside className="stack">
          <h2>Quick Overview</h2>
          <div className="property-card">
            <div className="media-preview" />
            <div className="property-card-body">
              <h3 style={{ margin: 0 }}>{property.title}</h3>
              <p className="muted" style={{ margin: 0 }}>{property.location}</p>
              <div className="pill-row">
                <span className="pill active">{property.beds} beds</span>
                <span className="pill active">{property.baths} baths</span>
                <span className="pill active">{property.area} Sq Ft</span>
              </div>
              <strong>{formatMoney(property.price)}</strong>
              <span className={property.status.toLowerCase().includes("verified") ? "status-dot active" : "status-dot"}>
                Seller Property: {property.status}
              </span>
              <p>{property.description}</p>
              <div className="pill-row">
                {activeBadges.map((badge) => <BadgePill badge={badge} key={badge.label} />)}
              </div>
            </div>
          </div>
        </aside>
      </section>
    </div>
  );
}
