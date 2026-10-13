import Link from "next/link";
import { redirect } from "next/navigation";
import { BuyerCard } from "../../../components/buyer-card";
import { BuyerMap } from "../../../components/buyer-map";
import { Icon } from "../../../components/icon";
import { PageTitle } from "../../../components/page-title";
import { PublicBuyerPreviewCard } from "../../../components/public-buyer-preview-card";
import { SearchFilterBar } from "../../../components/search-filter-bar";
import { SellerMapLocationSearch } from "../../../components/seller-map-location-search";
import { SearchViewToggle } from "../../../components/search-view-toggle";
import { SiteFooter } from "../../../components/site-footer";
import { SortSelect } from "../../../components/sort-select";
import { selectedMapArea } from "../../../lib/map-area";
import { DEFAULT_MARKET_SLUG, serviceAreaDisplayLabel } from "../../../lib/service-areas";
import { canViewBuyerDirectory } from "../../../server/access";
import { getPublicBuyerPreviews } from "../../../server/buyer-preview";
import { getCurrentSellerAccess, searchBuyers } from "../../../server/contracts";
import { getActiveMarketBySlug, getActiveServiceAreaBySlug } from "../../../server/service-areas";
import { SellerSearchCursorError } from "../../../server/seller-search-query";
import { getSessionUser } from "../../../server/session";

type SellerSearchParams = {
  amenities?: string | string[];
  badges?: string | string[];
  bathrooms?: string;
  bedrooms?: string;
  budgetMin?: string;
  budgetMax?: string;
  condition?: string;
  cursor?: string;
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
  const marketSlug = serviceAreaParam(params.market) ?? DEFAULT_MARKET_SLUG;
  const market = await getActiveMarketBySlug(marketSlug);
  const requestedServiceArea = serviceAreaParam(params.serviceArea);
  const selectedServiceArea = requestedServiceArea
    ? await getActiveServiceAreaBySlug(requestedServiceArea, market.slug)
    : null;
  const selectedMapServiceArea = selectedMapArea(selectedServiceArea);
  const selectedServiceAreaLabel = selectedServiceArea ? serviceAreaDisplayLabel(selectedServiceArea) : "";
  const areaTitle = selectedServiceAreaLabel || market.label;

  if (!canSearch) {
    const accessState = sellerAccessState(sellerAccess.status);

    if (sellerAccess.status === "SUSPENDED") {
      return (
        <div className="page narrow stack loose">
          <PageTitle title="Directory access unavailable" />
          <div className="inline-alert danger" role="status">
            <Icon name="lock" size={20} />
            <p><strong>Suspended.</strong> Contact Liber support if you believe this restriction was applied in error.</p>
          </div>
        </div>
      );
    }

    const previews = await getPublicBuyerPreviews(market.slug, selectedServiceArea, user?.id);

    return (
      <div className="page wide seller-preview-page stack loose">
        <PageTitle
          title={selectedServiceAreaLabel ? `Buyer demand near ${selectedServiceAreaLabel}` : `${market.label} buyer demand`}
          actions={(
            <div className="seller-preview-location-search">
              <SellerMapLocationSearch
                defaultArea={selectedServiceAreaLabel}
                defaultServiceArea={requestedServiceArea || ""}
                marketSlug={market.slug}
              />
            </div>
          )}
        >
          {previews.length} anonymized {previews.length === 1 ? "buyer summary" : "buyer summaries"}
        </PageTitle>

        <div className={`inline-alert ${accessState.tone === "rejected" ? "warning" : "info"}`} role="status">
          <Icon name={accessState.tone === "rejected" ? "lock" : "info"} size={20} />
          <p><strong>{accessState.label}.</strong> {accessState.description}</p>
          <Link className="text-link" href="/seller/properties">Manage properties</Link>
        </div>

        {previews.length > 0 ? (
          <div className="listing-grid wide">
            {previews.map((preview, index) => (
              <PublicBuyerPreviewCard index={index} key={`${preview.area}-${index}`} preview={preview} />
            ))}
          </div>
        ) : (
          <div className="search-empty">
            <span className="search-empty-icon" aria-hidden="true"><Icon name="people" size={26} /></span>
            <h2>No buyer demand to show here yet</h2>
            <p>Try another supported city, neighborhood, or ZIP.</p>
          </div>
        )}
      </div>
    );
  }

  const badges = Array.isArray(params.badges) ? params.badges : params.badges ? [params.badges] : [];
  const amenities = Array.isArray(params.amenities) ? params.amenities : params.amenities ? [params.amenities] : [];
  const sort = sellerSortParam(params.sort);
  let resultPage: Awaited<ReturnType<typeof searchBuyers>>["data"];
  try {
    ({ data: resultPage } = await searchBuyers({
      amenities,
      badges,
      bathrooms: params.bathrooms || undefined,
      bedrooms: params.bedrooms || undefined,
      budgetMin: params.budgetMin || undefined,
      budgetMax: params.budgetMax || undefined,
      condition: params.condition || undefined,
      cursor: params.cursor || undefined,
      market: market.slug,
      propertySubtype: params.propertySubtype || undefined,
      serviceArea: requestedServiceArea,
      sort,
      squareFeet: params.squareFeet || undefined,
    }));
  } catch (error) {
    if (params.cursor && error instanceof SellerSearchCursorError) {
      redirect(sellerSearchHrefWithout(params, ["cursor"]));
    }
    throw error;
  }
  const results = resultPage.items;
  const hasFilters = Boolean(
    params.budgetMin || params.budgetMax || params.bedrooms || params.bathrooms || params.squareFeet
      || params.condition || params.propertySubtype || amenities.length || badges.length,
  );
  const resultLabel = `${results.length}${resultPage.pageInfo.nextCursor ? "+" : ""} ${results.length === 1 ? "buyer" : "buyers"}`;

  return (
    <div className="search-page">
      <SearchFilterBar
        // Remount when the applied URL filters change so cleared or back-navigated filters reset the drafts.
        key={sellerSearchHrefWithout({ ...params, market: market.slug }, ["cursor", "view"])}
        actions={(
          <Link className="button primary" href="/seller/properties/new">
            <Icon name="plus" size={16} />
            Add property
          </Link>
        )}
        filters={{
          amenities,
          badges,
          bathrooms: params.bathrooms || "",
          bedrooms: params.bedrooms || "",
          budgetMax: params.budgetMax || "",
          budgetMin: params.budgetMin || "",
          condition: params.condition || "",
          propertySubtype: params.propertySubtype || "",
          squareFeet: params.squareFeet || "",
        }}
        location={(
          <SellerMapLocationSearch
            defaultArea={selectedServiceAreaLabel}
            defaultServiceArea={requestedServiceArea || ""}
            marketSlug={market.slug}
          />
        )}
      />

      <div className="search-layout">
        <section aria-label="Buyer demand map" className="search-map">
          <BuyerMap
            buyers={results}
            clearAreaHref={selectedServiceArea ? sellerSearchHrefWithout(params, ["serviceArea"]) : undefined}
            market={market}
            selectedServiceArea={selectedMapServiceArea}
          />
        </section>

        <section aria-labelledby="search-results-title" className="search-results" id="buyer-results">
          <span aria-hidden="true" className="search-results-handle" />
          <header className="search-results-head">
            <div>
              <h1 id="search-results-title">{areaTitle} buyer demand</h1>
              <p>
                <strong>{resultLabel}</strong>
                <span> matched to your filters</span>
              </p>
            </div>
            <SortSelect value={sort} />
          </header>

          {results.length === 0 ? (
            <div className="search-empty">
              <span className="search-empty-icon" aria-hidden="true"><Icon name="search" size={26} /></span>
              <h2>No buyers match these filters</h2>
              <p>Try another supported area, widening the budget range, or removing trust filters.</p>
              {hasFilters || selectedServiceArea ? (
                <Link className="button secondary" href={`/seller/search?market=${encodeURIComponent(market.slug)}`}>
                  Reset search
                </Link>
              ) : null}
            </div>
          ) : (
            <div className="listing-grid">
              {results.map((buyer, index) => (
                <BuyerCard buyer={buyer} key={buyer.id} priority={index < 2} />
              ))}
            </div>
          )}

          {resultPage.pageInfo.nextCursor || params.cursor ? (
            <nav aria-label="Buyer result pages" className="search-pagination">
              {params.cursor ? (
                <Link className="pagination-button" href={sellerSearchHrefWithout(params, ["cursor"])}>
                  <Icon name="chevron-left" size={16} />
                  First page
                </Link>
              ) : <span />}
              {resultPage.pageInfo.nextCursor ? (
                <Link className="pagination-button primary" href={sellerSearchHrefWithCursor(params, resultPage.pageInfo.nextCursor)}>
                  Next buyers
                  <Icon name="chevron-right" size={16} />
                </Link>
              ) : null}
            </nav>
          ) : null}

          <SiteFooter variant="compact" />
        </section>
      </div>
      <SearchViewToggle resultsId="buyer-results" />
    </div>
  );
}

