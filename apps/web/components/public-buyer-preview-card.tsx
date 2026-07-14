"use client";

import type { PublicBuyerPreviewDto } from "../lib/buyer-dto-types";
import { syncPublicDemandPinHighlights } from "../lib/public-demand-highlight";
import { GeneratedAvatar } from "./generated-avatar";
import { Icon } from "./icon";
import { PropertyTypeArtwork } from "./property-type-artwork";

export function PublicBuyerPreviewCard({ index, preview }: { index: number; preview: PublicBuyerPreviewDto }) {
  const meta = [
    preview.bedroomsMin ? `${preview.bedroomsMin}+ bd` : null,
    preview.bathroomsMin ? `${preview.bathroomsMin}+ ba` : null,
    preview.squareFeetMin ? `${preview.squareFeetMin.toLocaleString()}+ sqft` : null,
    preview.condition || null,
  ].filter((fact): fact is string => Boolean(fact));
  const chips = [...preview.badges.slice(0, 2), ...preview.amenities].slice(0, 4);
  const setActivePreviewIndex = (activeIndex: number | null) => {
    const pins = Array.from(document.querySelectorAll<HTMLElement>("[data-public-demand-preview-index]"))
      .map((element) => ({
        element,
        previewIndex: Number(element.dataset.publicDemandPreviewIndex),
      }));
    syncPublicDemandPinHighlights(pins, activeIndex);
  };

  return (
    <article
      className="demand-card demand-result-card"
      onBlur={(event) => {
        if (!event.currentTarget.matches(":hover")) setActivePreviewIndex(null);
      }}
      onFocus={() => setActivePreviewIndex(index)}
      onMouseEnter={() => setActivePreviewIndex(index)}
      onMouseLeave={(event) => {
        if (document.activeElement !== event.currentTarget) setActivePreviewIndex(null);
      }}
      tabIndex={0}
    >
      <div className="demand-card-body">
        <div className="demand-card-identity">
          <GeneratedAvatar
            alt={`${preview.alias} generated buyer avatar`}
            seed={preview.alias}
            variant={preview.avatarVariant}
          />
          <div className="demand-card-identity-copy">
            <h3>{preview.alias}</h3>
          </div>
          <PropertyTypeArtwork
            className="demand-card-property-art"
            sizes="46px"
            value={preview.label}
            variant="emoji"
          />
        </div>
        <div className="demand-card-top">
          <div>
            <p className="demand-card-kicker">Seeking a {preview.label.toLowerCase()}</p>
            <p className="demand-card-budget">{preview.budgetLabel}</p>
          </div>
          {preview.badges.length > 0 ? (
            <span className="demand-card-verified">
              <Icon name="check-shield" size={13} />
              Verified details
            </span>
          ) : null}
        </div>
        <p className="demand-card-sub">
          <Icon name="map-pin" size={13} />
          {preview.area}
        </p>
        {meta.length > 0 ? (
          <div className="demand-card-facts" aria-label="Buyer criteria summary">
            {meta.map((fact) => <span key={fact}>{fact}</span>)}
          </div>
        ) : null}
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
