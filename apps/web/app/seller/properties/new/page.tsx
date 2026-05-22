import Link from "next/link";
import { PageTitle } from "../../../../components/page-title";
import { submitSellerProperty } from "../../../../server/form-actions";

export default function NewSellerPropertyPage() {
  return (
    <div className="page stack">
      <PageTitle eyebrow="Seller" title="Add property details">
        Ownership documents are private and reviewed by admins before trust status changes.
      </PageTitle>
      <section className="card stack">
        <form action={submitSellerProperty} className="form-grid" encType="multipart/form-data">
          <div className="field">
            <label htmlFor="propertyType">Property type</label>
            <select id="propertyType" name="propertyType" defaultValue="HOME">
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
          <div className="field">
            <label htmlFor="price">Optional price</label>
            <input id="price" name="price" defaultValue="925000" />
          </div>
          <div className="field full">
            <label htmlFor="address">Address</label>
            <input id="address" name="addressLine1" defaultValue="18412 Garden Lane" />
          </div>
          <div className="field full">
            <label htmlFor="addressLine2">Address line 2</label>
            <input id="addressLine2" name="addressLine2" />
          </div>
          <div className="field">
            <label htmlFor="city">City</label>
            <input id="city" name="city" defaultValue="Northridge" />
          </div>
          <div className="field">
            <label htmlFor="state">State</label>
            <input id="state" name="state" defaultValue="CA" />
          </div>
          <div className="field">
            <label htmlFor="zip">Zip</label>
            <input id="zip" name="zip" defaultValue="91324" />
          </div>
          <div className="field">
            <label htmlFor="lat">Latitude</label>
            <input id="lat" name="lat" defaultValue="34.2381" />
          </div>
          <div className="field">
            <label htmlFor="lng">Longitude</label>
            <input id="lng" name="lng" defaultValue="-118.5301" />
          </div>
          <div className="field">
            <label htmlFor="beds">Bedrooms</label>
            <input id="beds" name="bedrooms" defaultValue="4" />
          </div>
          <div className="field">
            <label htmlFor="baths">Bathrooms</label>
            <input id="baths" name="bathrooms" defaultValue="2" />
          </div>
          <div className="field">
            <label htmlFor="area">Square feet</label>
            <input id="area" name="squareFeet" defaultValue="2140" />
          </div>
          <div className="field">
            <label htmlFor="lot">Lot size</label>
            <input id="lot" name="lotSize" defaultValue="7200" />
          </div>
          <div className="field">
            <label htmlFor="garage">Garage area</label>
            <input id="garage" name="garageArea" defaultValue="420" />
          </div>
          <div className="field">
            <label htmlFor="condition">Condition</label>
            <input id="condition" name="condition" defaultValue="Well maintained" />
          </div>
          <div className="field full">
            <label htmlFor="features">Features</label>
            <textarea id="features" name="features" defaultValue="Single story, no pool, attached garage" />
          </div>
          <div className="field full">
            <label htmlFor="description">Description</label>
            <textarea id="description" name="description" defaultValue="Quiet single-story home with low-maintenance yard." />
          </div>
          <div className="field">
            <label htmlFor="images">Property images</label>
            <input id="images" name="images" type="file" accept="image/png,image/jpeg,image/webp" multiple />
          </div>
          <div className="field">
            <label htmlFor="ownership">Ownership verification</label>
            <input id="ownership" name="ownership" type="file" accept="application/pdf,image/png,image/jpeg,image/webp" />
          </div>
          <div className="actions">
            <Link className="button secondary" href="/seller/properties">Cancel</Link>
            <button className="button" type="submit">Save property</button>
          </div>
        </form>
      </section>
    </div>
  );
}
