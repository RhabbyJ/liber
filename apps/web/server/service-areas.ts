import { Prisma, prisma } from "@liber/db";
import {
  DEFAULT_MARKET_SLUG,
  activeServiceAreas,
  defaultMarket,
  marketBboxString,
  normalizeServiceAreaSearchTerm,
  resolveServiceArea,
  searchServiceAreas,
  type Market,
  type ServiceArea,
} from "../lib/service-areas";

type DbMarket = {
  active: boolean;
  bboxEast: number;
  bboxNorth: number;
  bboxSouth: number;
  bboxWest: number;
  centerLat: number;
  centerLng: number;
  country: string;
  currentDisplayGeometry: { sha256: string } | null;
  id: string;
  label: string;
  slug: string;
  state: string;
};

type DbServiceArea = {
  active: boolean;
  bboxEast: number;
  bboxNorth: number;
  bboxSouth: number;
  bboxWest: number;
  centerLat: number;
  centerLng: number;
  city: string | null;
  county: string | null;
  currentGeometry: { sha256: string } | null;
  geojsonPath: string;
  geojsonSha256: string | null;
  id: string;
  isPilot: boolean;
  label: string;
  market: { slug: string };
  postalCode: string | null;
  searchTerms: string[];
  slug: string;
  source: string;
  sourceLicense: string | null;
  sourceUrl: string | null;
  sourceVersion: string;
  state: string;
  type: string;
};

export type ServiceAreaResult = ServiceArea & {
  id: string;
  marketSlug: string;
  sourceLicense?: string | null;
  sourceUrl?: string | null;
  geojsonSha256?: string | null;
};

export type ServiceAreaResultResolution =
  | { status: "none" }
  | { status: "resolved"; area: ServiceAreaResult }
  | { status: "ambiguous"; areas: ServiceAreaResult[] };

export class GeographyUnavailableError extends Error {
  constructor(message = "Liber service-area data is temporarily unavailable.", options?: ErrorOptions) {
    super(message, options);
    this.name = "GeographyUnavailableError";
  }
}

function fixtureFallbackEnabled() {
  if (process.env.NODE_ENV === "production") return false;
  return process.env.NODE_ENV === "test" || process.env.LIBER_USE_SERVICE_AREA_FIXTURES === "true";
}

function logGeographyFailure(operation: string, error: unknown) {
  console.error(`[geography] ${operation} failed`, error instanceof Error ? error.message : "Unknown database error");
}

export async function getActiveMarketBySlug(slug: string): Promise<Market> {
  try {
    const row = await prisma.market.findFirst({
      where: { active: true, slug },
      include: { currentDisplayGeometry: { select: { sha256: true } } },
    });
    if (row) return dbMarketToResult(row);
    if (fixtureFallbackEnabled() && slug === DEFAULT_MARKET_SLUG) return defaultMarket;
    throw new GeographyUnavailableError("That Liber market is not active.");
  } catch (error) {
    if (error instanceof GeographyUnavailableError) throw error;
    logGeographyFailure("get active market", error);
    if (fixtureFallbackEnabled() && slug === DEFAULT_MARKET_SLUG) return defaultMarket;
    throw new GeographyUnavailableError(undefined, { cause: error });
  }
}

export async function getActiveMarketOrFallback(preferredSlug?: string): Promise<Market> {
  try {
    const rows = await prisma.market.findMany({
      where: { active: true },
      include: { currentDisplayGeometry: { select: { sha256: true } } },
      orderBy: { slug: "asc" },
    });
    const row = rows.find((market) => market.slug === preferredSlug) ?? rows[0];
    if (row) return dbMarketToResult(row);
    if (fixtureFallbackEnabled()) return defaultMarket;
    throw new GeographyUnavailableError("Liber has no active market available.");
  } catch (error) {
    if (error instanceof GeographyUnavailableError) throw error;
    logGeographyFailure("get active market fallback", error);
    if (fixtureFallbackEnabled()) return defaultMarket;
    throw new GeographyUnavailableError(undefined, { cause: error });
  }
}

