import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { cache, type ReactNode } from "react";
import { searchBuyersSchema, type SearchBuyersInput } from "@liber/validators";
import { BuyerCard } from "../components/buyer-card";
import { BuyerMap } from "../components/buyer-map";
import { Icon } from "../components/icon";
import { PublicBuyerPreviewCard } from "../components/public-buyer-preview-card";
import { PublicDemandMap } from "../components/public-demand-map";
import { SearchFilterBar } from "../components/search-filter-bar";
import { SearchViewToggle } from "../components/search-view-toggle";
import { SellerMapLocationSearch } from "../components/seller-map-location-search";
import { SiteFooter } from "../components/site-footer";
import { SortSelect } from "../components/sort-select";
import type { PublicBuyerPreviewDTO, SellerBuyerSummaryDTO } from "../lib/buyer-dtos";
import { demandSearchHref, type DemandSearchParams } from "../lib/demand-search-href";
import { selectedMapArea } from "../lib/map-area";
import { DEFAULT_MARKET_SLUG, serviceAreaDisplayLabel } from "../lib/service-areas";
import { canViewBuyerDirectory } from "../server/access";
import { DEMO_BUYER_LABEL, searchDemandPreviews } from "../server/buyer-preview";
import { getCurrentSellerAccess, searchBuyers } from "../server/contracts";
import { SellerSearchCursorError } from "../server/seller-search-query";
import { getActiveMarketBySlug, getActiveServiceAreaBySlug, resolveActiveServiceArea } from "../server/service-areas";
import { getSessionUser } from "../server/session";

// Shared by generateMetadata and the page within one request.
const activeMarket = cache((slug: string) => getActiveMarketBySlug(slug));
const activeServiceArea = cache((slug: string, marketSlug: string) => getActiveServiceAreaBySlug(slug, marketSlug));

/** The root page shares the layout's segment, so its title is absolute rather than templated. */
export async function generateMetadata({ searchParams }: { searchParams: Promise<DemandSearchParams> }): Promise<Metadata> {
  const params = await searchParams;
  try {
    const market = await activeMarket(slugParam(params.market) ?? DEFAULT_MARKET_SLUG);
    const serviceAreaSlug = slugParam(params.serviceArea);
    const area = serviceAreaSlug ? await activeServiceArea(serviceAreaSlug, market.slug) : null;
    return { title: { absolute: `${area ? serviceAreaDisplayLabel(area) : market.label} buyer demand · Liber` } };
  } catch {
    // The page renders its own error state; the title stays generic.
    return { title: { absolute: "Buyer demand map · Liber" } };
  }
}

/**
 * The one buyer-demand map. Everyone gets the same map, filters, sort and list:
 * approved sellers (and admins) see full buyer cards that open profiles and invites;
 * everyone else sees the privacy-safe preview of the same filtered search.
 */
