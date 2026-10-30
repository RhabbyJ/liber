"use client";

import type { PublicBuyerPreviewDTO } from "../lib/buyer-dtos";
import { previewCardView } from "../lib/buyer-card-view";
import { syncPublicDemandPinHighlights } from "../lib/public-demand-highlight";
import { BuyerDemandCard } from "./buyer-demand-card";

/** Privacy-safe preview card: no profile link; hovering or focusing it highlights its map pin. */
export function PublicBuyerPreviewCard({ index, preview }: { index: number; preview: PublicBuyerPreviewDTO }) {
  const setActivePreviewIndex = (activeIndex: number | null) => {
    const pins = Array.from(document.querySelectorAll<HTMLElement>("[data-public-demand-preview-indexes]"))
      .map((element) => ({
        element,
        previewIndexes: (element.dataset.publicDemandPreviewIndexes ?? "").split(",").map(Number),
      }));
    syncPublicDemandPinHighlights(pins, activeIndex);
  };

  return (
    <BuyerDemandCard
      articleProps={{
        onBlur: (event) => {
          if (!event.currentTarget.matches(":hover")) setActivePreviewIndex(null);
        },
        onFocus: () => setActivePreviewIndex(index),
        onMouseEnter: () => setActivePreviewIndex(index),
        onMouseLeave: (event) => {
          if (document.activeElement !== event.currentTarget) setActivePreviewIndex(null);
        },
        tabIndex: 0,
      }}
      view={previewCardView(preview)}
    />
  );
}
