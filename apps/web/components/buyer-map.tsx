import type { MarketMapContext, SelectedMapArea } from "../lib/map-area";
import type { SellerBuyerSearchDto } from "../lib/buyer-dto-types";
import { InteractiveBuyerMap } from "./interactive-buyer-map";
import { StaticBuyerMap } from "./static-buyer-map";

export function BuyerMap({
  buyers,
  market,
  selectedServiceArea,
}: {
  buyers: SellerBuyerSearchDto[];
  market: MarketMapContext;
  selectedServiceArea?: SelectedMapArea | null;
}) {
  const token = (process.env.NEXT_PUBLIC_MAPBOX_TOKEN || "").trim();

  if (token) {
    return (
      <InteractiveBuyerMap
        buyers={buyers}
        market={market}
        selectedServiceArea={selectedServiceArea}
        token={token}
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
