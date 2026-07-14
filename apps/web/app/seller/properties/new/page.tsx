import Link from "next/link";
import { Icon } from "../../../../components/icon";
import { PropertyAddressLookup } from "../../../../components/property-address-lookup";
import { OwnershipReviewIllustration, PropertyHeroIllustration } from "../../../../components/property-intake-illustration";
import { PropertyTypePicker } from "../../../../components/property-type-picker";
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
          <PropertyHeroIllustration />
          <p className="eyebrow">Step 1</p>
          <h1>Add your property</h1>
          <p className="seller-property-intake-lede">Enter the address to get started. It stays private.</p>
          <ol className="property-intake-steps" aria-label="Property setup steps">
            <li><span>1</span><strong>Address</strong></li>
            <li><span>2</span><strong>Details</strong></li>
            <li><span>3</span><strong>Confirm</strong></li>
          </ol>
          <PropertyAddressLookup marketSlug={market.slug} marketState={market.state} presentation="intake" />
        </div>

        <section className="seller-property-intake-section" aria-labelledby="property-context-heading">
          <header className="property-intake-section-head">
            <h2 id="property-context-heading">Match with buyers</h2>
            <p>Add details buyers care about.</p>
          </header>
          <div className="form-grid">
            <PropertyTypePicker
              defaultValue="HOME"
              legend="Property type"
              name="propertyType"
              required
            />
            <div className="field">
              <label htmlFor="price">Asking price</label>
              <input id="price" name="price" placeholder="925000" inputMode="numeric" />
            </div>
            <div className="field">
              <label htmlFor="garage">Garage size (sq ft)</label>
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
              <label htmlFor="description">Notes for invited buyers</label>
              <textarea id="description" name="description" placeholder="Add useful private context." />
            </div>
          </div>
        </section>

        <section className="seller-property-intake-section" aria-labelledby="property-authority-heading">
          <header className="property-intake-section-head">
            <p className="eyebrow">Step 3</p>
            <h2 id="property-authority-heading">Confirm and save</h2>
          </header>

          <div className="property-intake-next-step">
            <OwnershipReviewIllustration />
            <div>
              <strong>Next: verify ownership</strong>
              <p>After saving, upload your ID and a matching property bill for private review.</p>
            </div>
          </div>

          <div className="property-intake-attestation">
            <strong>Ownership confirmation required</strong>
            <p>
              Only add a property you own or are authorized to represent. Claiming another person&rsquo;s property may be illegal.
              Liber still reviews your documents.
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
              Save and continue
            </button>
          </div>
        </section>
      </form>
    </div>
  );
}
