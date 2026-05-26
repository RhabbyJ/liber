import Link from "next/link";
import { notFound } from "next/navigation";
import { Icon } from "../../../../../components/icon";
import { ModeChip } from "../../../../../components/mode-chip";
import { PageTitle } from "../../../../../components/page-title";
import { PropertyAddressLookup } from "../../../../../components/property-address-lookup";
import { getSellerProperty } from "../../../../../server/contracts";
import { submitSellerPropertyUpdate } from "../../../../../server/form-actions";

export default async function EditSellerPropertyPage({
  params,
}: {
  params: Promise<{ propertyId: string }>;
}) {
  const { propertyId } = await params;
  const { data: property } = await getSellerProperty(propertyId).catch(() => ({ data: null }));

  if (!property) notFound();

  const verified = property.status.toLowerCase().includes("verified");

  return (
    <div className="page stack loose">
      <PageTitle
        eyebrow="Edit property"
        title={property.title}
        tone="seller"
        badge={<ModeChip mode="seller" />}
        actions={
          <span className={`status-dot ${verified ? "active" : "warning"}`}>
            <Icon name={verified ? "check-shield" : "info"} size={12} />
            {property.status}
          </span>
        }
      >
        This property stays private and is only shared with buyers you invite. Ownership documents are stored privately.
      </PageTitle>

      <section className="card stack loose">
        <form action={submitSellerPropertyUpdate} className="form-grid" encType="multipart/form-data">
          <input name="propertyId" type="hidden" value={property.id} />

          <div className="field">
            <label htmlFor="propertyType">Property type</label>
            <select id="propertyType" name="propertyType" defaultValue={property.propertyType}>
              <option value="HOME">Residential home</option>
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

          <div className="field">
            <label htmlFor="images">Add property images</label>
            <input id="images" name="images" type="file" accept="image/png,image/jpeg,image/webp" multiple />
          </div>
          <div className="field">
            <label htmlFor="ownership">Replace/add ownership verification</label>
            <input id="ownership" name="ownership" type="file" accept="application/pdf,image/png,image/jpeg,image/webp" />
            <span className="field-hint">New evidence is added; existing documents cannot be deleted.</span>
          </div>

          <div className="actions between" style={{ gridColumn: "1 / -1" }}>
            <Link className="button ghost" href="/seller/properties">
              <Icon name="arrow-right" size={14} style={{ transform: "rotate(180deg)" }} />
              Back
            </Link>
            <button className="button primary" type="submit">
              <Icon name="check" size={14} />
              Save changes
            </button>
          </div>
        </form>
      </section>
    </div>
  );
}