export function marketApiShape(market: Market) {
  return {
    slug: market.slug,
    label: market.label,
    state: market.state,
    country: market.country,
    center: [market.center.lng, market.center.lat] as [number, number],
    bbox: market.bbox,
    boundary_geojson_path: market.boundaryGeojsonPath ?? null,
  };
}

export async function getActiveMarketDisplayGeometryBySlug(slug: string, sha256?: string) {
  try {
    const market = await prisma.market.findFirst({
      where: { active: true, slug },
      select: {
        id: true,
        currentDisplayGeometry: { select: { geojson: true, sha256: true } },
      },
    });
    if (!market) return null;
    if (!sha256) return market.currentDisplayGeometry;
    return prisma.marketDisplayGeometryVersion.findFirst({
      where: { marketId: market.id, sha256 },
      select: { geojson: true, sha256: true },
    });
  } catch (error) {
    logGeographyFailure("get active market display geometry", error);
    throw new GeographyUnavailableError(undefined, { cause: error });
  }
}

export function marketBboxParam(market: Market) {
  return marketBboxString(market);
}

export async function listActiveServiceAreas(marketSlug: string): Promise<ServiceAreaResult[]> {
  try {
    const rows = await prisma.serviceArea.findMany({
      where: { active: true, market: { active: true, slug: marketSlug } },
      include: {
        currentGeometry: { select: { sha256: true } },
        market: { select: { slug: true } },
      },
      orderBy: [{ type: "asc" }, { slug: "asc" }],
    });
    return rows.map(dbServiceAreaToResult);
  } catch (error) {
    logGeographyFailure("list active service areas", error);
    if (fixtureFallbackEnabled() && marketSlug === DEFAULT_MARKET_SLUG) return fixtureServiceAreas();
    throw new GeographyUnavailableError(undefined, { cause: error });
  }
}

export async function getActiveServiceAreaBySlug(slug: string, marketSlug: string) {
  try {
    const row = await prisma.serviceArea.findFirst({
      where: { active: true, slug, market: { active: true, slug: marketSlug } },
      include: {
        currentGeometry: { select: { sha256: true } },
        market: { select: { slug: true } },
      },
    });
    if (row) return dbServiceAreaToResult(row);
    if (fixtureFallbackEnabled() && marketSlug === DEFAULT_MARKET_SLUG) {
      return fixtureServiceAreas().find((area) => area.slug === slug) ?? null;
    }
    return null;
  } catch (error) {
    logGeographyFailure("get active service area", error);
    if (fixtureFallbackEnabled() && marketSlug === DEFAULT_MARKET_SLUG) {
      return fixtureServiceAreas().find((area) => area.slug === slug) ?? null;
    }
    throw new GeographyUnavailableError(undefined, { cause: error });
  }
}

export async function getActiveServiceAreaGeometryBySlug(slug: string, marketSlug: string, sha256?: string) {
  try {
    const row = await prisma.serviceArea.findFirst({
      where: { active: true, slug, market: { active: true, slug: marketSlug } },
      select: { id: true, currentGeometry: { select: { geojson: true, sha256: true } } },
    });
    if (!row) return null;
    if (!sha256) return row.currentGeometry;
    return prisma.serviceAreaGeometryVersion.findFirst({
      where: { serviceAreaId: row.id, sha256 },
      select: { geojson: true, sha256: true },
    });
  } catch (error) {
    logGeographyFailure("get active service-area geometry", error);
    throw new GeographyUnavailableError(undefined, { cause: error });
  }
}

