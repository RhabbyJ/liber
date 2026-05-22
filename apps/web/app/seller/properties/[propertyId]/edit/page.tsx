import Link from "next/link";
import { notFound } from "next/navigation";
import { PageTitle } from "../../../../../components/page-title";
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
          <div className="field full">
            <label htmlFor="address">Address</label>
            <input id="address" name="addressLine1" defaultValue={property.title} />
          </div>
          <div className="field full">
            <label htmlFor="addressLine2">Address line 2</label>
            <input id="addressLine2" name="addressLine2" />
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
            <label htmlFor="lat">Latitude</label>
            <input id="lat" name="lat" />
          </div>
          <div className="field">
            <label htmlFor="lng">Longitude</label>
            <input id="lng" name="lng" />
          </div>
          <div className="field">
            <label htmlFor="price">Price</label>
            <input id="price" name="price" defaultValue={property.price} />
          </div>
          <div className="field">
            <label htmlFor="condition">Condition</label>
            <input id="condition" name="condition" defaultValue={property.condition} />
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
            <label htmlFor="area">Square feet</label>
            <input id="area" name="squareFeet" defaultValue={property.area} />
          </div>
          <div className="field">
            <label htmlFor="lot">Lot size</label>
            <input id="lot" name="lotSize" defaultValue={property.lotSize} />
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