export default async function HomePage({ searchParams }: { searchParams: Promise<DemandSearchParams> }) {
  const params = await searchParams;
  const user = await getSessionUser();
  const roles = user?.roles ?? [];
  const isSeller = roles.includes("SELLER");
  const isBuyer = roles.includes("BUYER");
  const canSearch = user ? await canViewBuyerDirectory(user) : false;
  const market = await activeMarket(slugParam(params.market) ?? DEFAULT_MARKET_SLUG);

  // Older homepage links carried a free-text ?area=; settle them on one canonical serviceArea slug.
  if (params.area && !params.serviceArea) {
    const area = await resolveLegacyArea(params.area, market.slug);
    redirect(demandSearchHref({ ...params, area: undefined, market: market.slug, serviceArea: area?.slug }, ["cursor"]));
  }

  const requestedServiceArea = slugParam(params.serviceArea);
  const selectedServiceArea = requestedServiceArea ? await activeServiceArea(requestedServiceArea, market.slug) : null;
  const selectedArea = selectedMapArea(selectedServiceArea);
  const selectedAreaLabel = selectedServiceArea ? serviceAreaDisplayLabel(selectedServiceArea) : "";
  const amenities = listParam(params.amenities);
  const badges = listParam(params.badges);
  const parsed = searchBuyersSchema.safeParse({
    amenities,
    badges,
    bathrooms: params.bathrooms || undefined,
    bedrooms: params.bedrooms || undefined,
    budgetMax: params.budgetMax || undefined,
    budgetMin: params.budgetMin || undefined,
    condition: params.condition || undefined,
    cursor: params.cursor || undefined,
    market: market.slug,
    propertySubtype: params.propertySubtype || undefined,
    serviceArea: selectedServiceArea?.slug,
    sort: params.sort || undefined,
    squareFeet: params.squareFeet || undefined,
  });
  if (!parsed.success) redirect(demandSearchHref({ market: market.slug, serviceArea: selectedServiceArea?.slug }));
  const input: SearchBuyersInput = parsed.data;

  const sellerAccessStatus = isSeller && !canSearch ? (await getCurrentSellerAccess()).data.status : null;
  let buyers: SellerBuyerSummaryDTO[] = [];
  let previews: PublicBuyerPreviewDTO[] = [];
  let nextCursor: string | null = null;
  let hasMore = false;
  try {
    if (canSearch) {
      const { data } = await searchBuyers(input);
      buyers = data.items;
      nextCursor = data.pageInfo.nextCursor;
      hasMore = Boolean(nextCursor);
    } else {
      const page = await searchDemandPreviews(input, user?.id);
      previews = page.items;
      nextCursor = page.nextCursor;
      hasMore = page.hasMore;
    }
  } catch (error) {
    if (params.cursor && error instanceof SellerSearchCursorError) redirect(demandSearchHref(params, ["cursor"]));
    throw error;
  }
  const resultCount = canSearch ? buyers.length : previews.length;
  // Mention demo profiles only when a card on this page carries the "Demo buyer" label.
  const showsDemoProfiles = canSearch
    ? buyers.some((buyer) => buyer.isDemo)
    : previews.some((preview) => preview.badges.includes(DEMO_BUYER_LABEL));
  const hasFilters = Boolean(
    params.budgetMin || params.budgetMax || params.bedrooms || params.bathrooms || params.squareFeet
      || params.condition || params.propertySubtype || amenities.length || badges.length,
  );
  const homePath = demandSearchHref({ market: market.slug, serviceArea: selectedServiceArea?.slug });
  const signupSellerHref = `/signup?role=seller&next=${encodeURIComponent(homePath)}`;
  const loginHref = `/login?next=${encodeURIComponent(demandSearchHref(params, ["cursor"]))}`;
  const previewCta = previewMapCta({ isBuyer, isSeller, signedIn: Boolean(user), signupSellerHref });

  return (
    <div className="search-page home-search-page">
      <SearchFilterBar
        // Remount only when the location changes: the area search reads its text once. Filter drafts
        // follow the URL inside the bar, so applying filters keeps keyboard focus on the control used.
        key={`${market.slug}:${selectedServiceArea?.slug ?? ""}`}
        actions={toolbarAction({ canSearch, isBuyer, isSeller, signedIn: Boolean(user), signupSellerHref })}
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
            defaultArea={selectedAreaLabel}
            marketSlug={market.slug}
          />
        )}
      />

      {isSeller && !canSearch ? <SellerAccessNotice status={sellerAccessStatus} /> : null}

      <div className="search-layout">
        <section aria-label="Buyer demand map" className="search-map">
          {canSearch ? (
            <BuyerMap
              buyers={buyers}
              clearAreaHref={selectedServiceArea ? demandSearchHref(params, ["serviceArea", "cursor"]) : undefined}
              market={market}
              selectedServiceArea={selectedArea}
            />
          ) : (
            <PublicDemandMap
              market={market}
              previews={previews}
              primaryCtaHref={previewCta.href}
              primaryCtaLabel={previewCta.label}
              secondaryCtaHref={user ? undefined : loginHref}
              secondaryCtaLabel={user ? undefined : "Sign in to see more"}
              selectedArea={selectedArea}
              selectedAreaLabel={selectedAreaLabel}
              token={(process.env.NEXT_PUBLIC_MAPBOX_TOKEN || "").trim()}
            />
          )}
        </section>

        <section aria-labelledby="demand-results-title" className="search-results" id="demand-results">
          <span aria-hidden="true" className="search-results-handle" />
          <header className="search-results-head">
            <div>
              <h1 id="demand-results-title">{selectedAreaLabel || market.label} buyer demand</h1>
              {/* Announced after every filter, sort, or area change. */}
              <p role="status">
                <strong>{resultCount}{hasMore && user ? "+" : ""} {resultCount === 1 ? "buyer" : "buyers"}</strong>
                {hasFilters ? <span> matched to your filters</span> : null}
                {showsDemoProfiles ? <span> · Includes clearly labeled demo profiles</span> : null}
              </p>
            </div>
            <SortSelect value={input.sort} />
          </header>

          {resultCount === 0 ? (
            <div className="search-empty">
              <span className="search-empty-icon" aria-hidden="true"><Icon name="search" size={26} /></span>
              <h2>{hasFilters ? "No buyers match these filters" : "No buyer demand here yet"}</h2>
              <p>Try another supported area, widening the budget range, or removing filters.</p>
              {hasFilters || selectedServiceArea ? (
                <Link className="button secondary" href={demandSearchHref({ market: market.slug })}>Reset search</Link>
              ) : null}
            </div>
          ) : (
            <div className="listing-grid buyer-list">
              {canSearch
                ? buyers.map((buyer) => <BuyerCard buyer={buyer} key={buyer.id} />)
                : previews.map((preview, index) => <PublicBuyerPreviewCard index={index} key={`${preview.alias}-${index}`} preview={preview} />)}
              {user ? null : <GuestTeaser hasMore={hasMore} loginHref={loginHref} signupSellerHref={signupSellerHref} />}
            </div>
          )}

          {user && (nextCursor || params.cursor) ? (
            <nav aria-label="Buyer result pages" className="search-pagination">
              {params.cursor ? (
                <Link className="pagination-button" href={demandSearchHref(params, ["cursor"])}>
                  <Icon name="chevron-left" size={16} />
                  First page
                </Link>
              ) : <span />}
              {nextCursor ? (
                <Link className="pagination-button primary" href={demandSearchHref({ ...params, cursor: nextCursor })}>
                  Next buyers
                  <Icon name="chevron-right" size={16} />
                </Link>
              ) : null}
            </nav>
          ) : null}

          <SiteFooter variant="compact" />
        </section>
      </div>
      <SearchViewToggle resultsId="demand-results" />
    </div>
  );
}

