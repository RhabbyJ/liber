import Link from "next/link";
import { Icon } from "../components/icon";
import { PublicMapLocationSearch } from "../components/public-map-location-search";
import { PublicBuyerPreviewCard } from "../components/public-buyer-preview-card";
import { PublicDemandMap } from "../components/public-demand-map";
import { DEFAULT_MARKET_SLUG, serviceAreaDisplayLabel } from "../lib/service-areas";
import { selectedMapArea } from "../lib/map-area";
import { getPublicBuyerPreviews, hasControlledDemoBuyerPreviews } from "../server/buyer-preview";
import { getActiveMarketBySlug, getActiveServiceAreaBySlug, resolveActiveServiceArea } from "../server/service-areas";
import { getSessionUser } from "../server/session";

type HomeSearchParams = {
  area?: string;
  market?: string;
};

export default async function HomePage({
  searchParams,
}: {
  searchParams: Promise<HomeSearchParams>;
}) {
  const params = await searchParams;
  const user = await getSessionUser();
  const marketSlug = serviceAreaParam(params.market) ?? DEFAULT_MARKET_SLUG;
  const market = await getActiveMarketBySlug(marketSlug);
  const selectedServiceArea = params.area ? await resolveHomeServiceArea(params.area, market.slug) : null;
  const selectedArea = selectedMapArea(selectedServiceArea);
  const selectedAreaLabel = selectedServiceArea ? serviceAreaDisplayLabel(selectedServiceArea) : "";
  const [buyerPreviews, hasDemoPreviews] = await Promise.all([
    getPublicBuyerPreviews(market.slug, selectedServiceArea),
    hasControlledDemoBuyerPreviews(),
  ]);
  const isBuyer = user?.roles.includes("BUYER") ?? false;
  const isSeller = user?.roles.includes("SELLER") ?? false;
  const mapboxToken = (process.env.NEXT_PUBLIC_MAPBOX_TOKEN || "").trim();
  const sellerSearchPath = selectedServiceArea
    ? `/seller/search?market=${encodeURIComponent(market.slug)}&serviceArea=${encodeURIComponent(selectedServiceArea.slug)}`
    : `/seller/search?market=${encodeURIComponent(market.slug)}`;
  const sellerSearchHref = user
    ? sellerSearchPath
    : `/signup?role=seller&next=${encodeURIComponent(sellerSearchPath)}`;
  const sellerLoginHref = `/login?next=${encodeURIComponent(sellerSearchPath)}`;
  const buyerProfilePath = `/buyer/profile?market=${encodeURIComponent(market.slug)}`;
  const buyerProfileHref = user ? buyerProfilePath : `/signup?role=buyer&next=${encodeURIComponent(buyerProfilePath)}`;
  const mapPrimaryHref = isSeller ? sellerSearchPath : isBuyer ? buyerProfilePath : sellerSearchHref;
  const mapPrimaryLabel = isSeller ? "Seller workspace" : isBuyer ? "My buyer profile" : "Get seller access";
  const activePreviewLabel = `${buyerPreviews.length} active preview${buyerPreviews.length === 1 ? "" : "s"}`;

  return (
    <div className="map-landing">
      <section className="map-search-rail" aria-label="Buyer demand preview controls">
        <div className="map-search-intro">
          <span>Buyer demand map</span>
          <strong>See where buyers are looking</strong>
        </div>
        <PublicMapLocationSearch defaultArea={selectedAreaLabel} marketSlug={market.slug} />
      </section>

      <section className="map-landing-body" aria-label="Buyer demand preview">
        <PublicDemandMap
          market={market}
          previews={buyerPreviews}
          primaryCtaHref={mapPrimaryHref}
          primaryCtaLabel={mapPrimaryLabel}
          secondaryCtaHref={user ? undefined : sellerLoginHref}
          secondaryCtaLabel={user ? undefined : "Log in"}
          selectedArea={selectedArea}
          selectedAreaLabel={selectedAreaLabel}
          token={mapboxToken}
        />

        <aside className="demand-panel">
          <header className="demand-panel-head">
            <div>
              <h1>{selectedAreaLabel ? `${selectedAreaLabel} Buyer Demand` : `${market.label} Buyer Demand`}</h1>
              <p>{selectedArea ? "Preview cards in this selected area" : activePreviewLabel}</p>
              {hasDemoPreviews && buyerPreviews.length > 0 ? (
                <span className="status-dot warning">Controlled demo data</span>
              ) : null}
            </div>
            <Link className="demand-sort-link" href={mapPrimaryHref}>
              {isSeller ? "Seller workspace" : isBuyer ? "My profile" : "Get access"}
              <Icon name="chevron-right" size={13} />
            </Link>
          </header>

          <div className="demand-card-grid">
            {buyerPreviews.length > 0 ? (
              buyerPreviews.map((preview, index) => (
                <PublicBuyerPreviewCard index={index} key={index} preview={preview} />
              ))
            ) : selectedArea ? (
              <article className="demand-card demand-empty-card">
                <h3>No preview cards here yet</h3>
                <p>Sign in as a verified seller to search the full buyer workspace.</p>
              </article>
            ) : null}

            <HomepageNextStep
              buyerProfileHref={buyerProfileHref}
              isBuyer={isBuyer}
              isSeller={isSeller}
              sellerLoginHref={sellerLoginHref}
              sellerSearchHref={sellerSearchHref}
            />
          </div>

          <p className="demand-privacy">Anonymized preview - exact locations stay private</p>
        </aside>
      </section>
    </div>
  );
}

