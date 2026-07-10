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
    <div className="page wide seller-property-reference-page">
      <div className="seller-property-reference-head">
        <Link className="seller-property-back" href="/seller/properties">
          <Icon name="arrow-right" size={14} style={{ transform: "rotate(180deg)" }} />
          Back to properties
        </Link>
        <h1>Add Details About My Property</h1>
        <p>Your property stays private and is only shared with buyers you invite.</p>
      </div>

      <section className="seller-property-reference-shell">
        <form action={submitSellerProperty} className="seller-property-reference-form form-grid" encType="multipart/form-data">
          {safeNext ? <input name="next" type="hidden" value={safeNext} /> : null}

          <div className="field full seller-property-verify-section">
            <label>Verify Ownership</label>
            <span className="field-hint">
              To verify ownership, submit a government-issued photo ID matching the exact title name or entity decision maker,
              plus a utility, tax, or mortgage bill matching the property name and address.
            </span>
          </div>

          <div className="field seller-property-verify-section">
            <label htmlFor="ownershipIdentity">Government-issued photo ID</label>
            <div className="seller-property-file-line">
              <input id="ownershipIdentity" name="ownershipIdentity" type="file" accept="application/pdf,image/png,image/jpeg,image/webp" />
            </div>
            <span className="field-hint">Stored privately for Liber admin review only.</span>
          </div>

          <div className="field seller-property-verify-section">
            <label htmlFor="ownershipProof">Utility, tax, or mortgage bill</label>
            <div className="seller-property-file-line">
              <input id="ownershipProof" name="ownershipProof" type="file" accept="application/pdf,image/png,image/jpeg,image/webp" />
            </div>
            <span className="field-hint">Must match the property address and owner or authorized entity name.</span>
          </div>

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
            <span className="field-hint">Used only for matching; never displayed publicly.</span>
          </div>

          <PropertyAddressLookup marketSlug={market.slug} marketState={market.state} />

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
            <textarea id="features" name="features" placeholder="Single story, no pool, attached garage, low-maintenance yard" />
          </div>

          <div className="field full">
            <label htmlFor="description">Description</label>
            <textarea id="description" name="description" placeholder="Quiet single-story home with low-maintenance yard." />
          </div>

          <div className="field seller-property-image-upload">
            <label htmlFor="images">Property images</label>
            <input id="images" name="images" type="file" accept="image/png,image/jpeg,image/webp" multiple />
            <span className="field-hint">Shown only inside invites you send.</span>
          </div>

          <div className="auth-alert info field full">
            <strong>Ownership confirmation required</strong>
            <span>
              It is illegal to claim a property you do not legally own. Accepting an offer on a property you do not
              own or represent can be a criminal offense punishable by law. Confirming here does not replace admin
              review of ownership evidence.
            </span>
            <label className="checkbox-container" style={{ marginTop: 8 }}>
              <input name="ownershipConfirmed" required type="checkbox" value="true" />
              <span className="checkmark" />
              I confirm I legally own this property or am authorized to represent the owner.
            </label>
          </div>

          <div className="actions between" style={{ gridColumn: "1 / -1" }}>
            <Link className="button ghost" href="/seller/properties">Cancel</Link>
            <button className="button primary" type="submit">
              <Icon name="check" size={14} />
              Save
            </button>
          </div>
        </form>
      </section>
    </div>
  );
}
