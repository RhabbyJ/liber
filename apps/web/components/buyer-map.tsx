import type { SelectedMapArea } from "../lib/map-area";
import type { Buyer } from "../lib/mock-data";
import { InteractiveBuyerMap } from "./interactive-buyer-map";
import { StaticBuyerMap } from "./static-buyer-map";

export function BuyerMap({
  buyers,
  selectedServiceArea,
  viewerUserId,
}: {
  buyers: Buyer[];
  selectedServiceArea?: SelectedMapArea | null;
  viewerUserId?: string;
}) {
  const token = (process.env.NEXT_PUBLIC_MAPBOX_TOKEN || "").trim();

  if (token) {
    return (
      <InteractiveBuyerMap
        buyers={buyers}
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
      selectedServiceArea={selectedServiceArea}
    />
  );
}
