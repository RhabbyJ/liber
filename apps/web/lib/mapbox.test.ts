import { describe, expect, it } from "vitest";
import type { SellerBuyerSearchDto } from "./buyer-dto-types";
import { mapboxServiceAreaQueries, mapPinPosition } from "./mapbox";

const buyers = [
  { mapPoint: { latitude: 34.233923, longitude: -118.519279 } },
  { mapPoint: { latitude: 34.1467, longitude: -118.433314 } },
] as SellerBuyerSearchDto[];

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
});
