import { describe, expect, it } from "vitest";
import { buyers } from "./mock-data";
import { mapboxServiceAreaQueries, mapboxStaticImageUrl, mapPinPosition } from "./mapbox";

describe("Mapbox static map helpers", () => {
  it("uses typed postcode metadata instead of five-digit house numbers", () => {
    expect(mapboxServiceAreaQueries({
      properties: {
        context: { place: { name: "Studio City" }, postcode: { name: "91604" } },
        feature_type: "address",
        full_address: "12345 Ventura Blvd, Studio City, CA 91604",
        name: "12345",
      },
    })).toEqual(["91604", "Studio City"]);
  });

  it("returns null when no token is configured", () => {
    expect(mapboxStaticImageUrl(buyers, "")).toBeNull();
  });

  it("builds a static image URL with buyer markers when a token is configured", () => {
    const url = mapboxStaticImageUrl(buyers, "test-token");

    expect(url).toContain("https://api.mapbox.com/styles/v1/mapbox/light-v11/static/");
    expect(url).toContain("pin-s-1+116149(-118.51928,34.23392)");
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
