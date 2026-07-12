import { describe, expect, it } from "vitest";
import { geoJsonForKey, type KeyedGeoJsonState } from "./use-keyed-geojson";

describe("keyed GeoJSON state", () => {
  it("does not expose geometry retained from a previous request key", () => {
    const areaA = { type: "FeatureCollection", features: [{ properties: { slug: "area-a" } }] };
    const state: KeyedGeoJsonState = { data: areaA, key: "los-angeles:area-a:v1" };

    expect(geoJsonForKey(state, "los-angeles:area-a:v1")).toBe(areaA);
    expect(geoJsonForKey(state, "los-angeles:area-b:v2")).toBeNull();
  });
});
