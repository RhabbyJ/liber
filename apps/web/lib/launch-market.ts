import type { Buyer } from "./mock-data";
import {
  activeServiceAreas,
  findServiceArea,
  normalizeZip,
  serviceAreaDisplayLabel,
  serviceAreas,
  supportedZipText,
  type ServiceArea,
} from "./service-areas";

export type PilotArea = {
  bbox: [number, number, number, number];
  city: string;
  geojsonPath: string;
  label: string;
  lat: number;
  lng: number;
  radiusMiles: number;
  slug: string;
  state: "CA";
  status: "active" | "next";
  type: ServiceArea["type"];
  zip: string;
};

export const pilotAreas: PilotArea[] = activeServiceAreas.map(areaToPilotArea);
export const activePilotAreas = pilotAreas.filter((area) => area.status === "active" && area.zip);
export const sfvBoundingBox = "-118.72,34.10,-118.18,34.34";

export { normalizeZip, supportedZipText };

export function findPilotArea(value: string, _options: { includeNext?: boolean } = {}) {
  const area = findServiceArea(value, serviceAreas);
  return area ? areaToPilotArea(area) : null;
}

export function isActivePilotZip(zip: string) {
  const normalizedZip = normalizeZip(zip);
  return activeServiceAreas.some((area) => area.type === "zip" && area.postalCode === normalizedZip);
}

export function approximateBuyerPoint(buyer: Buyer) {
  const area = findServiceArea(`${buyer.city} ${buyer.location}`, serviceAreas);
  if (area) return { lat: area.center.lat, lng: area.center.lng };

  return {
    lat: roundCoordinate(buyer.lat),
    lng: roundCoordinate(buyer.lng),
  };
}

function areaToPilotArea(area: ServiceArea): PilotArea {
  return {
    bbox: area.bbox,
    city: area.city ?? area.label,
    geojsonPath: area.geojsonPath,
    label: serviceAreaDisplayLabel(area),
    lat: area.center.lat,
    lng: area.center.lng,
    radiusMiles: 4,
    slug: area.slug,
    state: area.state,
    status: area.active ? "active" : "next",
    type: area.type,
    zip: area.postalCode ?? "",
  };
}

function roundCoordinate(value: number) {
  return Number(value.toFixed(2));
}
