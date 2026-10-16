"use client";

import type { PublicBuyerPreviewDTO } from "../lib/buyer-dtos";
import { criteriaFacts, seekingLabel } from "../lib/listing-format";
import { syncPublicDemandPinHighlights } from "../lib/public-demand-highlight";
import { hasVerifiedPreviewBadge } from "../lib/test-preapproval";
import { GeneratedAvatar } from "./generated-avatar";
import { PropertyTypeArtwork } from "./property-type-artwork";

const flagOrder = ["Pre-approved", "Cash buyer", "Verified funds", "ID verified"];
const DEMO_BUYER_LABEL = "Demo buyer";

export function PublicBuyerPreviewCard({ index, photoSrc, preview }: { index: number; photoSrc?: string; preview: PublicBuyerPreviewDTO }) {
  const facts = criteriaFacts(preview);
  const isDemo = preview.badges.includes(DEMO_BUYER_LABEL);
  // Demo and test labels come first so a trust badge can never push them off the photo.
  const unverified = preview.badges.filter((badge) => !hasVerifiedPreviewBadge([badge]));
  const verified = preview.badges.filter((badge) => hasVerifiedPreviewBadge([badge])).sort((a, b) => flagRank(a) - flagRank(b));
  const flags = [...unverified, ...verified].slice(0, 2);
  const extras = [preview.condition, ...preview.amenities].filter((value): value is string => Boolean(value)).slice(0, 3);
  const setActivePreviewIndex = (activeIndex: number | null) => {
    const pins = Array.from(document.querySelectorAll<HTMLElement>("[data-public-demand-preview-indexes]"))
      .map((element) => ({
        element,
        previewIndexes: (element.dataset.publicDemandPreviewIndexes ?? "").split(",").map(Number),
      }));
    syncPublicDemandPinHighlights(pins, activeIndex);
  };

  return (
    <article
      aria-label={`${isDemo ? "Demo buyer " : ""}${preview.alias}: ${seekingLabel(preview.label).toLowerCase()} near ${preview.area}`}
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
        <PropertyTypeArtwork className="listing-card-art" motion="none" priority={index < 2} seed={preview.alias} sizes="(max-width: 767px) 100vw, 360px" src={photoSrc} value={preview.label} />
        {flags.length > 0 ? (
          <div className="listing-card-flags">
            {flags.map((flag) => (
              <span className={`listing-flag${flag === DEMO_BUYER_LABEL ? " demo" : hasVerifiedPreviewBadge([flag]) ? "" : " unverified"}`} key={flag}>
                {flag}
              </span>
            ))}
          </div>
        ) : null}
        <GeneratedAvatar className="listing-card-avatar" decorative name={preview.alias} seed={preview.alias} variant={preview.avatarVariant} />
        {/* A representative photo of the home type, never this buyer's or a listed home. */}
        <span className="sample-photo-tag">Sample photo</span>
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
