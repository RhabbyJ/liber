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
import { mapboxStaticImageUrl } from "../../../lib/mapbox";
import { canViewBuyerDirectory } from "../../../server/access";
import { getCurrentSellerAccess, searchBuyers } from "../../../server/contracts";
import { getSessionUser } from "../../../server/session";


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
    view?: string;
  }>;
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

  const staticMapUrl = mapboxStaticImageUrl(results);
  const view = params.view === "map" ? "map" : "list";

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
          defaultBudgetMax={params.budgetMax || ""}
          defaultPropertySubtype={params.propertySubtype || ""}
          defaultBadges={badges}
          defaultSort={sort}
        />

        <div className="search-results-area">
          {/* Top Yellow Notice Banner */}
          <div className="private-invite-alert">
            <span className="alert-icon">🔒</span>
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

              {/* Bottom Banner */}
              <div className="bottom-search-banner">
                <div className="banner-info">
                  <h3>New buyers are added daily.</h3>
                  <p>Save this search to get notified when new matching buyers register on Liber.</p>
                  <button className="button outline-white save-search-btn" type="button">
                    <Icon name="bell" size={14} /> Save search
                  </button>
                </div>
                {staticMapUrl ? (
                  <div className="mini-map-preview">
                    <img src={staticMapUrl} alt="Matching buyers map preview" />
                    <span className="map-badge">Seller safe view</span>
                  </div>
                ) : (
                  <div className="mini-map-preview fallback">
                    <span>Map preview unavailable</span>
                  </div>
                )}
              </div>
            </>
          ) : (
            /* Map View */
            <div className="interactive-map-container">
              <BuyerMap
                buyers={results}
                centerLat={centerLat}
                centerLng={centerLng}
                radiusMiles={radiusMiles}
              />
            </div>
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
