import Link from "next/link";
import { notFound } from "next/navigation";
import { Icon } from "../../../../../components/icon";
import { DirectUploadField } from "../../../../../components/direct-upload-field";
import { PropertyAddressLookup } from "../../../../../components/property-address-lookup";
import { propertyTypeOptions } from "../../../../../lib/property-types";
import { DEFAULT_MARKET_SLUG } from "../../../../../lib/service-areas";
import { getSellerProperty } from "../../../../../server/contracts";
import { submitSellerPropertyUpdate } from "../../../../../server/form-actions";
import { getActiveMarketBySlug } from "../../../../../server/service-areas";

export default async function EditSellerPropertyPage({
  params,
}: {
  params: Promise<{ propertyId: string }>;
}) {
  const { propertyId } = await params;
  const market = await getActiveMarketBySlug(DEFAULT_MARKET_SLUG);
  const { data: property } = await getSellerProperty(propertyId).catch(() => ({ data: null }));

  if (!property) notFound();

  const verified = property.status.toLowerCase().includes("verified");

  return (
    <div className="page wide seller-property-reference-page">
      <div className="seller-property-reference-head">
        <Link className="seller-property-back" href="/seller/properties">
          <Icon name="arrow-right" size={14} style={{ transform: "rotate(180deg)" }} />
          Back to properties
        </Link>
        <div className="seller-property-title-row">
          <h1>Edit Property Details</h1>
          <span className={`status-dot ${verified ? "active" : "warning"}`}>
            <Icon name={verified ? "check-shield" : "info"} size={12} />
            {property.status}
          </span>
        </div>
        <p>This property stays private and is only shared with buyers you invite.</p>
      </div>

      <section className="seller-property-reference-shell">
        <div className="seller-property-reference-form form-grid">
          <DirectUploadField
            accept="application/pdf,image/png,image/jpeg,image/webp"
            hint="Private, immutable evidence for Liber admin review; 20 MB max."
            label="Government-issued photo ID"
            ownershipEvidenceKind="GOVERNMENT_ID"
            propertyId={property.id}
            purpose="PROPERTY_OWNERSHIP"
          />
          <DirectUploadField
            accept="application/pdf,image/png,image/jpeg,image/webp"
            hint="Utility, tax, or mortgage bill matching this property; 20 MB max."
            label="Property address evidence"
            ownershipEvidenceKind="PROPERTY_ADDRESS_PROOF"
            propertyId={property.id}
            purpose="PROPERTY_OWNERSHIP"
          />
          <DirectUploadField
            accept="image/png,image/jpeg,image/webp"
            hint="Private invite images; PNG, JPEG, or WebP; 10 MB max each."
            label="Add property images"
            multiple
            propertyId={property.id}
            purpose="PROPERTY_IMAGE"
          />
        </div>

        <form action={submitSellerPropertyUpdate} className="seller-property-reference-form form-grid">
          <input name="propertyId" type="hidden" value={property.id} />

          <div className="field full seller-property-verify-section">
            <label>Verify Ownership</label>
            <span className="field-hint">
              To verify ownership, submit a government-issued photo ID matching the exact title name or entity decision maker,
              plus a utility, tax, or mortgage bill matching the property name and address.
            </span>
          </div>


          <div className="field">
            <label htmlFor="propertyType">Property type</label>
            <select id="propertyType" name="propertyType" defaultValue={property.propertyType}>
              {propertyTypeOptions.map((option) => (
                <option key={option.value} value={option.value}>{option.label}</option>
              ))}
            </select>
          </div>
          <div className="field">
            <label htmlFor="price">Asking price</label>
            <input id="price" name="price" defaultValue={property.price} inputMode="numeric" />
          </div>

          <PropertyAddressLookup
            defaults={{
              addressLine1: property.title,
              bathrooms: property.baths,
              bedrooms: property.beds,
              city: property.location.split(",")[0]?.trim(),
              lotSize: property.lotSize,
              squareFeet: property.area,
              state: property.location.split(",")[1]?.trim().slice(0, 2),
            }}
            marketSlug={market.slug}
            marketState={market.state}
          />

          <div className="field">
            <label htmlFor="condition">Condition</label>
            <input id="condition" name="condition" defaultValue={property.condition} />
          </div>
          <div className="field">
            <label htmlFor="garage">Garage area</label>
            <input id="garage" name="garageArea" defaultValue={property.garageArea} inputMode="numeric" />
          </div>

          <div className="field full">
            <label htmlFor="features">Features</label>
            <textarea id="features" name="features" defaultValue={property.features.join(", ")} />
          </div>
          <div className="field full">
            <label htmlFor="description">Description</label>
            <textarea id="description" name="description" defaultValue={property.description} />
          </div>

          <label className="checkbox-row full">
            <input name="ownershipConfirmed" required type="checkbox" value="true" />
            <span>
              I confirm I currently own this property or am authorized to act for its owner. If its identity changed,
              this records a new attestation and prior verification and invites remain invalid.
            </span>
          </label>

          <div className="actions between" style={{ gridColumn: "1 / -1" }}>
            <Link className="button ghost" href="/seller/properties">
              <Icon name="arrow-right" size={14} style={{ transform: "rotate(180deg)" }} />
              Back
            </Link>
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
