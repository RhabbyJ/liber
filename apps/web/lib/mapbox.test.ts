import { describe, expect, it } from "vitest";
import { buyers } from "./mock-data";
import { mapboxStaticImageUrl, mapPinPosition } from "./mapbox";

describe("Mapbox static map helpers", () => {
  it("returns null when no token is configured", () => {
    expect(mapboxStaticImageUrl(buyers, "")).toBeNull();
  });

  it("builds a static image URL with buyer markers when a token is configured", () => {
    const url = mapboxStaticImageUrl(buyers, "test-token");

    expect(url).toContain("https://api.mapbox.com/styles/v1/mapbox/light-v11/static/");
    expect(url).toContain("pin-s-1+116149(-118.53010,34.23810)");
    expect(url).toContain("access_token=test-token");
  });

  it("keeps map pin positions within the visible map bounds", () => {
    const position = mapPinPosition(buyers[0], buyers);

    expect(position.left).toBeGreaterThanOrEqual(8);
    expect(position.left).toBeLessThanOrEqual(92);
    expect(position.top).toBeGreaterThanOrEqual(8);
    expect(position.top).toBeLessThanOrEqual(92);
  });
});
