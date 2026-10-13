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
    <aside className="map-shell fallback">
      <div className="map-toolbar">
        <div>
          <strong>Map</strong>
          <span className="muted">{buyers.length} active buyers in {market.label} service areas</span>
        </div>
        <div className="map-toolbar-pills">
          <span>{selectedServiceArea?.label ?? label}</span>
          <span>Buyer target areas · not home addresses</span>
        </div>
      </div>
      <div className="seller-map-static">
        {imageUrl && failedImageUrl !== imageUrl ? (
          // The provider renders both streets and pins in one geographic projection.
          // eslint-disable-next-line @next/next/no-img-element
          <img alt="Map of buyer target area centers" className="public-map-static-image"
            onError={() => setFailedImageUrl(imageUrl)} src={imageUrl} />
        ) : (
          <div className="public-map-static-empty">
            <strong>Map unavailable</strong>
            <span>Use the buyer cards below to view profiles and send invites.</span>
          </div>
        )}
      </div>
    </aside>
  );
}
