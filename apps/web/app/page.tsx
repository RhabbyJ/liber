import Link from "next/link";
import { Icon } from "../components/icon";
import { DemandPrivacyLegend } from "../components/demand-atlas";
import { QuietStateVisual } from "../components/quiet-state-visual";
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
    getPublicBuyerPreviews(market.slug, selectedServiceArea, user?.id),
    hasControlledDemoBuyerPreviews(),
  ]);
  const isAdmin = user?.roles.includes("ADMIN") ?? false;
  const isBuyer = user?.roles.includes("BUYER") ?? false;
  const isSeller = user?.roles.includes("SELLER") ?? false;
  const mapboxToken = (process.env.NEXT_PUBLIC_MAPBOX_TOKEN || "").trim();
  const sellerSearchPath = selectedServiceArea
    ? `/seller/search?market=${encodeURIComponent(market.slug)}&serviceArea=${encodeURIComponent(selectedServiceArea.slug)}`
    : `/seller/search?market=${encodeURIComponent(market.slug)}`;
  const homepagePath = selectedServiceArea
    ? `/?market=${encodeURIComponent(market.slug)}&area=${encodeURIComponent(selectedServiceArea.slug)}`
    : `/?market=${encodeURIComponent(market.slug)}`;
  const sellerSearchHref = user
    ? sellerSearchPath
    : `/signup?role=seller&next=${encodeURIComponent(sellerSearchPath)}`;
  const homepageLoginHref = `/login?next=${encodeURIComponent(homepagePath)}`;
  const buyerProfilePath = `/buyer/profile?market=${encodeURIComponent(market.slug)}`;
  const buyerProfileHref = user ? buyerProfilePath : `/signup?role=buyer&next=${encodeURIComponent(buyerProfilePath)}`;
  const mapPrimaryHref = isAdmin ? "/admin" : isSeller ? sellerSearchPath : isBuyer ? buyerProfilePath : sellerSearchHref;
  const mapPrimaryLabel = isAdmin ? "Admin workspace" : isSeller ? "Seller workspace" : isBuyer ? "Manage buyer profile" : "Get seller access";
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
          secondaryCtaHref={user ? undefined : homepageLoginHref}
          secondaryCtaLabel={user ? undefined : "Sign in to see more"}
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
                <span className="demand-data-note">Includes clearly labeled demo profiles.</span>
              ) : null}
            </div>
          </header>

          <div className="demand-card-grid">
            {buyerPreviews.length > 0 ? (
              buyerPreviews.map((preview, index) => (
                <PublicBuyerPreviewCard index={index} key={index} preview={preview} />
              ))
            ) : selectedArea ? (
              <article className="demand-card demand-empty-card">
                <QuietStateVisual compact name="search" />
                <h3>No preview cards here yet</h3>
                <p>No privacy-safe buyer previews match this selected area.</p>
              </article>
            ) : null}

            <HomepageNextStep
              buyerProfileHref={buyerProfileHref}
              homepageLoginHref={homepageLoginHref}
              isAdmin={isAdmin}
              isBuyer={isBuyer}
              isSeller={isSeller}
              isSignedIn={Boolean(user)}
              sellerSearchHref={sellerSearchHref}
            />
          </div>

          <p className="demand-privacy">
            <DemandPrivacyLegend />
            <span>Anonymized preview - exact locations stay private</span>
          </p>
        </aside>
      </section>
    </div>
  );
}

function HomepageNextStep({
  buyerProfileHref,
  homepageLoginHref,
  isAdmin,
  isBuyer,
  isSeller,
  isSignedIn,
  sellerSearchHref,
}: {
  buyerProfileHref: string;
  homepageLoginHref: string;
  isAdmin: boolean;
  isBuyer: boolean;
  isSeller: boolean;
  isSignedIn: boolean;
  sellerSearchHref: string;
}) {
  if (isAdmin) {
    return (
      <article className="demand-card signup-wall">
        <span className="demand-lock" aria-hidden="true"><Icon name="shield" size={18} /></span>
        <h3>Continue in your admin workspace</h3>
        <p>Review marketplace access, evidence, and activity.</p>
        <Link className="button primary" href="/admin">
          Open admin workspace
          <Icon name="arrow-right" size={14} />
        </Link>
      </article>
    );
  }

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

  if (isSignedIn) return null;

  return (
    <article className="demand-card signup-wall">
      <span className="demand-lock" aria-hidden="true"><Icon name="lock" size={18} /></span>
      <h3>Sign in to see more buyers</h3>
      <p>Preview up to four buyers now, then sign in to see the rest of the privacy-safe demand map.</p>
      <Link className="button primary" href={homepageLoginHref}>
        Sign in to see more
        <Icon name="arrow-right" size={14} />
      </Link>
      <Link className="demand-buyer-link" href={sellerSearchHref}>Create a seller account</Link>
      <Link className="demand-buyer-link" href={buyerProfileHref}>Create a buyer profile</Link>
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
