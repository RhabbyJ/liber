import Link from "next/link";
import type { SellerBuyerSearchDto } from "../lib/buyer-dto-types";
import type { MarketMapContext, SelectedMapArea } from "../lib/map-area";
import { mapPinPosition } from "../lib/mapbox";

type Props = {
  buyers: SellerBuyerSearchDto[];
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
              aria-label={`Open ${buyer.alias}`}
              className="map-pin"
              href={`/buyers/${buyer.buyerProfileId}`}
              key={buyer.buyerProfileId}
              style={{ left: `${position.left}%`, top: `${position.top}%` }}
            >
              <span>{buyer.alias.slice(0, 1)}</span>
            </Link>
          );
        })}
      </div>
    </aside>
  );
}
