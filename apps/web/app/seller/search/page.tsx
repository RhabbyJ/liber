import Link from "next/link";
import { BuyerCard } from "../../../components/buyer-card";
import { BuyerMap } from "../../../components/buyer-map";
import { EmptyState } from "../../../components/empty-state";
import { Icon } from "../../../components/icon";
import { ModeChip } from "../../../components/mode-chip";
import { PageTitle } from "../../../components/page-title";
import { SearchFiltersSidebar } from "../../../components/search-filters-sidebar";
import { SellerMapLocationSearch } from "../../../components/seller-map-location-search";
import { SortSelect } from "../../../components/sort-select";
import { selectedMapArea } from "../../../lib/map-area";
import { propertySubtypeLabel } from "../../../lib/property-types";
import { DEFAULT_MARKET_SLUG, serviceAreaDisplayLabel } from "../../../lib/service-areas";
import { canViewBuyerDirectory } from "../../../server/access";
import { getCurrentSellerAccess, searchBuyers } from "../../../server/contracts";
import { getActiveMarketBySlug, getActiveServiceAreaBySlug } from "../../../server/service-areas";
import { getSessionUser } from "../../../server/session";

type SellerSearchParams = {
  amenities?: string | string[];
  badges?: string | string[];
  bathrooms?: string;
  bedrooms?: string;
  budgetMin?: string;
  budgetMax?: string;
  condition?: string;
  market?: string;
  propertySubtype?: string;
  serviceArea?: string;
  sort?: string;
  squareFeet?: string;
  view?: string;
};

