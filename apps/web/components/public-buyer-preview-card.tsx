"use client";

import type { PublicBuyerPreviewDto } from "../lib/buyer-dto-types";
import { syncPublicDemandPinHighlights } from "../lib/public-demand-highlight";
import { Icon } from "./icon";

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
