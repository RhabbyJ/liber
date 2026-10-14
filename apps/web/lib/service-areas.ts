import {
  createServiceAreaSearchIndex,
  normalizeServiceAreaQuery,
  type ServiceAreaSearchIndex,
} from "./service-area-search";

export type ServiceAreaType = "zip" | "city" | "neighborhood" | "custom";

export type ServiceArea = {
  active: boolean;
  aliases?: string[];
  bbox: [number, number, number, number];
  center: {
    lat: number;
    lng: number;
  };
  city: string | null;
  county: string | null;
  disclaimer: string;
  geojsonPath: string;
  id?: string;
  isPilot: boolean;
  label: string;
  marketSlug?: string;
  postalCode: string | null;
  searchTerms?: string[];
  slug: string;
  source: string;
  sourceVersion: string;
  state: string;
  type: ServiceAreaType;
};

export type Market = {
  active: boolean;
  bbox: [number, number, number, number];
  center: {
    lat: number;
    lng: number;
  };
  country: string;
  label: string;
  slug: string;
  state: string;
};

export const DEFAULT_MARKET_SLUG = "los-angeles";

const serviceAreas: ServiceArea[] = [
  {
    active: true,
    bbox: [-118.370313, 34.142636, -118.279981, 34.221654],
    center: { lat: 34.182145, lng: -118.325147 },
    city: "Burbank",
    county: "Los Angeles County",
    disclaimer: "Approximate Liber service area based on city boundary data.",
    geojsonPath: "/geo/service-areas/city/burbank.geojson",
    isPilot: true,
    label: "Burbank",
    postalCode: null,
    searchTerms: ["burbank", "burbank ca"],
    slug: "burbank",
    source: "city_boundary",
    sourceVersion: "2025",
    state: "CA",
    type: "city",
  },
  {
    active: true,
    bbox: [-118.307812, 34.118761, -118.181583, 34.26719],
    center: { lat: 34.192976, lng: -118.244698 },
    city: "Glendale",
    county: "Los Angeles County",
    disclaimer: "Approximate Liber service area based on city boundary data.",
    geojsonPath: "/geo/service-areas/city/glendale.geojson",
    isPilot: true,
    label: "Glendale",
    postalCode: null,
    searchTerms: ["glendale", "glendale ca"],
    slug: "glendale",
    source: "city_boundary",
    sourceVersion: "2025",
    state: "CA",
    type: "city",
  },
  {
    active: true,
    aliases: ["91316", "91436"],
    bbox: [-118.537387, 34.127695, -118.469641, 34.186627],
    center: { lat: 34.157161, lng: -118.503514 },
    city: "Los Angeles",
    county: "Los Angeles County",
    disclaimer: "Approximate Liber neighborhood service area.",
    geojsonPath: "/geo/service-areas/neighborhood/encino.geojson",
    isPilot: true,
    label: "Encino",
    postalCode: null,
    searchTerms: ["encino", "encino ca", "encino 91316", "encino 91436", "91316", "91436"],
    slug: "encino",
    source: "curated",
    sourceVersion: "manual_v1",
    state: "CA",
    type: "neighborhood",
  },
  {
    active: true,
    aliases: ["91324", "91325"],
    bbox: [-118.571048, 34.208401, -118.501456, 34.259444],
    center: { lat: 34.233923, lng: -118.536252 },
    city: "Los Angeles",
    county: "Los Angeles County",
    disclaimer: "Approximate Liber neighborhood service area.",
    geojsonPath: "/geo/service-areas/neighborhood/northridge.geojson",
    isPilot: true,
    label: "Northridge",
    postalCode: null,
    searchTerms: ["northridge", "northridge ca", "northridge 91324", "northridge 91325", "91324", "91325"],
    slug: "northridge",
    source: "curated",
    sourceVersion: "manual_v1",
    state: "CA",
    type: "neighborhood",
  },
  {
    active: true,
    aliases: ["91356"],
    bbox: [-118.568895, 34.125824, -118.527229, 34.184236],
    center: { lat: 34.15503, lng: -118.548062 },
    city: "Los Angeles",
    county: "Los Angeles County",
    disclaimer: "Approximate Liber neighborhood service area.",
    geojsonPath: "/geo/service-areas/neighborhood/tarzana.geojson",
    isPilot: true,
    label: "Tarzana",
    postalCode: null,
    searchTerms: ["tarzana", "tarzana ca", "tarzana 91356", "91356"],
    slug: "tarzana",
    source: "curated",
    sourceVersion: "manual_v1",
    state: "CA",
    type: "neighborhood",
  },
  {
    active: true,
    bbox: [-118.537387, 34.127995, -118.497769, 34.186627],
    center: { lat: 34.157311, lng: -118.517578 },
    city: "Encino",
    county: "Los Angeles County",
    disclaimer: "Approximate ZIP service area based on Census ZCTA data.",
    geojsonPath: "/geo/service-areas/zip/91316.geojson",
    isPilot: true,
    label: "91316",
    postalCode: "91316",
    searchTerms: ["91316", "encino", "encino ca", "encino 91316"],
    slug: "91316",
    source: "census_zcta",
    sourceVersion: "2020",
    state: "CA",
    type: "zip",
  },
  {
    active: true,
    bbox: [-118.571048, 34.219552, -118.532336, 34.259003],
    center: { lat: 34.239278, lng: -118.551692 },
    city: "Northridge",
    county: "Los Angeles County",
    disclaimer: "Approximate ZIP service area based on Census ZCTA data.",
    geojsonPath: "/geo/service-areas/zip/91324.geojson",
    isPilot: true,
    label: "91324",
    postalCode: "91324",
    searchTerms: ["91324", "northridge", "northridge ca", "northridge 91324"],
    slug: "91324",
    source: "census_zcta",
    sourceVersion: "2020",
    state: "CA",
    type: "zip",
  },
  {
    active: true,
    bbox: [-118.537102, 34.208401, -118.501456, 34.259444],
    center: { lat: 34.233923, lng: -118.519279 },
    city: "Northridge",
    county: "Los Angeles County",
    disclaimer: "Approximate ZIP service area based on Census ZCTA data.",
    geojsonPath: "/geo/service-areas/zip/91325.geojson",
    isPilot: true,
    label: "91325",
    postalCode: "91325",
    searchTerms: ["91325", "northridge", "northridge ca", "northridge 91325"],
    slug: "91325",
    source: "census_zcta",
    sourceVersion: "2020",
    state: "CA",
    type: "zip",
  },
  {
    active: true,
    bbox: [-118.59199, 34.257259, -118.520704, 34.303478],
    center: { lat: 34.280368, lng: -118.556347 },
    city: "Porter Ranch",
    county: "Los Angeles County",
    disclaimer: "Approximate ZIP service area based on Census ZCTA data.",
    geojsonPath: "/geo/service-areas/zip/91326.geojson",
    isPilot: true,
    label: "91326",
    postalCode: "91326",
    searchTerms: ["91326", "porter ranch", "porter ranch ca", "porter ranch 91326"],
    slug: "91326",
    source: "census_zcta",
    sourceVersion: "2020",
    state: "CA",
    type: "zip",
  },
  {
    active: true,
    bbox: [-118.568895, 34.125824, -118.527229, 34.184236],
    center: { lat: 34.15503, lng: -118.548062 },
    city: "Tarzana",
    county: "Los Angeles County",
    disclaimer: "Approximate ZIP service area based on Census ZCTA data.",
    geojsonPath: "/geo/service-areas/zip/91356.geojson",
    isPilot: true,
    label: "91356",
    postalCode: "91356",
    searchTerms: ["91356", "tarzana", "tarzana ca", "tarzana 91356"],
    slug: "91356",
    source: "census_zcta",
    sourceVersion: "2020",
    state: "CA",
    type: "zip",
  },
  {
    active: true,
    bbox: [-118.638446, 34.130383, -118.561392, 34.173325],
    center: { lat: 34.151854, lng: -118.599919 },
    city: "Woodland Hills",
    county: "Los Angeles County",
    disclaimer: "Approximate ZIP service area based on Census ZCTA data.",
    geojsonPath: "/geo/service-areas/zip/91364.geojson",
    isPilot: true,
    label: "91364",
    postalCode: "91364",
    searchTerms: ["91364", "woodland hills", "woodland hills ca", "woodland hills 91364"],
    slug: "91364",
    source: "census_zcta",
    sourceVersion: "2020",
    state: "CA",
    type: "zip",
  },
  {
    active: true,
    bbox: [-118.668163, 34.158817, -118.562201, 34.190895],
    center: { lat: 34.174856, lng: -118.615182 },
    city: "Woodland Hills",
    county: "Los Angeles County",
    disclaimer: "Approximate ZIP service area based on Census ZCTA data.",
    geojsonPath: "/geo/service-areas/zip/91367.geojson",
    isPilot: true,
    label: "91367",
    postalCode: "91367",
    searchTerms: ["91367", "woodland hills", "woodland hills ca", "woodland hills 91367"],
    slug: "91367",
    source: "census_zcta",
    sourceVersion: "2020",
    state: "CA",
    type: "zip",
  },
  {
    active: true,
    bbox: [-118.45586, 34.126725, -118.410769, 34.166675],
    center: { lat: 34.1467, lng: -118.433314 },
    city: "Sherman Oaks",
    county: "Los Angeles County",
    disclaimer: "Approximate ZIP service area based on Census ZCTA data.",
    geojsonPath: "/geo/service-areas/zip/91423.geojson",
    isPilot: true,
    label: "91423",
    postalCode: "91423",
    searchTerms: ["91423", "sherman oaks", "sherman oaks ca", "sherman oaks 91423"],
    slug: "91423",
    source: "census_zcta",
    sourceVersion: "2020",
    state: "CA",
    type: "zip",
  },
  {
    active: true,
    bbox: [-118.512932, 34.127695, -118.469641, 34.180103],
    center: { lat: 34.153899, lng: -118.491287 },
    city: "Encino",
    county: "Los Angeles County",
    disclaimer: "Approximate ZIP service area based on Census ZCTA data.",
    geojsonPath: "/geo/service-areas/zip/91436.geojson",
    isPilot: true,
    label: "91436",
    postalCode: "91436",
    searchTerms: ["91436", "encino", "encino ca", "encino 91436"],
    slug: "91436",
    source: "census_zcta",
    sourceVersion: "2020",
    state: "CA",
    type: "zip",
  },
  {
    active: true,
    bbox: [-118.422502, 34.122436, -118.360915, 34.156636],
    center: { lat: 34.139536, lng: -118.391708 },
    city: "Studio City",
    county: "Los Angeles County",
    disclaimer: "Approximate ZIP service area based on Census ZCTA data.",
    geojsonPath: "/geo/service-areas/zip/91604.geojson",
    isPilot: true,
    label: "91604",
    postalCode: "91604",
    searchTerms: ["91604", "studio city", "studio city ca", "studio city 91604"],
    slug: "91604",
    source: "census_zcta",
    sourceVersion: "2020",
    state: "CA",
    type: "zip",
  },
];

