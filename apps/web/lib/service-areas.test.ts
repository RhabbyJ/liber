import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { activeServiceAreas, findServiceArea, searchServiceAreas } from "./service-areas";

const publicRoot = path.resolve(process.cwd(), "public");

describe("service area metadata", () => {
  it("finds ZIP, neighborhood, and city service areas", () => {
    expect(findServiceArea("91325")?.slug).toBe("91325");
    expect(findServiceArea("Northridge")?.slug).toBe("northridge");
    expect(findServiceArea("Tarzana")?.slug).toBe("tarzana");
    expect(findServiceArea("Glendale")?.slug).toBe("glendale");
    expect(findServiceArea("San Diego")).toBeNull();
  });

  it("prioritizes exact postal-code matches over neighborhood aliases", () => {
    expect(searchServiceAreas("91325").map((area) => area.slug)[0]).toBe("91325");
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
      expect(["Polygon", "MultiPolygon"], area.slug).toContain(feature?.geometry?.type);
      expect(area.bbox[0], area.slug).toBeLessThan(area.bbox[2]);
      expect(area.bbox[1], area.slug).toBeLessThan(area.bbox[3]);
    }
  });
});
