"use client";

import { useState } from "react";
import type { MarketMapContext, SelectedMapArea } from "../lib/map-area";
import type { SellerBuyerSummaryDTO } from "../lib/buyer-dtos";
import { approximateBuyerPoint } from "../lib/buyer-map-point";
import { mapboxStaticImageUrl } from "../lib/mapbox-static-image";

type Props = {
  buyers: SellerBuyerSummaryDTO[];
  label?: string;
  market: MarketMapContext;
  selectedServiceArea?: SelectedMapArea | null;
  token?: string;
};

export function StaticBuyerMap({ buyers, label = "Area centers", market, selectedServiceArea = null, token }: Props) {
  const points = buyers.map(approximateBuyerPoint).filter((point) => point !== null);
  const imageUrl = mapboxStaticImageUrl({ market, points, selectedArea: selectedServiceArea, token });
  const [failedImageUrl, setFailedImageUrl] = useState("");
  return (
    <div className="map-shell fallback">
      <div className="seller-map-static">
        {imageUrl && failedImageUrl !== imageUrl ? (
          // The provider renders both streets and pins in one geographic projection.
          // eslint-disable-next-line @next/next/no-img-element
          <img alt={`Map of ${buyers.length} buyer target area centers in ${market.label}`} className="public-map-static-image"
            onError={() => setFailedImageUrl(imageUrl)} src={imageUrl} />
        ) : (
          <div className="public-map-static-empty">
            <strong>Map unavailable</strong>
            <span>Use the buyer cards to view profiles and send invites.</span>
          </div>
        )}
      </div>
      <p className="map-footnote">{selectedServiceArea?.label ?? label} · Buyer target areas, not home addresses</p>
    </div>
  );
}