export const activeServiceAreas = serviceAreas.filter((area) => area.active);
export const defaultMarket = marketFromServiceAreas({
  areas: activeServiceAreas,
  country: "US",
  label: "Los Angeles",
  slug: DEFAULT_MARKET_SLUG,
  state: "CA",
});
export type ServiceAreaResolution =
  | { status: "none" }
  | { status: "resolved"; area: ServiceArea }
  | { status: "ambiguous"; areas: ServiceArea[] };

export function normalizeZip(value: string) {
  return value.trim().match(/^(\d{5})(?:-\d{4})?$/)?.[1] ?? "";
}

export function serviceAreaBounds(area: Pick<ServiceArea, "bbox">): [[number, number], [number, number]] {
  const [west, south, east, north] = area.bbox;
  return [
    [west, south],
    [east, north],
  ];
}

export function marketBboxString(market: Pick<Market, "bbox"> = defaultMarket) {
  return market.bbox.join(",");
}

export function findServiceArea(value: string, areas: ServiceArea[] = activeServiceAreas) {
  const resolution = resolveServiceArea(value, areas);
  return resolution.status === "resolved" ? resolution.area : null;
}

export function findServiceAreaBySlug(slug: string, areas: ServiceArea[] = activeServiceAreas) {
  const normalized = slug.trim().toLowerCase();
  if (!normalized) return null;
  return areas.find((area) => area.slug === normalized) ?? null;
}

