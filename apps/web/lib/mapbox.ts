import type { Buyer } from "./mock-data";

export function mapboxStaticImageUrl(buyers: Buyer[], token = process.env.NEXT_PUBLIC_MAPBOX_TOKEN) {
  if (!token) return null;

  const points = buyers
    .filter((buyer) => Number.isFinite(buyer.lat) && Number.isFinite(buyer.lng))
    .slice(0, 15);
  if (points.length === 0) return null;

  const center = mapCenter(points);
  const markers = points
    .map((buyer, index) => {
      const label = Math.min(index + 1, 99);
      return `pin-s-${label}+116149(${coordinate(buyer.lng)},${coordinate(buyer.lat)})`;
    })
    .join(",");

  const params = new URLSearchParams({ access_token: token });
  return `https://api.mapbox.com/styles/v1/mapbox/light-v11/static/${markers}/${coordinate(center.lng)},${coordinate(center.lat)},9/640x520?${params}`;
}

export function mapPinPosition(buyer: Buyer, buyers: Buyer[]) {
  const points = buyers.filter((item) => Number.isFinite(item.lat) && Number.isFinite(item.lng));
  if (points.length === 0) return { left: 50, top: 50 };

  const lats = points.map((item) => item.lat);
  const lngs = points.map((item) => item.lng);
  const minLat = Math.min(...lats);
  const maxLat = Math.max(...lats);
  const minLng = Math.min(...lngs);
  const maxLng = Math.max(...lngs);
  const latSpan = maxLat - minLat || 0.1;
  const lngSpan = maxLng - minLng || 0.1;

  return {
    left: clamp(((buyer.lng - minLng) / lngSpan) * 76 + 12),
    top: clamp((1 - (buyer.lat - minLat) / latSpan) * 76 + 12),
  };
}

function mapCenter(buyers: Buyer[]) {
  const total = buyers.reduce(
    (sum, buyer) => ({
      lat: sum.lat + buyer.lat,
      lng: sum.lng + buyer.lng,
    }),
    { lat: 0, lng: 0 },
  );

  return {
    lat: total.lat / buyers.length,
    lng: total.lng / buyers.length,
  };
}

function coordinate(value: number) {
  return value.toFixed(5);
}

function clamp(value: number) {
  return Math.max(8, Math.min(92, value));
}
