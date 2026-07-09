import Link from "next/link";
import { Icon } from "../components/icon";
import { PublicMapLocationSearch } from "../components/public-map-location-search";
import { PublicDemandMap } from "../components/public-demand-map";
import { DEFAULT_MARKET_SLUG, serviceAreaDisplayLabel } from "../lib/service-areas";
import { selectedMapArea } from "../lib/map-area";
import { getPublicBuyerPreviews, type PublicBuyerPreview } from "../server/buyer-preview";
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
  const buyerPreviews = await getPublicBuyerPreviews(market.slug, selectedServiceArea);
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
  const activePreviewLabel = `${buyerPreviews.length} active preview${buyerPreviews.length === 1 ? "" : "s"}`;

  return (
    <div className="map-landing">
      <section className="map-search-rail" aria-label="Buyer demand preview controls">
        <PublicMapLocationSearch defaultArea={selectedAreaLabel} marketSlug={market.slug} />
      </section>

      <section className="map-landing-body" aria-label="Buyer demand preview">
        <PublicDemandMap
          market={market}
          previews={buyerPreviews}
          primaryCtaHref={sellerSearchHref}
          primaryCtaLabel={user ? "View buyers" : "Sign up to view buyers"}
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
            </div>
            <Link className="demand-sort-link" href={sellerSearchHref}>
              {user ? "View: Best match" : "Sort: Best match"}
              <Icon name="chevron-right" size={13} />
            </Link>
          </header>

          <div className="demand-card-grid">
            {buyerPreviews.length > 0 ? (
              buyerPreviews.map((preview, index) => (
                <BuyerPreviewCard key={index} preview={preview} />
              ))
            ) : selectedArea ? (
              <article className="demand-card demand-empty-card">
                <h3>No preview cards here yet</h3>
                <p>Sign in as a verified seller to search the full buyer workspace.</p>
              </article>
            ) : null}

            <article className="demand-card signup-wall">
              <span className="demand-lock" aria-hidden="true">
                <Icon name="lock" size={18} />
              </span>
              <h3>See every matching buyer</h3>
              <Link className="button primary" href={sellerSearchHref}>
                {user ? "View buyer search" : "Sign up to search"}
                <Icon name="arrow-right" size={14} />
              </Link>
              {user ? null : (
                <Link className="demand-buyer-link" href={sellerLoginHref}>
                  Log in
                </Link>
              )}
              <Link className="demand-buyer-link" href={buyerProfileHref}>
                Add my buyer demand
              </Link>
            </article>
          </div>

          <p className="demand-privacy">Anonymized preview - exact locations stay private</p>
        </aside>
      </section>
    </div>
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

function BuyerPreviewCard({ preview }: { preview: PublicBuyerPreview }) {
  const meta = [
    preview.bedroomsMin ? `${preview.bedroomsMin}+ bd` : null,
    preview.bathroomsMin ? `${preview.bathroomsMin}+ ba` : null,
    preview.squareFeetMin ? `${preview.squareFeetMin.toLocaleString()}+ sqft` : null,
    preview.condition || null,
  ].filter((fact): fact is string => Boolean(fact));

  const chips = [...preview.badges.slice(0, 2), ...preview.amenities].slice(0, 4);

  return (
    <article className="demand-card demand-result-card">
      <div className="demand-card-media" aria-hidden="true">
        <span className="demand-card-media-badge">Approx area</span>
        <span className="demand-card-media-pin" />
        <span className="demand-card-media-dot dot-a" />
        <span className="demand-card-media-dot dot-b" />
        <span className="demand-card-media-dot dot-c" />
      </div>
      <div className="demand-card-body">
        <div className="demand-card-top">
          <span className="demand-card-budget">{preview.budgetLabel}</span>
          {preview.badges.length > 0 ? (
            <span className="demand-card-verified">
              <Icon name="check-shield" size={13} />
              Verified
            </span>
          ) : null}
        </div>
        {meta.length > 0 ? <p className="demand-card-meta">{meta.join(" | ")}</p> : null}
        <p className="demand-card-sub">
          {preview.label} in {preview.area}
        </p>
        {chips.length > 0 ? (
          <div className="demand-card-chips">
            {chips.map((chip) => (
              <span key={chip}>{chip}</span>
            ))}
          </div>
        ) : null}
      </div>
    </article>
  );
}