export function searchServiceAreas(query: string, areas: ServiceArea[] = activeServiceAreas, limit = 8) {
  return fixtureSearchIndex(areas).search(query, limit).suggestions.map((hit) => hit.area);
}

export function resolveServiceArea(query: string, areas: ServiceArea[] = activeServiceAreas): ServiceAreaResolution {
  return fixtureSearchIndex(areas).search(query).resolution;
}

export function serviceAreaDisplayLabel(area: ServiceArea) {
  if (area.type === "zip" && area.city) return `${area.city} ${area.postalCode}`;
  if (area.type === "neighborhood" && area.city) return `${area.label}, ${area.city}`;
  return area.label;
}

/** Name shown on a suggestion row; the context line carries the type and parent area. */
export function serviceAreaShortName(area: Pick<ServiceArea, "label" | "postalCode" | "type">) {
  if (area.type === "zip") return area.postalCode ?? area.label;
  return area.label.replace(/\s*\(unincorporated\)\s*$/i, "");
}

export function serviceAreaContextLabel(
  area: Pick<ServiceArea, "city" | "county" | "type"> & { matchedTerm?: string },
) {
  const county = area.county || "Los Angeles County";
  if (area.type === "zip") {
    const place = area.matchedTerm?.replace(/\b(ca|\d{5})\b/g, "").trim();
    return place && /[a-z]/.test(place) ? `ZIP code · ${titleCase(place)}` : "ZIP code · approximate area";
  }
  if (area.type === "city") return `City · ${county}`;
  if (area.type === "neighborhood") return area.city ? `Neighborhood · ${area.city}` : `Unincorporated community · ${county}`;
  return "Service area";
}

