import Link from "next/link";
import { PageTitle } from "../../../../components/page-title";
import { PropertyAddressLookup } from "../../../../components/property-address-lookup";
import { submitSellerProperty } from "../../../../server/form-actions";

export default async function NewSellerPropertyPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const { next } = await searchParams;
  const safeNext = typeof next === "string" && next.startsWith("/seller/") ? next : null;

  return (
    <div className="page stack">
      <PageTitle eyebrow="Seller" title="Add property details">
        This is a private property record for buyer invites, not a public listing. Ownership documents are private and reviewed by admins before trust status changes.
      </PageTitle>
      <section className="card stack">
        <form action={submitSellerProperty} className="form-grid" encType="multipart/form-data">
          {safeNext ? <input name="next" type="hidden" value={safeNext} /> : null}
          <div className="field">
            <label htmlFor="propertyType">Property type</label>
            <select id="propertyType" name="propertyType" defaultValue="HOME">
              <option value="HOME">Residential home</option>
            </select>
          </div>
          <div className="field">
            <label htmlFor="price">Asking price</label>
            <input id="price" name="price" placeholder="925000" />
          </div>
          <PropertyAddressLookup />
          <div className="field">
            <label htmlFor="garage">Garage area</label>
            <input id="garage" name="garageArea" placeholder="420" />
          </div>
          <div className="field">
            <label htmlFor="condition">Condition</label>
            <input id="condition" name="condition" placeholder="Well maintained" />
          </div>
          <div className="field full">
            <label htmlFor="features">Features</label>
            <textarea id="features" name="features" placeholder="Single story, no pool, attached garage" />
          </div>
          <div className="field full">
            <label htmlFor="description">Description</label>
            <textarea id="description" name="description" placeholder="Quiet single-story home with low-maintenance yard." />
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
