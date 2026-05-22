import Link from "next/link";
import { BuyerCard } from "../../../components/buyer-card";
import { BuyerMap } from "../../../components/buyer-map";
import { PageTitle } from "../../../components/page-title";
import { searchBuyers } from "../../../server/contracts";

export default async function SellerSearchPage({
  searchParams,
}: {
  searchParams: Promise<{
    badges?: string | string[];
    bathrooms?: string;
    bedrooms?: string;
    budgetMax?: string;
    capRate?: string;
    centerLat?: string;
    centerLng?: string;
    city?: string;
    lotSize?: string;
    minRating?: string;
    minReviews?: string;
    propertyCategory?: string;
    propertySubtype?: string;
    radiusMiles?: string;
    sort?: string;
    squareFeet?: string;
    state?: string;
    units?: string;
  }>;
}) {
  const params = await searchParams;
  const badges = Array.isArray(params.badges) ? params.badges : params.badges ? [params.badges] : [];
  const { data: results } = await searchBuyers({
    badges,
    bathrooms: params.bathrooms || undefined,
    bedrooms: params.bedrooms || undefined,
    budgetMax: params.budgetMax || undefined,
    capRate: params.capRate || undefined,
    centerLat: params.centerLat || undefined,
    centerLng: params.centerLng || undefined,
    city: params.city || undefined,
    lotSize: params.lotSize || undefined,
    minRating: params.minRating || undefined,
    minReviews: params.minReviews || undefined,
    propertyCategory: params.propertyCategory || undefined,
    propertySubtype: params.propertySubtype || undefined,
    radiusMiles: params.radiusMiles || undefined,
    sort: params.sort || "recommended",
    squareFeet: params.squareFeet || undefined,
    state: params.state || undefined,
    units: params.units || undefined,
  });

  return (
    <div className="page stack">
      <PageTitle eyebrow="Seller" title="Search buyers">
        {results.length} active buyer profiles match the current filters.
      </PageTitle>

      <section className="filter-panel">
        <form className="filter-bar">
          <input aria-label="City" name="city" placeholder="City" defaultValue={params.city || ""} />
          <input aria-label="State" name="state" placeholder="State" defaultValue={params.state || ""} />
          <select aria-label="Property subtype" name="propertySubtype" defaultValue={params.propertySubtype || ""}>
            <option value="">All property types</option>
            <option value="HOME">Home</option>
            <option value="MULTIFAMILY">Multifamily</option>
            <option value="LAND">Land</option>
            <option value="RETAIL">Retail</option>
            <option value="STNL">STNL</option>
            <option value="INDUSTRIAL">Industrial</option>
            <option value="OFFICE">Office</option>
            <option value="OTHER">Other commercial</option>
          </select>
          <select aria-label="Property category" name="propertyCategory" defaultValue={params.propertyCategory || ""}>
            <option value="">All categories</option>
            <option value="HOME">Home</option>
            <option value="LAND">Land</option>
            <option value="COMMERCIAL">Commercial</option>
          </select>
          <select aria-label="Sort" name="sort" defaultValue={params.sort || "recommended"}>
            <option value="recommended">Recommended</option>
            <option value="recently_active">Recently active</option>
            <option value="highest_budget">Highest budget</option>
            <option value="most_verified">Most verified</option>
            <option value="highest_rated">Highest rated</option>
          </select>
          <input aria-label="Budget max" name="budgetMax" placeholder="Budget max" defaultValue={params.budgetMax || ""} />
          <input aria-label="Bedrooms" name="bedrooms" placeholder="Beds" defaultValue={params.bedrooms || ""} />
          <input aria-label="Bathrooms" name="bathrooms" placeholder="Baths" defaultValue={params.bathrooms || ""} />
          <input aria-label="Square feet" name="squareFeet" placeholder="Sqft" defaultValue={params.squareFeet || ""} />
          <input aria-label="Lot size" name="lotSize" placeholder="Lot size" defaultValue={params.lotSize || ""} />
          <input aria-label="Cap rate" name="capRate" placeholder="Cap rate" defaultValue={params.capRate || ""} />
          <input aria-label="Units" name="units" placeholder="Units" defaultValue={params.units || ""} />
          <input aria-label="Latitude" name="centerLat" placeholder="Lat" defaultValue={params.centerLat || ""} />
          <input aria-label="Longitude" name="centerLng" placeholder="Lng" defaultValue={params.centerLng || ""} />
          <input aria-label="Radius miles" name="radiusMiles" placeholder="Miles" defaultValue={params.radiusMiles || ""} />
          <select aria-label="Minimum rating" name="minRating" defaultValue={params.minRating || ""}>
            <option value="">Any rating</option>
            <option value="4">4+ stars</option>
            <option value="4.5">4.5+ stars</option>
            <option value="5">5 stars</option>
          </select>
          <select aria-label="Minimum reviews" name="minReviews" defaultValue={params.minReviews || ""}>
            <option value="">Any reviews</option>
            <option value="1">1+ reviews</option>
            <option value="3">3+ reviews</option>
            <option value="5">5+ reviews</option>
          </select>
          <select aria-label="Badge" name="badges" defaultValue={badges[0] || ""}>
            <option value="">Any badge</option>
            <option value="PRE_APPROVED">Pre-approved</option>
            <option value="CASH_BUYER">Cash buyer</option>
            <option value="NON_CONTINGENT">Non-contingent</option>
            <option value="VERIFIED_FUNDS">Verified funds</option>
            <option value="COMPLETED_TRANSACTION">Completed transaction</option>
          </select>
          <button className="button secondary" type="submit">All Filters</button>
          <Link className="button" href="/seller/properties/new">Add My Property Details</Link>
        </form>
      </section>

      <section className="grid search-grid">
        <BuyerMap buyers={results} />
        <div className="buyer-list">
          <div className="buyer-list-head">
            <h2>{params.city || "Northridge"} Buyers for your property</h2>
            <label className="checkbox-row">
              <input type="checkbox" />
              <span>Select all</span>
            </label>
          </div>
          {results.map((buyer) => (
            <BuyerCard buyer={buyer} key={buyer.id} selectable />
          ))}
        </div>
      </section>
    </div>
  );
}
