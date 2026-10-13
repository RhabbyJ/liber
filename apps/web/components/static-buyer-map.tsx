import Link from "next/link";
import type { MarketMapContext, SelectedMapArea } from "../lib/map-area";
import type { SellerBuyerSummaryDTO } from "../lib/buyer-dtos";
import { pinBudgetLabel } from "../lib/listing-format";
import { mapPinPosition } from "../lib/mapbox";
import { DemandAtlasBackdrop } from "./demand-atlas";

type Props = {
  buyers: SellerBuyerSummaryDTO[];
  label?: string;
  market: MarketMapContext;
  selectedServiceArea?: SelectedMapArea | null;
};

export function StaticBuyerMap({ buyers, label = "Approximate pins", market, selectedServiceArea = null }: Props) {
  const areaLabel = selectedServiceArea ? selectedServiceArea.label : market.label;

  return (
    <div className="map-shell fallback">
      <div className="map-static-pins">
        <DemandAtlasBackdrop />
        {buyers.map((buyer) => {
          const position = mapPinPosition(buyer, buyers);
          if (!position) return null;
          return (
            <Link
              aria-label={`Open ${buyer.isDemo ? "demo buyer " : ""}${buyer.name}`}
              className="map-price-pin static"
              href={`/buyers/${buyer.id}`}
              key={buyer.id}
              style={{ left: `${position.left}%`, top: `${position.top}%` }}
            >
              <span>{pinBudgetLabel(buyer.budgetMin, buyer.budgetMax)}</span>
            </Link>
          );
        })}
      </div>
      <p className="map-footnote">{label} · {areaLabel}</p>
    </div>
  );
}
