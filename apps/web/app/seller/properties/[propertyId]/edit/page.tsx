import Link from "next/link";
import { notFound } from "next/navigation";
import { DirectUploadField } from "../../../../../components/direct-upload-field";
import { Icon } from "../../../../../components/icon";
import { PropertyAddressLookup } from "../../../../../components/property-address-lookup";
import { PropertyDetailsFields } from "../../../../../components/property-details-fields";
import { PropertyCoverPhoto } from "../../../../../components/property-cover-photo";
import { PropertyTypePicker } from "../../../../../components/property-type-picker";
import { formatMoney } from "../../../../../lib/format";
import { propertySubtypeLabel } from "../../../../../lib/property-types";
import { DEFAULT_MARKET_SLUG } from "../../../../../lib/service-areas";
import { getSellerProperty } from "../../../../../server/contracts";
import { submitSellerPropertyUpdate } from "../../../../../server/form-actions";
import { getActiveMarketBySlug } from "../../../../../server/service-areas";
import { confidentialDocumentAccessEnabled } from "../../../../../server/verification/document-access";

export default async function EditSellerPropertyPage({
  params,
}: {
  params: Promise<{ propertyId: string }>;
}) {
  const { propertyId } = await params;
  const market = await getActiveMarketBySlug(DEFAULT_MARKET_SLUG);
  const { data: property } = await getSellerProperty(propertyId).catch(() => ({ data: null }));

  if (!property) notFound();

  const verified = property.status === "Ownership verified";
  const documentsDisabledReason = confidentialDocumentAccessEnabled() ? undefined : "Document verification is temporarily unavailable.";
  const facts = [
    property.beds ? `${property.beds} bds` : null,
    property.baths ? `${property.baths} ba` : null,
    property.area ? `${property.area.toLocaleString("en-US")} sqft` : null,
    propertySubtypeLabel(property.propertyType),
  ].filter(Boolean);

  return (
    <div className="page listing-editor">
      <Link className="page-back" href="/seller/properties">
        <Icon name="chevron-left" size={18} />
        Your properties
      </Link>

      <header className="listing-editor-head">
        <PropertyCoverPhoto className="listing-editor-thumb" imageId={property.coverImageId} propertyType={property.propertyType} seed={property.id} showSampleTag={false} sizes="96px" />
        <div className="listing-editor-title">
          <h1>Edit property</h1>
          <p>{[property.title, property.location].filter(Boolean).join(", ")}</p>
        </div>
        <span className={`status-tag ${verified ? "active" : "pending"}`}>{property.status}</span>
      </header>

      <nav aria-label="Property sections" className="workspace-tabs listing-editor-tabs">
        <a className="workspace-tab" href="#details">Home details</a>
        <a className="workspace-tab" href="#photos">Photos</a>
        <a className="workspace-tab" href="#ownership">Ownership</a>
      </nav>

      {verified ? null : (
        <div className="inline-alert warning" role="note">
          <Icon name="info" size={20} />
          <p>
            <strong>Verify ownership to invite buyers.</strong> Upload a photo ID and a matching property bill.{" "}
            <a className="text-link" href="#ownership">Go to ownership</a>
          </p>
        </div>
      )}

      <div className="listing-editor-layout">
        <div className="listing-editor-main">
          <section aria-labelledby="details-title" className="listing-editor-section" id="details">
            <h2 id="details-title">Home details</h2>
            <form action={submitSellerPropertyUpdate} className="form-grid listing-editor-form">
              <input name="propertyId" type="hidden" value={property.id} />
              <PropertyTypePicker
                defaultValue={property.propertyType}
                legend="Property type"
                name="propertyType"
                required
              />
              <div className="field">
                <label htmlFor="price">Asking price</label>
                <input defaultValue={property.price} id="price" inputMode="numeric" name="price" />
              </div>

              <PropertyAddressLookup
                defaults={{
                  ...property.address,
                  bathrooms: property.baths,
                  bedrooms: property.beds,
                  lotSize: property.lotSize,
                  squareFeet: property.area,
                }}
                marketSlug={market.slug}
                marketState={market.state}
              />

              <PropertyDetailsFields condition={property.condition} features={property.features} />
              <div className="field full">
                <label htmlFor="description">Notes for invited buyers</label>
                <textarea defaultValue={property.description} id="description" name="description" />
              </div>

              <label className="checkbox-row full">
                <input name="ownershipConfirmed" required type="checkbox" value="true" />
                <span>
                  I confirm I currently own this property or am authorized to act for its owner. If its identity changed,
                  this records a new attestation and prior verification and invites remain invalid.
                </span>
              </label>

              <div className="listing-editor-savebar">
                <Link className="text-link" href="/seller/properties">Cancel</Link>
                <button className="button primary" type="submit">Save changes</button>
              </div>
            </form>
          </section>

          <section aria-labelledby="photos-title" className="listing-editor-section" id="photos">
            <h2 id="photos-title">Photos</h2>
            <p className="listing-editor-help">Only buyers you invite can see these photos.</p>
            <DirectUploadField
              accept="image/png,image/jpeg,image/webp"
              hint="PNG, JPEG, or WebP; 10 MB max each."
              label="Add property photos"
              multiple
              propertyId={property.id}
              purpose="PROPERTY_IMAGE"
            />
          </section>

          <section aria-labelledby="ownership-title" className="listing-editor-section" id="ownership">
            <h2 id="ownership-title">Ownership</h2>
            <p className="listing-editor-help">
              Submit a government-issued photo ID matching the exact title name or entity decision maker, plus a utility,
              tax, or mortgage bill matching the property name and address. Liber reviews them privately.
            </p>
            <div className="listing-editor-uploads">
              <DirectUploadField
                accept="application/pdf,image/png,image/jpeg,image/webp"
                disabledReason={documentsDisabledReason}
                hint="Private evidence for Liber review; 20 MB max."
                label="Government-issued photo ID"
                ownershipEvidenceKind="GOVERNMENT_ID"
                propertyId={property.id}
                purpose="PROPERTY_OWNERSHIP"
              />
              <DirectUploadField
                accept="application/pdf,image/png,image/jpeg,image/webp"
                disabledReason={documentsDisabledReason}
                hint="Utility, tax, or mortgage bill; 20 MB max."
                label="Property address evidence"
                ownershipEvidenceKind="PROPERTY_ADDRESS_PROOF"
                propertyId={property.id}
                purpose="PROPERTY_OWNERSHIP"
              />
            </div>
          </section>
        </div>

        <aside aria-label="Property summary" className="listing-editor-rail">
          <article className="listing-card static">
            <div className="listing-card-media">
              <PropertyCoverPhoto className="listing-card-art" imageId={property.coverImageId} propertyType={property.propertyType} seed={property.id} sizes="340px" />
              <div className="listing-card-flags">
                <span className="listing-flag">
                  <Icon name="lock" size={13} />
                  Invite only
                </span>
              </div>
            </div>
            <div className="listing-card-body">
              <p className="listing-card-price">{property.price > 0 ? formatMoney(property.price) : "Price not set"}</p>
              <p className="listing-card-address">{facts.join(" · ")}</p>
              <p className="listing-card-address">{property.title}</p>
            </div>
          </article>
          {verified ? (
            <Link className="button primary block" href="/">
              <Icon name="search" size={16} />
              Find buyers
            </Link>
          ) : (
            <p className="listing-editor-rail-note">Find buyers unlocks after Liber verifies ownership.</p>
          )}
        </aside>
      </div>
    </div>
  );
}
