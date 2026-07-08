import Link from "next/link";
import type { SelectedMapArea } from "../lib/map-area";
import type { Buyer } from "../lib/mock-data";
import { mapPinPosition } from "../lib/mapbox";

type Props = {
  buyers: Buyer[];
  label?: string;
  selectedServiceArea?: SelectedMapArea | null;
};

export function StaticBuyerMap({ buyers, label = "Approximate pins", selectedServiceArea = null }: Props) {
  const hasSelectedArea = Boolean(selectedServiceArea);
  const areaLabel = selectedServiceArea ? selectedServiceArea.label : label;

  return (
    <aside className="map-shell fallback">
      <div className="map-toolbar">
        <div>
          <strong>Buyer demand map</strong>
          <span className="muted">{buyers.length} active buyers in the San Fernando Valley pilot</span>
        </div>
        <div className="map-toolbar-pills">
          <span>{areaLabel}</span>
          <span>Seller safe view</span>
        </div>
      </div>
      <div className="map-pins">
        {hasSelectedArea ? <span aria-hidden="true" className="map-selected-area-static" /> : null}
        {buyers.map((buyer) => {
          const position = mapPinPosition(buyer, buyers);
          return (
            <Link
              aria-label={`Open ${buyer.name}`}
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
