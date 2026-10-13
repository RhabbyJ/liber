import { describe, expect, it } from "vitest";
import { mapboxServiceAreaQueries } from "./mapbox";

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

});
