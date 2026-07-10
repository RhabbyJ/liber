import type { SellerBuyerSearchDto } from "./buyer-dto-types";
import { approximateBuyerPoint } from "./buyer-map-point";

export function mapboxServiceAreaQueries(feature: Record<string, unknown>) {
  const properties = recordValue(feature.properties);
  const context = recordValue(properties.context);
  const typedPostcode = properties.feature_type === "postcode" ? properties.name : recordValue(context.postcode).name;
  const typedPlace = properties.feature_type === "place" ? properties.name : recordValue(context.place).name;
  return [typedPostcode, typedPlace]
    .filter((value): value is string => typeof value === "string" && Boolean(value.trim()))
    .map((value) => value.trim());
}

function recordValue(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

export function mapPinPosition(buyer: SellerBuyerSearchDto, buyers: SellerBuyerSearchDto[]) {
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
