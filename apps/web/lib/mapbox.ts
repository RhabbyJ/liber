import type { Buyer } from "./mock-data";
import { approximateBuyerPoint } from "./launch-market";

export function mapboxStaticImageUrl(buyers: Buyer[], token = process.env.NEXT_PUBLIC_MAPBOX_TOKEN) {
  if (!token) return null;

  const points = buyers
    .map((buyer) => ({ buyer, point: approximateBuyerPoint(buyer) }))
    .filter(({ point }) => Number.isFinite(point.lat) && Number.isFinite(point.lng))
    .slice(0, 15);
  if (points.length === 0) return null;

  const center = mapCenter(points.map(({ point }) => point));
  const markers = points
    .map(({ point }, index) => {
      const label = Math.min(index + 1, 99);
      return `pin-s-${label}+116149(${coordinate(point.lng)},${coordinate(point.lat)})`;
    })
    .join(",");

  const params = new URLSearchParams({ access_token: token });
  return `https://api.mapbox.com/styles/v1/mapbox/light-v11/static/${markers}/${coordinate(center.lng)},${coordinate(center.lat)},9/640x520?${params}`;
}

export function mapPinPosition(buyer: Buyer, buyers: Buyer[]) {
  const buyerPoint = approximateBuyerPoint(buyer);
  const points = buyers
    .map(approximateBuyerPoint)
    .filter((item) => Number.isFinite(item.lat) && Number.isFinite(item.lng));
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
    left: clamp(((buyerPoint.lng - minLng) / lngSpan) * 76 + 12),
    top: clamp((1 - (buyerPoint.lat - minLat) / latSpan) * 76 + 12),
  };
}

function mapCenter(points: Array<{ lat: number; lng: number }>) {
  const total = points.reduce(
    (sum, point) => ({
      lat: sum.lat + point.lat,
      lng: sum.lng + point.lng,
    }),
    { lat: 0, lng: 0 },
  );

  return {
    lat: total.lat / points.length,
    lng: total.lng / points.length,
  };
}

function coordinate(value: number) {
  return value.toFixed(5);
}

function clamp(value: number) {
  return Math.max(8, Math.min(92, value));
}