function toolbarAction({ canSearch, isBuyer, isSeller, signedIn, signupSellerHref }: {
  canSearch: boolean;
  isBuyer: boolean;
  isSeller: boolean;
  signedIn: boolean;
  signupSellerHref: string;
}): ReactNode {
  if (canSearch && isSeller) {
    return (
      <Link className="button primary" href="/seller/properties/new">
        <Icon name="plus" size={16} />
        Add property
      </Link>
    );
  }
  // Every action carries an icon: on phones the toolbar collapses actions to icon buttons.
  if (isSeller) return <Link className="button secondary" href="/seller/properties"><Icon name="home" size={16} />Your properties</Link>;
  if (isBuyer) return <Link className="button secondary" href="/buyer/profile"><Icon name="user" size={16} />Your buyer profile</Link>;
  if (!signedIn) return <Link className="button primary" href={signupSellerHref}><Icon name="key" size={16} />Get seller access</Link>;
  return null;
}

/** Popup action on preview pins: nobody but an approved seller can open a profile or invite. */
function previewMapCta({ isBuyer, isSeller, signedIn, signupSellerHref }: {
  isBuyer: boolean;
  isSeller: boolean;
  signedIn: boolean;
  signupSellerHref: string;
}) {
  if (isSeller) return { href: "/seller/properties", label: "Check seller access" };
  if (isBuyer) return { href: "/buyer/profile", label: "Your buyer profile" };
  if (signedIn) return { href: "/profile", label: "Your profile" };
  return { href: signupSellerHref, label: "Get seller access" };
}

function SellerAccessNotice({ status }: { status: string | null }) {
  const state = status === "SUSPENDED"
    ? { body: "Contact Liber support if you believe this restriction was applied in error.", label: "Seller access suspended", tone: "danger" }
    : status === "REJECTED"
      ? { body: "Full profiles and invites are locked. You can still browse anonymized demand.", label: "Not approved", tone: "warning" }
      : status
        ? { body: "Full profiles and invites unlock after review.", label: "Awaiting review", tone: "" }
        : { body: "Review has not started. You can still browse anonymized demand.", label: "Review not started", tone: "" };
  return (
    <div className="search-notice">
      <div className={`inline-alert ${state.tone}`} role="status">
        <Icon name={state.tone ? "lock" : "info"} size={20} />
        <p><strong>{state.label}.</strong> {state.body}</p>
        <Link className="text-link" href="/seller/properties">Manage properties</Link>
      </div>
    </div>
  );
}

function GuestTeaser({ hasMore, loginHref, signupSellerHref }: { hasMore: boolean; loginHref: string; signupSellerHref: string }) {
  return (
    <article className="promo-card">
      <h2>{hasMore ? "See every buyer" : "Know who’s buying"}</h2>
      <p>Guests preview four buyers. Sign in to see the full demand map and filter every buyer.</p>
      <Link className="button primary" href={loginHref}>Sign in</Link>
      <p className="promo-card-links">
        New to Liber? <Link href={signupSellerHref}>Join as a seller</Link> or{" "}
        <Link href="/signup?role=buyer&next=%2Fbuyer%2Fprofile">create a buyer profile</Link>.
      </p>
    </article>
  );
}

async function resolveLegacyArea(value: string, marketSlug: string) {
  const bySlug = slugParam(value) ? await getActiveServiceAreaBySlug(value, marketSlug) : null;
  if (bySlug) return bySlug;
  const resolution = await resolveActiveServiceArea(value, marketSlug);
  return resolution.status === "resolved" ? resolution.area : null;
}

function slugParam(value?: string) {
  return value && /^[a-z0-9-]+$/.test(value) ? value : undefined;
}

function listParam(value?: string | string[]) {
  return Array.isArray(value) ? value : value ? [value] : [];
}
