import { describe, expect, it } from "vitest";
import { buyers } from "./mock-data";
import { mapboxServiceAreaQueries, mapPinPosition } from "./mapbox";

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

  it("keeps map pin positions within the visible map bounds", () => {
    const position = mapPinPosition(buyers[0], buyers);

    expect(position).not.toBeNull();
    if (!position) return;
    expect(position.left).toBeGreaterThanOrEqual(8);
    expect(position.left).toBeLessThanOrEqual(92);
    expect(position.top).toBeGreaterThanOrEqual(8);
    expect(position.top).toBeLessThanOrEqual(92);
  });

  it("does not place buyers without canonical service-area geography", () => {
    expect(mapPinPosition(buyers[2], buyers)).toBeNull();
  });
});
