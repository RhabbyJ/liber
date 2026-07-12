import { describe, expect, it } from "vitest";
import { marketMapInstanceKey, selectedMapArea } from "./map-area";

const market = {
  bbox: [-118.7, 33.7, -117.6, 34.9] as [number, number, number, number],
  center: { lat: 34.2, lng: -118.15 },
  label: "Los Angeles County",
  slug: "los-angeles",
};

describe("map instance identity", () => {
  it("stays stable across ordinary result/filter changes and changes with market identity", () => {
    expect(marketMapInstanceKey(market, "renderer-token")).toBe(marketMapInstanceKey({ ...market }, "renderer-token"));
    expect(marketMapInstanceKey({ ...market, label: "Display label only" }, "renderer-token")).toBe(
      marketMapInstanceKey(market, "renderer-token"),
    );
    expect(marketMapInstanceKey({ ...market, slug: "orange-county" }, "renderer-token")).not.toBe(
      marketMapInstanceKey(market, "renderer-token"),
    );
  });

  it("preserves the exact versioned geometry path for selected areas", () => {
    const baseArea = {
      active: true,
      bbox: market.bbox,
      center: market.center,
      city: null,
      county: "Los Angeles County",
      disclaimer: "Approximate area",
      geojsonPath: "/api/service-areas/downtown/geometry?market=los-angeles",
      id: "la-downtown",
      isPilot: false,
      label: "Downtown",
      marketSlug: "los-angeles",
      postalCode: null,
      slug: "downtown",
      source: "reviewed",
      sourceVersion: "v1",
      state: "CA",
      type: "neighborhood" as const,
    };
    expect(selectedMapArea(baseArea)).toEqual({
      bbox: baseArea.bbox,
      center: baseArea.center,
      geojsonPath: baseArea.geojsonPath,
      label: baseArea.label,
    });
    expect(selectedMapArea({
      ...baseArea,
      geojsonPath: "/api/service-areas/downtown/geometry?market=san-diego",
      id: "sd-downtown",
      marketSlug: "san-diego",
    })).toMatchObject({ geojsonPath: "/api/service-areas/downtown/geometry?market=san-diego" });
  });
});
