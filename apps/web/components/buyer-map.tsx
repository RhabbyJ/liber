import type { MarketMapContext, SelectedMapArea } from "../lib/map-area";
import type { Buyer } from "../lib/mock-data";
import { InteractiveBuyerMap } from "./interactive-buyer-map";
import { StaticBuyerMap } from "./static-buyer-map";

export function BuyerMap({
  buyers,
  market,
  selectedServiceArea,
  viewerUserId,
}: {
  buyers: Buyer[];
  market: MarketMapContext;
  selectedServiceArea?: SelectedMapArea | null;
  viewerUserId?: string;
}) {
  const token = (process.env.NEXT_PUBLIC_MAPBOX_TOKEN || "").trim();

  if (token) {
    return (
      <InteractiveBuyerMap
        buyers={buyers}
        market={market}
        selectedServiceArea={selectedServiceArea}
        token={token}
        viewerUserId={viewerUserId}
      />
    );
  }

  return (
    <StaticBuyerMap
      buyers={buyers}
      label="Fallback map"
      market={market}
      selectedServiceArea={selectedServiceArea}
    />
  );
}
