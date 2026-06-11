import Link from "next/link";
import { Icon } from "../components/icon";
import { PublicDemandMap } from "../components/public-demand-map";
import { getPublicBuyerPreviews, type PublicBuyerPreview } from "../server/buyer-preview";

// Refresh the privacy-safe buyer-demand teaser periodically without making the page fully dynamic.
export const revalidate = 300;

export default async function HomePage() {
  const buyerPreviews = await getPublicBuyerPreviews();
  const mapboxToken = (process.env.NEXT_PUBLIC_MAPBOX_TOKEN || "").trim();
  const showMap = Boolean(mapboxToken);

  return (
    <div className="map-landing">
      <section className="map-landing-intro">
        <div>
          <h1>
            Meet <strong>the buyer</strong> before you list.
          </h1>
          <p className="muted">
            Live, verified buyer demand on the map — budgets instead of listings. Properties stay private; outreach is manual.
          </p>
        </div>
        <div className="map-landing-actions">
          <Link className="button primary" href="/signup?role=seller&next=/seller/search">
            Find serious buyers
            <Icon name="arrow-right" size={14} />
          </Link>
          <Link className="button secondary" href="/signup?role=buyer&next=/buyer/profile">
            I&apos;m a buyer
          </Link>
        </div>
      </section>

      <section className="map-landing-body" aria-label="Buyer demand preview">
        {showMap ? <PublicDemandMap previews={buyerPreviews} token={mapboxToken} /> : null}

        <aside className={`map-landing-panel ${showMap ? "" : "full"}`}>
          <div className="map-landing-panel-head">
            <p className="eyebrow">Live buyer demand</p>
            <h2>
              {buyerPreviews.length > 0
                ? `${buyerPreviews.length} active ${buyerPreviews.length === 1 ? "buyer" : "buyers"} previewed`
                : "Buyer demand preview"}
            </h2>
            <p className="muted small">
              A small, anonymized preview. Buyer identities, documents, and exact locations stay private until you sign up
              and seller access is approved.
            </p>
          </div>

          {buyerPreviews.map((preview, index) => (
            <BuyerPreviewCard key={index} preview={preview} />
          ))}

          <article className="buyer-preview-card signup-wall">
            <Icon name="lock" size={22} />
            <h3>See every matching buyer</h3>
            <p className="muted small">
              Full buyer profiles, the complete demand map, filters, and private invites open after signup and seller
              approval.
            </p>
            <Link className="button primary" href="/signup?role=seller&next=/seller/search">
              Sign up to search buyers
              <Icon name="arrow-right" size={14} />
            </Link>
            <Link className="muted small" href="/signup?role=buyer&next=/buyer/profile" style={{ textDecoration: "underline" }}>
              I&apos;m a buyer — add my demand
            </Link>
          </article>
        </aside>
      </section>

      <section className="map-landing-footnote">
        <span>
          <Icon name="check-shield" size={14} /> Admin-reviewed trust badges
        </span>
        <span>
          <Icon name="lock" size={14} /> Private properties, manual invites only
        </span>
        <span>
          <Icon name="map-pin" size={14} /> San Fernando Valley pilot
        </span>
      </section>
    </div>
  );
}

function BuyerPreviewCard({ preview }: { preview: PublicBuyerPreview }) {
  const fitFacts = [
    preview.bedroomsMin ? `${preview.bedroomsMin}+ bed` : null,
    preview.bathroomsMin ? `${preview.bathroomsMin}+ bath` : null,
    preview.squareFeetMin ? `${preview.squareFeetMin.toLocaleString()}+ sqft` : null,
    preview.condition || null,
  ].filter((fact): fact is string => Boolean(fact));

  return (
    <article className="buyer-preview-card">
      <div className="buyer-preview-head">
        <span className="buyer-preview-avatar" aria-hidden="true">
          <Icon name="user" size={18} />
        </span>
        <div>
          <h3>{preview.label}</h3>
          <p className="muted small">{preview.area}</p>
        </div>
      </div>
      <span className="buyer-preview-budget">{preview.budgetLabel}</span>
      {preview.purpose ? <p className="muted small" style={{ margin: 0 }}>{preview.purpose}</p> : null}
      {fitFacts.length > 0 ? (
        <div className="buyer-preview-facts">
          {fitFacts.map((fact) => (
            <span key={fact}>{fact}</span>
          ))}
        </div>
      ) : null}
      {preview.amenities.length > 0 ? (
        <div className="buyer-preview-facts subtle">
          {preview.amenities.map((amenity) => (
            <span key={amenity}>{amenity}</span>
          ))}
        </div>
      ) : null}
      {preview.badges.length > 0 ? (
        <div className="buyer-preview-badges">
          {preview.badges.map((badge) => (
            <span key={badge}>
              <Icon name="check-shield" size={13} />
              {badge}
            </span>
          ))}
        </div>
      ) : null}
    </article>
  );
}