function sellerAccessState(status?: string | null) {
  if (status === "REJECTED") {
    return {
      description: "Full profiles and invites are locked. You can still browse anonymized demand.",
      label: "Not approved",
      tone: "rejected",
    };
  }

  if (!status) {
    return {
      description: "Review has not started. You can still browse anonymized demand.",
      label: "Review not started",
      tone: "not-started",
    };
  }

  return {
    description: "Full profiles and invites unlock after review.",
    label: "Awaiting review",
    tone: "pending",
  };
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

function sellerSearchHrefWithout(params: SellerSearchParams, remove: string[]) {
  const nextParams = new URLSearchParams();
  for (const key of sellerSearchParamKeys) {
    const value = params[key];
    if (key === "cursor" || remove.includes(key) || value === undefined || value === "") continue;
    if (Array.isArray(value)) {
      value.forEach((item) => nextParams.append(key, item));
    } else {
      nextParams.set(key, value);
    }
  }
  const query = nextParams.toString();
  return query ? `/seller/search?${query}` : "/seller/search";
}

function sellerSearchHrefWithCursor(params: SellerSearchParams, cursor: string) {
  const nextParams = new URLSearchParams();
  for (const key of sellerSearchParamKeys) {
    const value = key === "cursor" ? cursor : params[key];
    if (value === undefined || value === "") continue;
    if (Array.isArray(value)) {
      value.forEach((item) => nextParams.append(key, item));
    } else {
      nextParams.set(key, value);
    }
  }
  return `/seller/search?${nextParams.toString()}`;
}

const sellerSearchParamKeys = [
  "amenities",
  "badges",
  "bathrooms",
  "bedrooms",
  "budgetMax",
  "budgetMin",
  "condition",
  "cursor",
  "market",
  "propertySubtype",
  "serviceArea",
  "sort",
  "squareFeet",
  "view",
] as const satisfies readonly (keyof SellerSearchParams)[];
