import type { Buyer } from "./mock-data";

export type PilotArea = {
  city: string;
  label: string;
  lat: number;
  lng: number;
  radiusMiles: number;
  state: "CA";
  status: "active" | "next";
  zip: string;
};

export const pilotAreas: PilotArea[] = [
  { city: "Sherman Oaks", label: "Sherman Oaks 91423", lat: 34.148, lng: -118.432, radiusMiles: 4, state: "CA", status: "active", zip: "91423" },
  { city: "Studio City", label: "Studio City 91604", lat: 34.1396, lng: -118.3913, radiusMiles: 4, state: "CA", status: "active", zip: "91604" },
  { city: "Encino", label: "Encino 91436", lat: 34.1517, lng: -118.4924, radiusMiles: 4, state: "CA", status: "active", zip: "91436" },
  { city: "Encino", label: "Encino 91316", lat: 34.1664, lng: -118.516, radiusMiles: 4, state: "CA", status: "active", zip: "91316" },
  { city: "Tarzana", label: "Tarzana 91356", lat: 34.1569, lng: -118.5449, radiusMiles: 4, state: "CA", status: "active", zip: "91356" },
  { city: "Woodland Hills", label: "Woodland Hills 91364", lat: 34.1584, lng: -118.5955, radiusMiles: 4, state: "CA", status: "active", zip: "91364" },
  { city: "Woodland Hills", label: "Woodland Hills 91367", lat: 34.1784, lng: -118.6154, radiusMiles: 4, state: "CA", status: "active", zip: "91367" },
  { city: "Porter Ranch", label: "Porter Ranch 91326", lat: 34.283, lng: -118.5614, radiusMiles: 4, state: "CA", status: "active", zip: "91326" },
  { city: "Granada Hills", label: "Granada Hills 91344", lat: 34.294, lng: -118.5079, radiusMiles: 4, state: "CA", status: "next", zip: "91344" },
  { city: "Northridge", label: "Northridge 91324", lat: 34.241, lng: -118.5504, radiusMiles: 4, state: "CA", status: "next", zip: "91324" },
];

export const activePilotAreas = pilotAreas.filter((area) => area.status === "active");
export const sfvBoundingBox = "-118.72,34.11,-118.33,34.34";

export function normalizeZip(value: string) {
  return value.match(/\d{5}/)?.[0] ?? "";
}

export function findPilotArea(value: string, options: { includeNext?: boolean } = {}) {
  const query = value.trim().toLowerCase();
  if (!query) return null;

  const zip = normalizeZip(query);
  const areas = options.includeNext ? pilotAreas : activePilotAreas;
  return areas.find((area) => area.zip === zip) ??
    areas.find((area) => query.includes(area.city.toLowerCase())) ??
    null;
}

export function isActivePilotZip(zip: string) {
  return activePilotAreas.some((area) => area.zip === normalizeZip(zip));
}

export function supportedZipText() {
  return activePilotAreas.map((area) => area.zip).join(", ");
}

export function approximateBuyerPoint(buyer: Buyer) {
  const area = findPilotArea(`${buyer.city} ${buyer.location}`, { includeNext: true });
  if (area) return { lat: area.lat, lng: area.lng };

  return {
    lat: roundCoordinate(buyer.lat),
    lng: roundCoordinate(buyer.lng),
  };
}

function roundCoordinate(value: number) {
  return Number(value.toFixed(2));
}
