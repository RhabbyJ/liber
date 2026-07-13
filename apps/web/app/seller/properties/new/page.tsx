import Link from "next/link";
import { Icon } from "../../../../components/icon";
import { PropertyAddressLookup } from "../../../../components/property-address-lookup";
import { propertyTypeOptions } from "../../../../lib/property-types";
import { DEFAULT_MARKET_SLUG } from "../../../../lib/service-areas";
import { submitSellerProperty } from "../../../../server/form-actions";
import { getActiveMarketBySlug } from "../../../../server/service-areas";

export default async function NewSellerPropertyPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const { next } = await searchParams;
  const market = await getActiveMarketBySlug(DEFAULT_MARKET_SLUG);
  const safeNext = typeof next === "string" && next.startsWith("/seller/") ? next : null;

  return (
    <div className="seller-property-intake-page">
      <header className="seller-property-intake-context">
        <Link aria-label="Back to properties" className="seller-property-back" href="/seller/properties">
          <Icon name="arrow-right" size={14} style={{ transform: "rotate(180deg)" }} />
          <span aria-hidden="true" className="seller-property-back-label">Back to properties</span>
          <span aria-hidden="true" className="seller-property-back-label-mobile">Back</span>
        </Link>
        <strong>Your properties</strong>
      </header>

      <form action={submitSellerProperty} className="seller-property-intake-form">
        {safeNext ? <input name="next" type="hidden" value={safeNext} /> : null}

        <div className="seller-property-intake-hero">
          <PropertyIntakeArtwork />
          <h1>Add a private property</h1>
          <p className="seller-property-intake-lede">
            Start with the address. We will look for available property facts, then you can review every detail before saving.
          </p>
          <PropertyAddressLookup marketSlug={market.slug} marketState={market.state} presentation="intake" />
        </div>

        <section className="seller-property-intake-section" aria-labelledby="property-context-heading">
          <header className="property-intake-section-head">
            <h2 id="property-context-heading">Add matching context</h2>
            <p>These details help compare your property with buyer demand. They are never published as a public listing.</p>
          </header>
          <div className="form-grid">
            <div className="field">
              <label htmlFor="propertyType">Property type</label>
              <select id="propertyType" name="propertyType" defaultValue="HOME">
                {propertyTypeOptions.map((option) => (
                  <option key={option.value} value={option.value}>{option.label}</option>
                ))}
              </select>
              <span className="field-hint">Used for matching against buyer seeking type.</span>
            </div>
            <div className="field">
              <label htmlFor="price">Asking price</label>
              <input id="price" name="price" placeholder="925000" inputMode="numeric" />
              <span className="field-hint">Used only for matching and private invite context.</span>
            </div>
            <div className="field">
              <label htmlFor="garage">Garage area</label>
              <input id="garage" name="garageArea" placeholder="420" inputMode="numeric" />
            </div>
            <div className="field">
              <label htmlFor="condition">Condition</label>
              <input id="condition" name="condition" placeholder="Well maintained" />
            </div>
            <div className="field full">
              <label htmlFor="features">Features</label>
              <textarea id="features" name="features" placeholder="Single story, attached garage, low-maintenance yard" />
            </div>
            <div className="field full">
              <label htmlFor="description">Private description</label>
              <textarea id="description" name="description" placeholder="Add useful context for buyers you choose to invite." />
            </div>
          </div>
        </section>

        <section className="seller-property-intake-section" aria-labelledby="property-authority-heading">
          <header className="property-intake-section-head">
            <h2 id="property-authority-heading">Confirm your authority</h2>
            <p>A saved property remains private and cannot back new invites until the required ownership review is current.</p>
          </header>

          <div className="property-intake-next-step">
            <Icon name="lock" size={18} />
            <div>
              <strong>Evidence comes next</strong>
              <p>After saving, upload a government-issued photo ID and a utility, tax, or mortgage bill for private admin review.</p>
            </div>
          </div>

          <div className="property-intake-attestation">
            <strong>Ownership confirmation required</strong>
            <p>
              It is illegal to claim a property you do not legally own. Accepting an offer on a property you do not own or
              represent can be a criminal offense punishable by law. Confirming here does not replace admin review of ownership evidence.
            </p>
            <label className="checkbox-container">
              <input name="ownershipConfirmed" required type="checkbox" value="true" />
              <span className="checkmark" />
              I confirm I legally own this property or am authorized to represent the owner.
            </label>
          </div>

          <div className="property-intake-actions">
            <Link className="button ghost" href="/seller/properties">Cancel</Link>
            <button className="button primary" type="submit">
              <Icon name="check" size={14} />
              Save private property
            </button>
          </div>
        </section>
      </form>
    </div>
  );
}

function PropertyIntakeArtwork() {
  return (
    <div aria-hidden="true" className="property-intake-art">
      <span className="property-intake-art-ground" />
      <span className="property-intake-art-tree property-intake-art-tree-left">
        <span />
      </span>
      <span className="property-intake-art-house">
        <span className="property-intake-art-roof" />
        <span className="property-intake-art-window property-intake-art-window-left" />
        <span className="property-intake-art-window property-intake-art-window-right" />
        <span className="property-intake-art-door" />
      </span>
      <span className="property-intake-art-tree property-intake-art-tree-right">
        <span />
      </span>
    </div>
  );
}
