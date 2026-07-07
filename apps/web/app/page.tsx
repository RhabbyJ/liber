import Link from "next/link";
import { Icon } from "../components/icon";
import { PublicDemandMap } from "../components/public-demand-map";
import { getPublicBuyerPreviews, type PublicBuyerPreview } from "../server/buyer-preview";

// Refresh the privacy-safe buyer-demand teaser periodically without making the page fully dynamic.
export const revalidate = 300;

export default async function HomePage() {
  const buyerPreviews = await getPublicBuyerPreviews();
  const mapboxToken = (process.env.NEXT_PUBLIC_MAPBOX_TOKEN || "").trim();

  return (
    <div className="map-landing">
      <section className="map-landing-bar">
        <h1>
          Meet <strong>the buyer</strong> before you list.
        </h1>
      </section>

      <section className="map-landing-body" aria-label="Buyer demand preview">
        <PublicDemandMap previews={buyerPreviews} token={mapboxToken} />

        <aside className="demand-panel">
          <header className="demand-panel-head">
            <h2>Buyer demand</h2>
            <span className="demand-count">
              {buyerPreviews.length} active
            </span>
          </header>

          {buyerPreviews.map((preview, index) => (
            <BuyerPreviewCard key={index} preview={preview} />
          ))}

          <article className="demand-card signup-wall">
            <span className="demand-lock" aria-hidden="true">
              <Icon name="lock" size={18} />
            </span>
            <h3>See every matching buyer</h3>
            <Link className="button primary" href="/signup?role=seller&next=/seller/search">
              Sign up to search
              <Icon name="arrow-right" size={14} />
            </Link>
            <Link className="demand-buyer-link" href="/signup?role=buyer&next=/buyer/profile">
              Add my buyer demand
            </Link>
          </article>

          <p className="demand-privacy">Anonymized preview · exact locations stay private</p>
        </aside>
      </section>

      <section className="map-landing-footnote">
        <span>
          <Icon name="check-shield" size={13} /> Admin-reviewed badges
        </span>
        <span>
          <Icon name="lock" size={13} /> Private invites only
        </span>
        <span>
          <Icon name="map-pin" size={13} /> San Fernando Valley pilot
        </span>
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
    <article className="demand-card">
      <div className="demand-card-top">
        <span className="demand-card-budget">{preview.budgetLabel}</span>
        {preview.badges.length > 0 ? (
          <span className="demand-card-verified">
            <Icon name="check-shield" size={13} />
            Verified
          </span>
        ) : null}
      </div>
      {meta.length > 0 ? <p className="demand-card-meta">{meta.join(" · ")}</p> : null}
      <p className="demand-card-sub">
        {preview.label} · {preview.area}
      </p>
      {chips.length > 0 ? (
        <div className="demand-card-chips">
          {chips.map((chip) => (
            <span key={chip}>{chip}</span>
          ))}
        </div>
      ) : null}
    </article>
  );
}
