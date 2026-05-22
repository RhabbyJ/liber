import Link from "next/link";
import { notFound } from "next/navigation";
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

  return (
    <div className="page stack">
      <PageTitle eyebrow="Seller" title={`Edit ${property.title}`} />
      <section className="card stack">
        <form action={submitSellerPropertyUpdate} className="form-grid" encType="multipart/form-data">
          <input name="propertyId" type="hidden" value={property.id} />
          <div className="field">
            <label htmlFor="propertyType">Property type</label>
            <select id="propertyType" name="propertyType" defaultValue={property.propertyType}>
              <option value="HOME">Home</option>
              <option value="MULTIFAMILY">Multifamily</option>
              <option value="LAND">Land</option>
              <option value="RETAIL">Retail</option>
              <option value="STNL">STNL</option>
              <option value="INDUSTRIAL">Industrial</option>
              <option value="OFFICE">Office</option>
              <option value="OTHER">Other commercial</option>
            </select>
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
            <label htmlFor="price">Price</label>
            <input id="price" name="price" defaultValue={property.price} />
          </div>
          <div className="field">
            <label htmlFor="condition">Condition</label>
            <input id="condition" name="condition" defaultValue={property.condition} />
          </div>
          <div className="field">
            <label htmlFor="garage">Garage area</label>
            <input id="garage" name="garageArea" defaultValue={property.garageArea} />
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
          </div>
          <div className="actions">
            <Link className="button secondary" href="/seller/properties">Back</Link>
            <button className="button" type="submit">Save changes</button>
          </div>
        </form>
      </section>
    </div>
  );
}
