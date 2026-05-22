import Link from "next/link";
import type { Buyer } from "../lib/mock-data";
import { mapboxStaticImageUrl, mapPinPosition } from "../lib/mapbox";

export function BuyerMap({ buyers }: { buyers: Buyer[] }) {
  const mapImageUrl = mapboxStaticImageUrl(buyers);

  return (
    <aside
      className={mapImageUrl ? "map-shell mapbox" : "map-shell"}
      style={mapImageUrl ? { backgroundImage: `url("${mapImageUrl}")` } : undefined}
    >
      <div className="map-toolbar">
        <strong>Los Angeles buyer map</strong>
        <span className="muted">Map and list share the same result set.</span>
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
            />
          );
        })}
      </div>
    </aside>
  );
}
