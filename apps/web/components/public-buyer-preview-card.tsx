"use client";

import type { PublicBuyerPreviewDto } from "../lib/buyer-dto-types";
import { criteriaFacts, seekingLabel } from "../lib/listing-format";
import { syncPublicDemandPinHighlights } from "../lib/public-demand-highlight";
import { GeneratedAvatar } from "./generated-avatar";
import { Icon } from "./icon";
import { PropertyTypeArtwork } from "./property-type-artwork";

const flagOrder = ["Pre-approved", "Cash buyer", "Verified funds", "ID verified"];

export function PublicBuyerPreviewCard({ index, preview }: { index: number; preview: PublicBuyerPreviewDto }) {
  const facts = criteriaFacts(preview);
  const flags = [...preview.badges].sort((a, b) => flagRank(a) - flagRank(b)).slice(0, 2);
  const extras = [preview.condition, ...preview.amenities].filter((value): value is string => Boolean(value)).slice(0, 3);
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
      aria-label={`${preview.alias}: ${seekingLabel(preview.label).toLowerCase()} near ${preview.area}`}
      className="listing-card preview"
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
      <div className="listing-card-media">
        <PropertyTypeArtwork className="listing-card-art" motion="none" priority={index < 2} sizes="(max-width: 767px) 100vw, 360px" value={preview.label} />
        {flags.length > 0 ? (
          <div className="listing-card-flags">
            {flags.map((flag) => (
              <span className="listing-flag" key={flag}>
                <Icon name={flag === "Pre-approved" ? "check-shield" : flag === "ID verified" ? "shield" : "money"} size={13} />
                {flag}
              </span>
            ))}
          </div>
        ) : null}
        <GeneratedAvatar alt={`${preview.alias} avatar`} className="listing-card-avatar" name={preview.alias} seed={preview.alias} size="lg" variant={preview.avatarVariant} />
      </div>
      <div className="listing-card-body">
        <p className="listing-card-price">{preview.budgetLabel}</p>
        <ul className="listing-card-facts" aria-label="Home needs">
          {facts.map((fact) => (
            <li key={fact.label}>
              <b>{fact.value}</b> {fact.label}
            </li>
          ))}
          <li className="listing-card-kind">{seekingLabel(preview.label)}</li>
        </ul>
        <p className="listing-card-address">{preview.area}</p>
        <p className="listing-card-fineprint">
          {preview.alias}
          {extras.length > 0 ? ` · ${extras.join(" · ")}` : ""}
        </p>
      </div>
    </article>
  );
}

function flagRank(label: string) {
  const rank = flagOrder.indexOf(label);
  return rank === -1 ? flagOrder.length : rank;
}
