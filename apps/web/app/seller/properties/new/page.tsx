import type { Metadata } from "next";
import Link from "next/link";
import { Icon } from "../../../../components/icon";
import { PropertyAddressLookup } from "../../../../components/property-address-lookup";
import { PropertyDetailsFields } from "../../../../components/property-details-fields";
import { PropertyHeroIllustration } from "../../../../components/property-intake-illustration";
import { PropertyTypePicker } from "../../../../components/property-type-picker";
import {
  PropertyNotesField,
  PropertyPriceField,
  SellerPropertyFieldError,
  SellerPropertyForm,
  SellerPropertyFormAlert,
} from "../../../../components/seller-property-form";
import { DEFAULT_MARKET_SLUG } from "../../../../lib/service-areas";
import { submitSellerProperty } from "../../../../server/form-actions";
import { getActiveMarketBySlug } from "../../../../server/service-areas";

export const metadata: Metadata = { title: "Add property" };

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
      <Link className="page-back" href="/seller/properties">
        <Icon name="chevron-left" size={18} />
        Your properties
      </Link>

      <SellerPropertyForm action={submitSellerProperty} className="seller-property-intake-form">
        {safeNext ? <input name="next" type="hidden" value={safeNext} /> : null}

        <div className="seller-property-intake-hero">
          <div className="intake-banner">
            <PropertyHeroIllustration />
            <div className="intake-banner-text">
              <h1>Add your property</h1>
              <p className="seller-property-intake-lede">Enter the address to get started. It stays private.</p>
            </div>
          </div>
          <PropertyAddressLookup marketSlug={market.slug} marketState={market.state} presentation="intake" />
        </div>

        <section className="seller-property-intake-section" aria-labelledby="property-context-heading">
          <h2 id="property-context-heading">Listing details</h2>
          <div className="form-grid">
            <PropertyTypePicker
              defaultValue="HOME"
              legend="Property type"
              name="propertyType"
              required
            />
            <PropertyPriceField />
            <PropertyDetailsFields />
            <PropertyNotesField placeholder="Add useful private context." />
          </div>
        </section>

        <section className="seller-property-intake-section" aria-labelledby="property-authority-heading">
          <h2 id="property-authority-heading">Ownership</h2>
          <label className="checkbox-container">
            <input name="ownershipConfirmed" required type="checkbox" value="true" />
            <span className="checkmark" />
            I confirm I legally own this property or am authorized to represent the owner.
          </label>
          <SellerPropertyFieldError field="ownershipConfirmed" />
          <p className="fine-print">
            Only add a property you own or are authorized to represent. Claiming another person&rsquo;s property may be illegal.
            After saving, you&rsquo;ll upload your ID and a matching property bill for Liber&rsquo;s private review.
          </p>

          <SellerPropertyFormAlert />
          <div className="form-actions">
            <button className="button primary" type="submit">
              Save and continue
            </button>
            <Link className="text-link" href="/seller/properties">Cancel</Link>
          </div>
        </section>
      </SellerPropertyForm>
    </div>
  );
}
