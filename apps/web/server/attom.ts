import { normalizeZip } from "../lib/service-areas";

export type PropertyFacts = {
  addressLine1?: string;
  bathrooms?: number;
  bedrooms?: number;
  city?: string;
  lat?: number;
  lng?: number;
  lotSize?: number;
  squareFeet?: number;
  state?: string;
  zip?: string;
};

type PropertyLookupInput = {
  addressLine1: string;
  city?: string;
  market: string;
  state?: string;
  zip: string;
};

export async function enrichPropertyByAddress(input: PropertyLookupInput) {
  const zip = normalizeZip(input.zip);
  const { getActiveServiceAreaBySlug } = await import("./service-areas");
  const serviceArea = zip ? await getActiveServiceAreaBySlug(zip, input.market) : null;
  if (!serviceArea || serviceArea.type !== "zip") {
    return {
      error: "Property lookup is limited to active service-area ZIPs.",
      property: null,
      status: 422,
    };
  }

  const apiKey = process.env.ATTOM_API_KEY;
  if (!apiKey) {
    return { error: "ATTOM is not configured.", property: null, status: 503 };
  }

  const address2 = [input.city, input.state, zip].filter(Boolean).join(", ");
  const params = new URLSearchParams({
    address1: input.addressLine1,
    address2,
  });

  const response = await fetch(`${attomBaseUrl()}/property/basicprofile?${params}`, {
    cache: "no-store",
    headers: {
      Accept: "application/json",
      apikey: apiKey,
    },
  });

  if (!response.ok) {
    return { error: "ATTOM property lookup failed.", property: null, status: 502 };
  }

  const payload = await response.json();
  const property = Array.isArray(payload?.property) ? payload.property[0] : null;
  if (!property) {
    return { error: "No ATTOM property match was found.", property: null, status: 404 };
  }

  return { error: null, property: mapAttomProperty(property), status: 200 };
}

export function mapAttomProperty(property: Record<string, any>): PropertyFacts {
  const address = property.address ?? {};
  const location = property.location ?? {};
  const building = property.building ?? {};
  const rooms = building.rooms ?? {};
  const size = building.size ?? {};
  const lot = property.lot ?? {};

  return {
    addressLine1: firstString(address.line1, address.oneLine),
    bathrooms: firstInteger(rooms.bathstotal, rooms.bathsTotal, rooms.bathscalc),
    bedrooms: firstInteger(rooms.beds, rooms.bedrooms),
    city: firstString(address.locality),
    lat: firstNumber(location.latitude),
    lng: firstNumber(location.longitude),
    lotSize: firstInteger(lot.lotsizesqft, lot.lotSizeSqFt, lot.lotsize2),
    squareFeet: firstInteger(size.livingsize, size.universalsize, size.bldgsize, size.grosssize),
    state: firstString(address.countrySubd),
    zip: normalizeZip(firstString(address.postal1, address.postal) ?? ""),
  };
}

function attomBaseUrl() {
  const raw = (process.env.ATTOM_BASE_URL || "https://api.gateway.attomdata.com").replace(/\/$/, "");
  return raw.includes("/propertyapi/") ? raw : `${raw}/propertyapi/v1.0.0`;
}

function firstString(...values: unknown[]) {
  const value = values.find((item) => typeof item === "string" && item.trim());
  return typeof value === "string" ? value.trim() : undefined;
}

function firstNumber(...values: unknown[]) {
  for (const value of values) {
    const number = Number(value);
    if (Number.isFinite(number)) return number;
  }
  return undefined;
}

function firstInteger(...values: unknown[]) {
  const value = values.map(Number).find((item) => Number.isFinite(item) && item > 0);
  return value === undefined ? undefined : Math.round(value);
}
