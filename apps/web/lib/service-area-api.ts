import type { ServiceArea } from "./service-areas";

export type ServiceAreaApiResult = {
  bbox: [number, number, number, number];
  center: [number, number];
  city: string | null;
  county: string | null;
  disclaimer: string;
  geojson_path: string;
  geojson_sha256: string | null;
  is_pilot: boolean;
  label: string;
  market_slug: string;
  postal_code: string | null;
  slug: string;
  source: string;
  source_license: string | null;
  source_url: string | null;
  source_version: string;
  state: string;
  type: ServiceArea["type"];
};

export type ServiceAreaSearchResponse = {
  resolution:
    | { status: "none" }
    | { status: "resolved"; area: ServiceAreaApiResult }
    | { status: "ambiguous"; areas: ServiceAreaApiResult[] };
  suggestions: ServiceAreaApiResult[];
};

export function apiResultToServiceArea(result: ServiceAreaApiResult): ServiceArea {
  return {
    active: true,
    bbox: result.bbox,
    center: {
      lat: result.center[1],
      lng: result.center[0],
    },
    city: result.city,
    county: result.county,
    disclaimer: result.disclaimer,
    geojsonPath: result.geojson_path,
    isPilot: result.is_pilot,
    label: result.label,
    marketSlug: result.market_slug,
    postalCode: result.postal_code,
    slug: result.slug,
    source: result.source,
    sourceVersion: result.source_version,
    state: result.state,
    type: result.type,
  };
}

export function resolvedAreaFromSearchPayload(payload: ServiceAreaSearchResponse) {
  return payload.resolution.status === "resolved" ? apiResultToServiceArea(payload.resolution.area) : null;
}

export function hasSearchSuggestions(payload: ServiceAreaSearchResponse) {
  return payload.suggestions.length > 0 || payload.resolution.status === "ambiguous";
}
