import type { Buyer } from "../lib/mock-data";
import { InteractiveBuyerMap } from "./interactive-buyer-map";
import { StaticBuyerMap } from "./static-buyer-map";

export function BuyerMap({
  buyers,
  centerLat,
  centerLng,
  radiusMiles,
}: {
  buyers: Buyer[];
  centerLat?: number;
  centerLng?: number;
  radiusMiles?: number;
}) {
  const token = (process.env.NEXT_PUBLIC_MAPBOX_TOKEN || "").trim();

  if (token) {
    return (
      <InteractiveBuyerMap
        buyers={buyers}
        centerLat={centerLat}
        centerLng={centerLng}
        radiusMiles={radiusMiles}
        token={token}
      />
    );
  }

  return (
    <StaticBuyerMap
      buyers={buyers}
      centerLat={centerLat}
      centerLng={centerLng}
      label="Fallback map"
      radiusMiles={radiusMiles}
    />
  );
}