function HomepageNextStep({
  buyerProfileHref,
  isBuyer,
  isSeller,
  sellerLoginHref,
  sellerSearchHref,
}: {
  buyerProfileHref: string;
  isBuyer: boolean;
  isSeller: boolean;
  sellerLoginHref: string;
  sellerSearchHref: string;
}) {
  if (isSeller) {
    return (
      <article className="demand-card signup-wall">
        <span className="demand-lock" aria-hidden="true"><Icon name="search" size={18} /></span>
        <h3>Continue in your seller workspace</h3>
        <p>Check your access and open buyer search when approved.</p>
        <Link className="button primary" href={sellerSearchHref}>
          Open seller workspace
          <Icon name="arrow-right" size={14} />
        </Link>
      </article>
    );
  }

  if (isBuyer) {
    return (
      <article className="demand-card signup-wall">
        <span className="demand-lock" aria-hidden="true"><Icon name="user" size={18} /></span>
        <h3>Your buyer profile puts you on the map</h3>
        <p>Keep your criteria current so matching sellers can find you.</p>
        <Link className="button primary" href={buyerProfileHref}>
          Manage buyer profile
          <Icon name="arrow-right" size={14} />
        </Link>
      </article>
    );
  }

  return (
    <article className="demand-card signup-wall">
      <span className="demand-lock" aria-hidden="true"><Icon name="lock" size={18} /></span>
      <h3>See matching buyers before you list</h3>
      <p>Create a seller account and request access to the buyer directory.</p>
      <Link className="button primary" href={sellerSearchHref}>
        Get seller access
        <Icon name="arrow-right" size={14} />
      </Link>
      <Link className="demand-buyer-link" href={buyerProfileHref}>Create a buyer profile</Link>
      <Link className="demand-buyer-link" href={sellerLoginHref}>Log in</Link>
    </article>
  );
}

async function resolveHomeServiceArea(value: string, marketSlug: string) {
  const bySlug = await getActiveServiceAreaBySlug(value, marketSlug);
  if (bySlug) return bySlug;

  const resolution = await resolveActiveServiceArea(value, marketSlug);
  return resolution.status === "resolved" ? resolution.area : null;
}

function serviceAreaParam(value?: string) {
  return value && /^[a-z0-9-]+$/.test(value) ? value : undefined;
}
