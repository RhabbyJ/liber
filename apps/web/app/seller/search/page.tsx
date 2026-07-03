import Link from "next/link";
import { BuyerCard } from "../../../components/buyer-card";
import { BuyerMap } from "../../../components/buyer-map";
import { EmptyState } from "../../../components/empty-state";
import { Icon } from "../../../components/icon";
import { ModeChip } from "../../../components/mode-chip";
import { PageTitle } from "../../../components/page-title";
import { SearchFiltersSidebar } from "../../../components/search-filters-sidebar";
import { SortSelect } from "../../../components/sort-select";
import { ViewToggle } from "../../../components/view-toggle";
import { canViewBuyerDirectory } from "../../../server/access";
import { getCurrentSellerAccess, searchBuyers } from "../../../server/contracts";
import { getSessionUser } from "../../../server/session";

type SellerSearchParams = {
  amenities?: string | string[];
  area?: string;
  badges?: string | string[];
  bathrooms?: string;
  bedrooms?: string;
  budgetMin?: string;
  budgetMax?: string;
  centerLat?: string;
  centerLng?: string;
  city?: string;
  condition?: string;
  radiusMiles?: string;
  sort?: string;
  squareFeet?: string;
  state?: string;
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
  const centerLat = numberParam(params.centerLat);
  const centerLng = numberParam(params.centerLng);
  const radiusMiles = numberParam(params.radiusMiles);
  const hasRadiusCoordinates = centerLat !== undefined && centerLng !== undefined;
  const searchCenterLat = hasRadiusCoordinates ? String(centerLat) : undefined;
  const searchCenterLng = hasRadiusCoordinates ? String(centerLng) : undefined;
  const searchRadiusMiles = hasRadiusCoordinates && radiusMiles !== undefined ? String(radiusMiles) : undefined;
  const sort = sellerSortParam(params.sort);
  const { data: results } = await searchBuyers({
    amenities,
    badges,
    bathrooms: params.bathrooms || undefined,
    bedrooms: params.bedrooms || undefined,
    budgetMin: params.budgetMin || undefined,
    budgetMax: params.budgetMax || undefined,
    centerLat: searchCenterLat,
    centerLng: searchCenterLng,
    city: params.city || undefined,
    condition: params.condition || undefined,
    radiusMiles: searchRadiusMiles,
    sort,
    squareFeet: params.squareFeet || undefined,
    state: params.state || undefined,
  });

  // Map-first workspace: approved sellers land on the map unless they opt into list view.
  const view = params.view === "list" ? "list" : "map";
  const activeFilters = buildActiveFilters(params, badges, amenities);

  return (
    <div className="page wide stack loose">
      <PageTitle
        eyebrow="Seller workspace"
        title="Search the buyer directory"
        tone="seller"
        badge={<ModeChip mode="seller" />}
        actions={
          <Link className="button primary" href="/seller/properties/new">
            <Icon name="plus" size={14} />
            Add private property
          </Link>
        }
      >
        {results.length} active buyer {results.length === 1 ? "profile matches" : "profiles match"} the current filters.
        Properties stay private until you invite a buyer.
      </PageTitle>

      <div className="search-grid-container">
        <SearchFiltersSidebar
          defaultArea={params.area || ""}
          defaultCity={params.city || ""}
          defaultState={params.state || "CA"}
          defaultLat={params.centerLat || ""}
          defaultLng={params.centerLng || ""}
          defaultRadiusMiles={params.radiusMiles || 8}
          defaultBudgetMin={params.budgetMin || ""}
          defaultBudgetMax={params.budgetMax || ""}
          defaultBadges={badges}
          defaultSort={sort}
          defaultBedrooms={params.bedrooms || ""}
          defaultBathrooms={params.bathrooms || ""}
          defaultSquareFeet={params.squareFeet || ""}
          defaultCondition={params.condition || ""}
          defaultAmenities={amenities}
        />

        <div className="search-results-area">
          {/* Top Yellow Notice Banner */}
          <div className="private-invite-alert">
            <span className="alert-icon">
              <Icon name="lock" size={18} />
            </span>
            <div className="alert-content">
              <strong>Private invite only.</strong> Buyers below are not publicly listed. Send a private invite to share details. Your property remains hidden until you invite them.
            </div>
          </div>

          {/* Results Count, Sort Dropdown & View Toggle */}
          <div className="search-results-header">
            <h2>{results.length} matched buyers</h2>
            <div className="header-controls">
              <SortSelect value={sort} />
              <ViewToggle currentView={view} />
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

          {view === "list" ? (
            <>
              {/* Buyer Cards List */}
              <div className="buyer-cards-list">
                {results.length === 0 ? (
                  <div style={{ padding: 24 }}>
                    <EmptyState
                      icon="search"
                      title="No buyers match these filters"
                      description="Try widening your radius, raising the budget ceiling, or removing badge filters."
                    />
                  </div>
                ) : (
                  results.map((buyer) => (
                    <BuyerCard buyer={buyer} key={buyer.id} variant="row" />
                  ))
                )}
              </div>
            </>
          ) : (
            /* Map-first view: map on top, matching buyer cards from the same result set below */
            <>
              <div className="interactive-map-container">
                <BuyerMap
                  buyers={results}
                  centerLat={centerLat}
                  centerLng={centerLng}
                  radiusMiles={hasRadiusCoordinates ? radiusMiles : undefined}
                />
              </div>
              <div className="buyer-cards-list">
                {results.length === 0 ? (
                  <div style={{ padding: 24 }}>
                    <EmptyState
                      icon="search"
                      title="No buyers match these filters"
                      description="Try widening your radius, raising the budget ceiling, or removing badge filters."
                    />
                  </div>
                ) : (
                  results.map((buyer) => (
                    <BuyerCard buyer={buyer} key={buyer.id} variant="row" />
                  ))
                )}
              </div>
            </>
          )}
        </div>
      </div>
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

function buildActiveFilters(params: SellerSearchParams, badges: string[], amenities: string[]) {
  const filters: Array<{ href: string; label: string }> = [];

  if (params.area || params.city || (params.centerLat && params.centerLng)) {
    filters.push({
      href: sellerSearchHrefWithout(params, ["area", "city", "state", "centerLat", "centerLng", "radiusMiles"]),
      label: `Location: ${params.area || params.city || "map area"}`,
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
  for (const [key, value] of Object.entries(params)) {
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
