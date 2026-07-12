import Link from "next/link";
import type { MarketMapContext, SelectedMapArea } from "../lib/map-area";
import type { SellerBuyerSummaryDTO } from "../lib/buyer-dtos";
import { mapPinPosition } from "../lib/mapbox";

type Props = {
  buyers: SellerBuyerSummaryDTO[];
  label?: string;
  market: MarketMapContext;
  selectedServiceArea?: SelectedMapArea | null;
};

export function StaticBuyerMap({ buyers, label = "Approximate pins", market, selectedServiceArea = null }: Props) {
  const areaLabel = selectedServiceArea ? selectedServiceArea.label : label;

  return (
    <aside className="map-shell fallback">
      <div className="map-toolbar">
        <div>
          <strong>Buyer demand map</strong>
          <span className="muted">{buyers.length} active buyers in {market.label} service areas</span>
        </div>
        <div className="map-toolbar-pills">
          <span>{areaLabel}</span>
          <span>Seller safe view</span>
        </div>
      </div>
      <div className="map-pins">
        {buyers.map((buyer) => {
          const position = mapPinPosition(buyer, buyers);
          if (!position) return null;
          return (
            <Link
              aria-label={`Open ${buyer.isDemo ? "demo buyer " : ""}${buyer.name}`}
              className="map-pin"
              href={`/buyers/${buyer.id}`}
              key={buyer.id}
              style={{ left: `${position.left}%`, top: `${position.top}%` }}
            >
              <span>{buyer.name.slice(0, 1)}</span>
            </Link>
          );
        })}
      </div>
    </aside>
  );
}
