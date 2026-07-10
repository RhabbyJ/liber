import type { Buyer } from "./mock-data";
import { approximateBuyerPoint } from "./buyer-map-point";

export function mapboxServiceAreaQueries(feature: Record<string, any>) {
  const properties = feature.properties ?? {};
  const context = properties.context ?? {};
  const typedPostcode = properties.feature_type === "postcode" ? properties.name : context.postcode?.name;
  const typedPlace = properties.feature_type === "place" ? properties.name : context.place?.name;
  return [typedPostcode, typedPlace]
    .filter((value): value is string => typeof value === "string" && Boolean(value.trim()))
    .map((value) => value.trim());
}

export function mapPinPosition(buyer: Buyer, buyers: Buyer[]) {
  const buyerPoint = approximateBuyerPoint(buyer);
  if (!buyerPoint) return null;
  const points = buyers
    .map(approximateBuyerPoint)
    .filter((item): item is NonNullable<ReturnType<typeof approximateBuyerPoint>> => item !== null);
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

function clamp(value: number) {
  return Math.max(8, Math.min(92, value));
}
