import Link from "next/link";
import { BuyerCard } from "../../../components/buyer-card";
import { BuyerMap } from "../../../components/buyer-map";
import { LocationLookupFields } from "../../../components/location-lookup-fields";
import { PageTitle } from "../../../components/page-title";
import { getCurrentSellerAccess, searchBuyers } from "../../../server/contracts";

const budgetMaxOptions = [
  { label: "Any budget", value: "" },
  { label: "Up to $500k", value: "500000" },
  { label: "Up to $750k", value: "750000" },
  { label: "Up to $1M", value: "1000000" },
  { label: "Up to $1.5M", value: "1500000" },
  { label: "Up to $2M", value: "2000000" },
  { label: "Up to $3M+", value: "3000000" },
];

const bedroomOptions = [
  { label: "Any beds", value: "" },
  { label: "1+ beds", value: "1" },
  { label: "2+ beds", value: "2" },
  { label: "3+ beds", value: "3" },
  { label: "4+ beds", value: "4" },
  { label: "5+ beds", value: "5" },
];

const bathroomOptions = [
  { label: "Any baths", value: "" },
  { label: "1+ baths", value: "1" },
  { label: "2+ baths", value: "2" },
  { label: "3+ baths", value: "3" },
  { label: "4+ baths", value: "4" },
];

export default async function SellerSearchPage({
  searchParams,
}: {
  searchParams: Promise<{
    area?: string;
    badges?: string | string[];
    bathrooms?: string;
    bedrooms?: string;
    budgetMax?: string;
    centerLat?: string;
    centerLng?: string;
    city?: string;
    propertySubtype?: string;
    radiusMiles?: string;
    sort?: string;
    state?: string;
  }>;
}) {
  const params = await searchParams;
  const { data: sellerAccess } = await getCurrentSellerAccess();

  if (sellerAccess.status !== "APPROVED") {
    return (
      <div className="page stack">
        <PageTitle eyebrow="Seller" title="Buyer directory access pending">
          A Liber admin must approve seller directory access before buyer search, buyer profile viewing, or invites are available.
        </PageTitle>
        <section className="card stack">
          <p className="eyebrow">Status</p>
          <h2>{sellerAccess.status ?? "PENDING"}</h2>
          <p className="muted">
            You can continue preparing private property records while access is reviewed.
          </p>
          <Link className="button" href="/seller/properties">Manage Properties</Link>
        </section>
      </div>
    );
  }

  const badges = Array.isArray(params.badges) ? params.badges : params.badges ? [params.badges] : [];
  const centerLat = numberParam(params.centerLat);
  const centerLng = numberParam(params.centerLng);
  const radiusMiles = numberParam(params.radiusMiles);
  const propertySubtype = params.propertySubtype === "HOME" ? "HOME" : undefined;
  const sort = sellerSortParam(params.sort);
  const { data: results } = await searchBuyers({
    badges,
    bathrooms: params.bathrooms || undefined,
    bedrooms: params.bedrooms || undefined,
    budgetMax: params.budgetMax || undefined,
    centerLat: params.centerLat || undefined,
    centerLng: params.centerLng || undefined,
    city: params.city || undefined,
    propertySubtype,
    radiusMiles: params.radiusMiles || undefined,
    sort,
    state: params.state || undefined,
  });

  return (
    <div className="page stack">
      <PageTitle eyebrow="Seller" title="Search buyers">
        {results.length} active buyer profiles match the current filters. Properties stay private until you invite a buyer.
      </PageTitle>

      <section className="filter-panel">
        <form className="filter-bar">
          <LocationLookupFields
            cityName="city"
            defaultCity={params.city || ""}
            defaultLat={params.centerLat || ""}
            defaultLng={params.centerLng || ""}
            defaultLocation={params.area || params.city || ""}
            defaultRadiusMiles={params.radiusMiles || 8}
            inputName="area"
            intent="search"
            label="Pilot area or ZIP"
            latName="centerLat"
            lngName="centerLng"
            radiusName="radiusMiles"
            stateName="state"
          />
          <select aria-label="Property subtype" name="propertySubtype" defaultValue={propertySubtype || ""}>
            <option value="">Any residential buyer</option>
            <option value="HOME">Home buyer</option>
          </select>
          <select aria-label="Sort" name="sort" defaultValue={sort}>
            <option value="recommended">Recommended</option>
            <option value="recently_active">Recently active</option>
            <option value="highest_budget">Highest budget</option>
            <option value="most_verified">Most verified</option>
          </select>
          <select aria-label="Budget max" name="budgetMax" defaultValue={params.budgetMax || ""}>
            {budgetMaxOptions.map((option) => (
              <option key={option.label} value={option.value}>{option.label}</option>
            ))}
          </select>
          <select aria-label="Bedrooms" name="bedrooms" defaultValue={params.bedrooms || ""}>
            {bedroomOptions.map((option) => (
              <option key={option.label} value={option.value}>{option.label}</option>
            ))}
          </select>
          <select aria-label="Bathrooms" name="bathrooms" defaultValue={params.bathrooms || ""}>
            {bathroomOptions.map((option) => (
              <option key={option.label} value={option.value}>{option.label}</option>
            ))}
          </select>
          <select aria-label="Badge" name="badges" defaultValue={badges[0] || ""}>
            <option value="">Any badge</option>
            <option value="PRE_APPROVED">Admin-verified pre-approval</option>
            <option value="CASH_BUYER">Cash buyer</option>
            <option value="NON_CONTINGENT">Non-contingent</option>
            <option value="VERIFIED_FUNDS">Verified funds</option>
            <option value="COMPLETED_TRANSACTION">Completed transaction</option>
          </select>
          <button className="button secondary" type="submit">Apply filters</button>
          <Link className="button" href="/seller/properties/new">Add Private Property</Link>
        </form>
      </section>

      <section className="grid search-grid">
        <BuyerMap buyers={results} centerLat={centerLat} centerLng={centerLng} radiusMiles={radiusMiles} />
        <div className="buyer-list">
          <div className="buyer-list-head">
            <h2>{params.city ? `${params.city} buyers for your property` : "Active buyers for your property"}</h2>
          </div>
          {results.map((buyer) => (
            <BuyerCard buyer={buyer} key={buyer.id} />
          ))}
        </div>
      </section>
    </div>
  );
}

function numberParam(value?: string) {
  if (!value) return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function sellerSortParam(value?: string) {
  if (
    value === "recently_active" ||
    value === "highest_budget" ||
    value === "most_verified"
  ) {
    return value;
  }
  return "recommended";
}