export async function getSearchCoverageServiceAreaIds(serviceAreaId: string, marketSlug: string) {
  try {
    const rows = await prisma.$queryRaw<Array<{ id: string }>>(Prisma.sql`
      WITH RECURSIVE coverage(id) AS (
        SELECT service_area.id
        FROM public.service_areas service_area
        JOIN public.markets market ON market.id = service_area.market_id
        WHERE service_area.id = ${serviceAreaId}::uuid
          AND service_area.active = true
          AND market.active = true
          AND market.slug = ${marketSlug}
        UNION
        SELECT relationship.child_service_area_id
        FROM public.service_area_relationships relationship
        JOIN coverage parent ON parent.id = relationship.parent_service_area_id
        JOIN public.service_areas child ON child.id = relationship.child_service_area_id
        JOIN public.markets market ON market.id = child.market_id
        WHERE relationship.relation_type = 'SEARCH_ROLLUP'
          AND relationship.reviewed_at IS NOT NULL
          AND child.active = true
          AND market.active = true
          AND market.slug = ${marketSlug}
      )
      SELECT id FROM coverage
    `);
    return rows.map((row) => row.id);
  } catch (error) {
    logGeographyFailure("resolve service-area search rollups", error);
    throw new GeographyUnavailableError(undefined, { cause: error });
  }
}

export async function searchActiveServiceAreas(query: string, limit: number, marketSlug: string) {
  const lookup = await lookupActiveServiceAreas(query, limit, marketSlug);
  return lookup.map(({ area }) => area);
}

export async function resolveActiveServiceArea(query: string, marketSlug: string): Promise<ServiceAreaResultResolution> {
  const lookup = await lookupActiveServiceAreas(query, 8, marketSlug);
  return resolutionFromLookup(lookup.filter((row) => row.exactMatch).map((row) => row.area));
}

export async function searchAndResolveActiveServiceAreas(query: string, limit: number, marketSlug: string) {
  if (!normalizeServiceAreaSearchTerm(query)) {
    return {
      resolution: { status: "none" } as ServiceAreaResultResolution,
      suggestions: [] as ServiceAreaResult[],
    };
  }
  const lookup = await lookupActiveServiceAreas(query, limit, marketSlug);
  return {
    resolution: resolutionFromLookup(lookup.filter((row) => row.exactMatch).map((row) => row.area)),
    suggestions: lookup.map((row) => row.area),
  };
}

export function serviceAreaApiShape(area: ServiceAreaResult) {
  return {
    slug: area.slug,
    label: area.label,
    type: area.type,
    city: area.city,
    county: area.county,
    state: area.state,
    postal_code: area.postalCode,
    center: [area.center.lng, area.center.lat] as [number, number],
    bbox: area.bbox,
    geojson_path: area.geojsonPath,
    geojson_sha256: area.geojsonSha256 ?? null,
    source: area.source,
    source_version: area.sourceVersion,
    source_license: area.sourceLicense ?? null,
    source_url: area.sourceUrl ?? null,
    disclaimer: area.disclaimer,
    is_pilot: area.isPilot,
    market_slug: area.marketSlug,
  };
}

export function serviceAreaResolutionApiShape(resolution: ServiceAreaResultResolution) {
  if (resolution.status === "resolved") {
    return { status: resolution.status, area: serviceAreaApiShape(resolution.area) };
  }
  if (resolution.status === "ambiguous") {
    return { status: resolution.status, areas: resolution.areas.map(serviceAreaApiShape) };
  }
  return { status: resolution.status };
}

function dbServiceAreaToResult(row: DbServiceArea): ServiceAreaResult {
  const geometrySha256 = row.currentGeometry?.sha256 ?? row.geojsonSha256;
  return {
    active: row.active,
    bbox: [row.bboxWest, row.bboxSouth, row.bboxEast, row.bboxNorth],
    center: { lat: row.centerLat, lng: row.centerLng },
    city: row.city,
    county: row.county,
    disclaimer: serviceAreaDisclaimer(row),
    geojsonPath: row.currentGeometry?.sha256
      ? `/api/service-areas/${encodeURIComponent(row.slug)}/geometry?market=${encodeURIComponent(row.market.slug)}&v=${row.currentGeometry.sha256}`
      : row.geojsonPath,
    geojsonSha256: geometrySha256,
    id: row.id,
    isPilot: row.isPilot,
    label: row.label,
    marketSlug: row.market.slug,
    postalCode: row.postalCode,
    searchTerms: row.searchTerms,
    slug: row.slug,
    source: row.source,
    sourceLicense: row.sourceLicense,
    sourceUrl: row.sourceUrl,
    sourceVersion: row.sourceVersion,
    state: row.state,
    type: serviceAreaType(row.type),
  };
}

