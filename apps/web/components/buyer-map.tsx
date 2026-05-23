import Link from "next/link";
import type { Buyer } from "../lib/mock-data";
import { mapPinPosition } from "../lib/mapbox";
import { InteractiveBuyerMap } from "./interactive-buyer-map";

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
  const token = process.env.NEXT_PUBLIC_MAPBOX_TOKEN || "";

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
    <aside className="map-shell">
      <div className="map-toolbar">
        <div>
          <strong>Buyer demand map</strong>
          <span className="muted">{buyers.length} active buyers in the San Fernando Valley pilot</span>
        </div>
        <div className="map-toolbar-pills">
          <span>Fallback map</span>
          <span>Approximate pins</span>
        </div>
      </div>
      <div className="map-pins">
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
