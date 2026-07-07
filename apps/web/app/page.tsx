import Link from "next/link";
import { Icon } from "../components/icon";
import { PublicDemandMap } from "../components/public-demand-map";
import { getPublicBuyerPreviews, type PublicBuyerPreview } from "../server/buyer-preview";

// Refresh the privacy-safe buyer-demand teaser periodically without making the page fully dynamic.
export const revalidate = 300;

export default async function HomePage() {
  const buyerPreviews = await getPublicBuyerPreviews();
  const mapboxToken = (process.env.NEXT_PUBLIC_MAPBOX_TOKEN || "").trim();
  const sellerSearchHref = "/signup?role=seller&next=/seller/search";
  const buyerProfileHref = "/signup?role=buyer&next=/buyer/profile";
  const activePreviewLabel = `${buyerPreviews.length} active preview${buyerPreviews.length === 1 ? "" : "s"}`;

  return (
    <div className="map-landing">
      <section className="map-search-rail" aria-label="Buyer demand preview controls">
        <Link className="map-search-box" href={sellerSearchHref}>
          <span>Los Angeles CA 90027</span>
          <Icon name="search" size={17} />
        </Link>
        <div className="map-filter-set" aria-label="Seller search filters">
          <Link className="map-filter-chip active" href={sellerSearchHref}>
            Buyer demand
            <Icon name="chevron-right" size={13} />
          </Link>
          <Link className="map-filter-chip" href={sellerSearchHref}>
            Budget
          </Link>
          <Link className="map-filter-chip" href={sellerSearchHref}>
            Beds & baths
          </Link>
          <Link className="map-filter-chip" href={sellerSearchHref}>
            Property fit
          </Link>
          <Link className="map-filter-chip" href={sellerSearchHref}>
            Trust badges
          </Link>
          <Link className="map-filter-chip" href={sellerSearchHref}>
            <Icon name="settings" size={14} />
            Filters
          </Link>
        </div>
        <Link className="map-save-search" href={sellerSearchHref}>
          Save search
        </Link>
      </section>

      <section className="map-landing-body" aria-label="Buyer demand preview">
        <PublicDemandMap previews={buyerPreviews} token={mapboxToken} />

        <aside className="demand-panel">
          <header className="demand-panel-head">
            <div>
              <h1>Los Angeles Buyer Demand</h1>
              <p>{activePreviewLabel}</p>
            </div>
            <Link className="demand-sort-link" href={sellerSearchHref}>
              Sort: Best match
              <Icon name="chevron-right" size={13} />
            </Link>
          </header>

          <div className="demand-card-grid">
            {buyerPreviews.map((preview, index) => (
              <BuyerPreviewCard key={index} preview={preview} />
            ))}

            <article className="demand-card signup-wall">
              <span className="demand-lock" aria-hidden="true">
                <Icon name="lock" size={18} />
              </span>
              <h3>See every matching buyer</h3>
              <Link className="button primary" href={sellerSearchHref}>
                Sign up to search
                <Icon name="arrow-right" size={14} />
              </Link>
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
