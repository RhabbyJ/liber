import type { MarketMapContext, SelectedMapArea } from "../lib/map-area";
import type { SellerBuyerSummaryDTO } from "../lib/buyer-dtos";
import { InteractiveBuyerMap } from "./interactive-buyer-map";
import { StaticBuyerMap } from "./static-buyer-map";

export function BuyerMap({
  buyers,
  clearAreaHref,
  market,
  selectedServiceArea,
}: {
  buyers: SellerBuyerSummaryDTO[];
  clearAreaHref?: string;
  market: MarketMapContext;
  selectedServiceArea?: SelectedMapArea | null;
}) {
  const token = (process.env.NEXT_PUBLIC_MAPBOX_TOKEN || "").trim();

  if (token) {
    return (
      <InteractiveBuyerMap
        buyers={buyers}
        clearAreaHref={clearAreaHref}
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