function titleCase(value: string) {
  return value.replace(/\s+/g, " ").replace(/\b[a-z]/g, (letter) => letter.toUpperCase());
}

export function serviceAreaSearchTerms(area: Pick<ServiceArea, "aliases" | "searchTerms">) {
  return [...(area.searchTerms ?? []), ...(area.aliases ?? [])];
}

export function normalizeServiceAreaSearchTerm(value: string) {
  return normalizeServiceAreaQuery(value);
}

const fixtureSearchIndexes = new WeakMap<ServiceArea[], ServiceAreaSearchIndex<ServiceArea>>();

function fixtureSearchIndex(areas: ServiceArea[]) {
  let index = fixtureSearchIndexes.get(areas);
  if (!index) {
    index = createServiceAreaSearchIndex(areas.map((area) => ({ area, terms: serviceAreaSearchTerms(area) })));
    fixtureSearchIndexes.set(areas, index);
  }
  return index;
}

function marketFromServiceAreas({
  areas,
  country,
  label,
  slug,
  state,
}: {
  areas: ServiceArea[];
  country: string;
  label: string;
  slug: string;
  state: string;
}): Market {
  if (areas.length === 0) {
    throw new Error("A fixture market requires at least one service area.");
  }

  const bbox = areas.reduce<[number, number, number, number]>(
    ([west, south, east, north], area) => [
      Math.min(west, area.bbox[0]),
      Math.min(south, area.bbox[1]),
      Math.max(east, area.bbox[2]),
      Math.max(north, area.bbox[3]),
    ],
    [Infinity, Infinity, -Infinity, -Infinity],
  );
  return {
    active: true,
    bbox,
    center: {
      lat: (bbox[1] + bbox[3]) / 2,
      lng: (bbox[0] + bbox[2]) / 2,
    },
    country,
    label,
    slug,
    state,
  };
}