export default async function SellerSearchPage({
  searchParams,
}: {
  searchParams: Promise<SellerSearchParams>;
}) {
  const params = await searchParams;
  const user = await getSessionUser();
  const { data: sellerAccess } = await getCurrentSellerAccess();
  const canSearch = user ? await canViewBuyerDirectory(user) : false;

  if (!canSearch) {
    return (
      <div className="page stack loose">
        <PageTitle
          eyebrow="Seller workspace"
          title="Buyer directory access pending"
          tone="seller"
          badge={<ModeChip mode="seller" />}
        >
          A Liber admin must approve seller directory access before buyer search, profile viewing, or invites are available.
        </PageTitle>
        <section className="card cream stack">
          <div className="section-head compact">
            <div>
              <p className="eyebrow amber">Status</p>
              <h2 style={{ fontSize: 22 }}>{sellerAccess.status ?? "PENDING"}</h2>
            </div>
            <span className="status-dot amber">
              <Icon name="info" size={12} />
              Awaiting review
            </span>
          </div>
          <p className="muted">
            You can continue preparing private property records while access is reviewed. Properties stay private until you
            invite a buyer.
          </p>
          <div className="actions">
            <Link className="button primary" href="/seller/properties">
              <Icon name="home" size={14} />
              Manage properties
            </Link>
          </div>
        </section>
      </div>
    );
  }

  const badges = Array.isArray(params.badges) ? params.badges : params.badges ? [params.badges] : [];
  const amenities = Array.isArray(params.amenities) ? params.amenities : params.amenities ? [params.amenities] : [];
  const sort = sellerSortParam(params.sort);
  const marketSlug = serviceAreaParam(params.market) ?? DEFAULT_MARKET_SLUG;
  const market = await getActiveMarketBySlug(marketSlug);
  const requestedServiceArea = serviceAreaParam(params.serviceArea);
  const selectedServiceArea = requestedServiceArea
    ? await getActiveServiceAreaBySlug(requestedServiceArea, market.slug)
    : null;
  const selectedMapServiceArea = selectedMapArea(selectedServiceArea);
  const { data: results } = await searchBuyers({
    amenities,
    badges,
    bathrooms: params.bathrooms || undefined,
    bedrooms: params.bedrooms || undefined,
    budgetMin: params.budgetMin || undefined,
    budgetMax: params.budgetMax || undefined,
    condition: params.condition || undefined,
    market: market.slug,
    propertySubtype: params.propertySubtype || undefined,
    serviceArea: requestedServiceArea,
    sort,
    squareFeet: params.squareFeet || undefined,
  });

  const selectedServiceAreaLabel = selectedServiceArea ? serviceAreaDisplayLabel(selectedServiceArea) : "";
  const activeFilters = buildActiveFilters(
    { ...params, market: market.slug },
    badges,
    amenities,
    selectedServiceAreaLabel,
  );
  const locationLabel = selectedServiceArea?.label ?? "Matched";

  return (
    <div className="page wide seller-profile-search-page">
      <div className="seller-profile-top-action">
        <Link className="button primary" href="/seller/properties/new">
          Add My Property Details
        </Link>
      </div>

      <section className="seller-profile-search-grid">
        <div className="seller-profile-map-column">
          <h1>Showing {results.length} buyers</h1>
          <SellerMapLocationSearch
            defaultArea={selectedServiceAreaLabel}
            defaultServiceArea={requestedServiceArea || ""}
            marketSlug={market.slug}
          />
          <div className="interactive-map-container seller-profile-map-frame">
            <BuyerMap
              buyers={results}
              market={market}
              selectedServiceArea={selectedMapServiceArea}
            />
          </div>
        </div>

        <div className="seller-profile-results-column">
          <div className="seller-profile-results-header">
            <div>
              <h2>{locationLabel} Buyers for your property</h2>
              <p>{results.length} active buyer {results.length === 1 ? "profile matches" : "profiles match"} your filters.</p>
            </div>
            <div className="header-controls">
              <SortSelect value={sort} />
              <details className="seller-inline-filters">
                <summary>All Filters</summary>
                <SearchFiltersSidebar
                  defaultArea={selectedServiceAreaLabel}
                  defaultServiceArea={requestedServiceArea || ""}
                  defaultBudgetMin={params.budgetMin || ""}
                  defaultBudgetMax={params.budgetMax || ""}
                  defaultBadges={badges}
                  defaultSort={sort}
                  defaultBedrooms={params.bedrooms || ""}
                  defaultBathrooms={params.bathrooms || ""}
                  defaultSquareFeet={params.squareFeet || ""}
                  defaultCondition={params.condition || ""}
                  defaultPropertySubtype={params.propertySubtype || ""}
                  defaultAmenities={amenities}
                  marketSlug={market.slug}
                />
              </details>
            </div>
          </div>

          {activeFilters.length > 0 ? (
            <div className="active-filter-row" aria-label="Active filters">
              {activeFilters.map((filter) => (
                <Link className="filter-chip" href={filter.href} key={filter.label}>
                  {filter.label}
                  <span aria-hidden="true">&times;</span>
                </Link>
              ))}
            </div>
          ) : null}

          <div className="buyer-cards-list seller-profile-buyer-list">
            {results.length === 0 ? (
              <div style={{ padding: 24 }}>
                <EmptyState
                  icon="search"
                  title="No buyers match these filters"
                  description="Try another supported area, raising the budget ceiling, or removing badge filters."
                />
              </div>
            ) : (
              results.map((buyer) => (
                <BuyerCard buyer={buyer} key={buyer.buyerProfileId} variant="row" />
              ))
            )}
          </div>
        </div>
      </section>
    </div>
  );
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

function serviceAreaParam(value?: string) {
  if (!value) return undefined;
  return /^[a-z0-9-]+$/.test(value) ? value : undefined;
}

function buildActiveFilters(
  params: SellerSearchParams,
  badges: string[],
  amenities: string[],
  selectedServiceAreaLabel: string,
) {
  const filters: Array<{ href: string; label: string }> = [];

  if (params.serviceArea && selectedServiceAreaLabel) {
    filters.push({
      href: sellerSearchHrefWithout(params, ["serviceArea"]),
      label: `Location: ${selectedServiceAreaLabel}`,
    });
  }

  if (params.budgetMin || params.budgetMax) {
    filters.push({
      href: sellerSearchHrefWithout(params, ["budgetMin", "budgetMax"]),
      label: `Budget: ${moneyLabel(params.budgetMin) || "Any"} to ${moneyLabel(params.budgetMax) || "Any"}`,
    });
  }

  if (params.bedrooms) {
    filters.push({ href: sellerSearchHrefWithout(params, ["bedrooms"]), label: `${params.bedrooms}+ beds` });
  }

  if (params.bathrooms) {
    filters.push({ href: sellerSearchHrefWithout(params, ["bathrooms"]), label: `${params.bathrooms}+ baths` });
  }

  if (params.squareFeet) {
    filters.push({
      href: sellerSearchHrefWithout(params, ["squareFeet"]),
      label: `${Number(params.squareFeet).toLocaleString()}+ sqft`,
    });
  }

  if (params.condition) {
    filters.push({ href: sellerSearchHrefWithout(params, ["condition"]), label: params.condition });
  }

  if (params.propertySubtype) {
    filters.push({
      href: sellerSearchHrefWithout(params, ["propertySubtype"]),
      label: `Type: ${propertySubtypeLabel(params.propertySubtype)}`,
    });
  }

  if (amenities.length > 0) {
    filters.push({
      href: sellerSearchHrefWithout(params, ["amenities"]),
      label: `Amenities: ${amenities.join(", ")}`,
    });
  }

  if (badges.length > 0) {
    filters.push({
      href: sellerSearchHrefWithout(params, ["badges"]),
      label: `Trust: ${badges.map(badgeFilterLabel).join(", ")}`,
    });
  }

  return filters;
}

function sellerSearchHrefWithout(params: SellerSearchParams, remove: string[]) {
  const nextParams = new URLSearchParams();
  for (const key of sellerSearchParamKeys) {
    const value = params[key];
    if (remove.includes(key) || value === undefined || value === "") continue;
    if (Array.isArray(value)) {
      value.forEach((item) => nextParams.append(key, item));
    } else {
      nextParams.set(key, value);
    }
  }
  const query = nextParams.toString();
  return query ? `/seller/search?${query}` : "/seller/search";
}

const sellerSearchParamKeys = [
  "amenities",
  "badges",
  "bathrooms",
  "bedrooms",
  "budgetMax",
  "budgetMin",
  "condition",
  "market",
  "propertySubtype",
  "serviceArea",
  "sort",
  "squareFeet",
  "view",
] as const satisfies readonly (keyof SellerSearchParams)[];

function moneyLabel(value?: string) {
  const amount = Number(value);
  if (!Number.isFinite(amount) || amount <= 0) return "";
  if (amount >= 1_000_000) return `$${(amount / 1_000_000).toFixed(1).replace(".0", "")}M`;
  return `$${Math.round(amount / 1000)}k`;
}

function badgeFilterLabel(value: string) {
  const labels: Record<string, string> = {
    CASH_BUYER: "Cash buyer",
    NON_CONTINGENT: "Non-contingent",
    PRE_APPROVED: "Pre-approved",
    VERIFIED_FUNDS: "Verified funds",
  };
  return labels[value] ?? value;
}
