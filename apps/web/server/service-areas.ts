import { prisma } from "@liber/db";
import {
  activeServiceAreas,
  findServiceAreaBySlug,
  searchServiceAreas as searchStaticServiceAreas,
  type ServiceArea,
} from "../lib/service-areas";

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
  geojsonPath: string;
  id: string;
  isPilot: boolean;
  label: string;
  postalCode: string | null;
  slug: string;
  source: string;
  sourceVersion: string;
  state: string;
  type: string;
};

export type ServiceAreaResult = ServiceArea & {
  id?: string;
};

export async function listActiveServiceAreas(): Promise<ServiceAreaResult[]> {
  try {
    const rows = await prisma.serviceArea.findMany({
      where: { active: true },
      orderBy: [{ type: "asc" }, { slug: "asc" }],
    });

    return rows.map(dbServiceAreaToResult);
  } catch {
    return activeServiceAreas;
  }
}

export async function getActiveServiceAreaBySlug(slug: string) {
  try {
    const row = await prisma.serviceArea.findFirst({
      where: { active: true, slug },
    });

    return row ? dbServiceAreaToResult(row) : null;
  } catch {
    return findServiceAreaBySlug(slug);
  }
}

export async function searchActiveServiceAreas(query: string, limit = 8) {
  const areas = await listActiveServiceAreas();
  return searchStaticServiceAreas(query, areas, limit);
}

export function serviceAreaApiShape(area: ServiceAreaResult) {
  return {
    id: area.id ?? null,
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
    source: area.source,
    source_version: area.sourceVersion,
    disclaimer: area.disclaimer,
    is_pilot: area.isPilot,
  };
}

function dbServiceAreaToResult(row: DbServiceArea): ServiceAreaResult {
  return {
    active: row.active,
    bbox: [row.bboxWest, row.bboxSouth, row.bboxEast, row.bboxNorth],
    center: {
      lat: row.centerLat,
      lng: row.centerLng,
    },
    city: row.city,
    county: row.county,
    disclaimer: serviceAreaDisclaimer(row),
    geojsonPath: row.geojsonPath,
    id: row.id,
    isPilot: row.isPilot,
    label: row.label,
    postalCode: row.postalCode,
    slug: row.slug,
    source: row.source,
    sourceVersion: row.sourceVersion,
    state: row.state === "CA" ? "CA" : "CA",
    type: serviceAreaType(row.type),
  };
}

function serviceAreaDisclaimer(row: Pick<DbServiceArea, "source" | "type">) {
  if (row.source === "census_zcta") return "Approximate ZIP service area based on Census ZCTA data.";
  if (row.type === "neighborhood") return "Approximate Liber neighborhood service area.";
  return "Approximate Liber service area.";
}

function serviceAreaType(value: string): ServiceArea["type"] {
  if (value === "zip" || value === "city" || value === "neighborhood" || value === "custom") return value;
  return "custom";
}