async function lookupActiveServiceAreas(query: string, limit: number, marketSlug: string) {
  const normalized = normalizeServiceAreaSearchTerm(query);
  if (!normalized) return [];
  try {
    const rows = await prisma.$queryRaw<Array<{ exact_match: boolean; service_area_id: string }>>(Prisma.sql`
      SELECT service_area_id::text, exact_match
      FROM geography_admin.search_active_service_areas(
        ${marketSlug}, ${normalized}, ${Math.min(Math.max(limit, 1), 8)}
      )
    `);
    if (rows.length === 0) return [];
    const areas = await prisma.serviceArea.findMany({
      where: {
        id: { in: rows.map((row) => row.service_area_id) },
        active: true,
        market: { active: true, slug: marketSlug },
      },
      include: {
        currentGeometry: { select: { sha256: true } },
        market: { select: { slug: true } },
      },
    });
    const areaById = new Map(areas.map((area) => [area.id, dbServiceAreaToResult(area)]));
    return rows.flatMap((row) => {
      const area = areaById.get(row.service_area_id);
      return area ? [{ area, exactMatch: row.exact_match }] : [];
    });
  } catch (error) {
    logGeographyFailure("indexed service-area lookup", error);
    if (fixtureFallbackEnabled() && marketSlug === DEFAULT_MARKET_SLUG) {
      const fixtures = fixtureServiceAreas();
      const suggestions = searchServiceAreas(query, fixtures, limit) as ServiceAreaResult[];
      const resolution = resolveServiceArea(query, fixtures);
      const exactIds = new Set(resolution.status === "resolved"
        ? [resolution.area.id]
        : resolution.status === "ambiguous" ? resolution.areas.map((area) => area.id) : []);
      return suggestions.map((area) => ({ area, exactMatch: exactIds.has(area.id) }));
    }
    throw new GeographyUnavailableError(undefined, { cause: error });
  }
}

function resolutionFromLookup(areas: ServiceAreaResult[]): ServiceAreaResultResolution {
  if (areas.length === 0) return { status: "none" };
  if (areas.length === 1) return { status: "resolved", area: areas[0] };
  return { status: "ambiguous", areas };
}

function dbMarketToResult(row: DbMarket): Market {
  return {
    active: row.active,
    bbox: [row.bboxWest, row.bboxSouth, row.bboxEast, row.bboxNorth],
    boundaryGeojsonPath: row.currentDisplayGeometry?.sha256
      ? `/api/markets/${encodeURIComponent(row.slug)}/boundaries?v=${row.currentDisplayGeometry.sha256}`
      : undefined,
    center: { lat: row.centerLat, lng: row.centerLng },
    country: row.country,
    label: row.label,
    slug: row.slug,
    state: row.state,
  };
}

function fixtureServiceAreas(): ServiceAreaResult[] {
  return activeServiceAreas.map((area) => ({
    ...area,
    id: `fixture:${area.slug}`,
    marketSlug: area.marketSlug ?? DEFAULT_MARKET_SLUG,
  }));
}

function serviceAreaDisclaimer(row: Pick<DbServiceArea, "type">) {
  if (row.type === "zip") return "Approximate ZIP service area based on Census ZCTA data.";
  if (row.type === "neighborhood") return "Approximate Los Angeles County statistical community service area.";
  return "Approximate Liber service area.";
}

function serviceAreaType(value: string): ServiceArea["type"] {
  if (value === "zip" || value === "city" || value === "neighborhood" || value === "custom") return value;
  return "custom";
}
