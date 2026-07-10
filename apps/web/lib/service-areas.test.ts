import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import {
  DEFAULT_MARKET_SLUG,
  activeServiceAreas,
  defaultMarket,
  findServiceArea,
  marketBboxString,
  normalizeZip,
  resolveServiceArea,
  searchServiceAreas,
  serviceAreaDisplayLabel,
} from "./service-areas";

const publicRoot = path.resolve(process.cwd(), "public");

describe("service area metadata", () => {
  it("normalizes only typed ZIP values, not five-digit address substrings", () => {
    expect(normalizeZip("91604-1234")).toBe("91604");
    expect(normalizeZip("12345 Ventura Blvd, CA 91604")).toBe("");
  });

  it("finds ZIP, neighborhood, and city service areas", () => {
    expect(findServiceArea("91325")?.slug).toBe("91325");
    expect(findServiceArea("Northridge")?.slug).toBe("northridge");
    expect(findServiceArea("Tarzana")?.slug).toBe("tarzana");
    expect(findServiceArea("Glendale")?.slug).toBe("glendale");
    expect(findServiceArea("Studio City")?.slug).toBe("91604");
    expect(findServiceArea("San Diego")).toBeNull();
  });

  it("prioritizes exact postal-code matches over neighborhood aliases", () => {
    expect(searchServiceAreas("91325").map((area) => area.slug)[0]).toBe("91325");
    expect(searchServiceAreas("Studio City").map((area) => area.slug)[0]).toBe("91604");
  });

  it("keeps prefix suggestions separate from exact resolution", () => {
    expect(resolveServiceArea("stu").status).toBe("none");
    expect(searchServiceAreas("stu").map((area) => area.slug)).toEqual(["91604"]);
  });

  it("does not resolve broad geography words as canonical service areas", () => {
    expect(findServiceArea("city")).toBeNull();
    expect(findServiceArea("CA")).toBeNull();
    expect(findServiceArea("Los Angeles County")).toBeNull();
  });

  it("does not silently resolve ambiguous multi-area terms", () => {
    const resolution = resolveServiceArea("Woodland Hills");

    expect(resolution.status).toBe("ambiguous");
    expect(findServiceArea("Woodland Hills")).toBeNull();
    expect(findServiceArea("Woodland Hills 91364")?.slug).toBe("91364");
    expect(searchServiceAreas("Woodland Hills").map((area) => area.slug)).toEqual(["91364", "91367"]);
  });

  it("keeps same-name city and community suggestions distinguishable", () => {
    const city = { ...activeServiceAreas[0], label: "Arcadia", type: "city" as const };
    const community = {
      ...activeServiceAreas[0],
      city: null,
      label: "Arcadia (Unincorporated)",
      type: "neighborhood" as const,
    };
    expect(serviceAreaDisplayLabel(city)).toBe("Arcadia");
    expect(serviceAreaDisplayLabel(community)).toBe("Arcadia (Unincorporated)");
  });

  it("derives active market bounds from service-area metadata", () => {
    expect(defaultMarket.slug).toBe(DEFAULT_MARKET_SLUG);
    expect(defaultMarket.bbox).toEqual([-118.668163, 34.118761, -118.181583, 34.303478]);
    expect(marketBboxString()).toBe("-118.668163,34.118761,-118.181583,34.303478");
  });

  it("has a matching valid GeoJSON file for every active service area", () => {
    for (const area of activeServiceAreas) {
      const filePath = path.join(publicRoot, area.geojsonPath.replace(/^\//, ""));
      const geojson = JSON.parse(readFileSync(filePath, "utf8"));
      const feature = geojson.features?.[0];

      expect(geojson.type, area.slug).toBe("FeatureCollection");
      expect(feature?.properties?.slug, area.slug).toBe(area.slug);
      expect(feature?.properties?.type, area.slug).toBe(area.type);
      expect(feature?.properties?.source, area.slug).toBe(area.source);
      expect(feature?.properties?.source_version, area.slug).toBe(area.sourceVersion);
      expect(["Polygon", "MultiPolygon"], area.slug).toContain(feature?.geometry?.type);
      expect(area.marketSlug ?? DEFAULT_MARKET_SLUG, area.slug).toBe(DEFAULT_MARKET_SLUG);
      expect(area.bbox[0], area.slug).toBeLessThan(area.bbox[2]);
      expect(area.bbox[1], area.slug).toBeLessThan(area.bbox[3]);
      expect(computeGeometryBbox(feature?.geometry), area.slug).toEqual(area.bbox);
    }
  });
});

function computeGeometryBbox(geometry: any) {
  const positions: Array<[number, number]> = [];
  collectPositions(geometry?.coordinates, positions);
  const lngs = positions.map(([lng]) => lng);
  const lats = positions.map(([, lat]) => lat);

  return [
    roundCoordinate(Math.min(...lngs)),
    roundCoordinate(Math.min(...lats)),
    roundCoordinate(Math.max(...lngs)),
    roundCoordinate(Math.max(...lats)),
  ];
}

function collectPositions(value: unknown, positions: Array<[number, number]>) {
  if (!Array.isArray(value)) return;
  if (typeof value[0] === "number" && typeof value[1] === "number") {
    positions.push([value[0], value[1]]);
    return;
  }
  value.forEach((item) => collectPositions(item, positions));
}

function roundCoordinate(value: number) {
  return Number(value.toFixed(6));
}
