import { describe, expect, it } from "vitest";
import { mapAttomProperty } from "./attom";

describe("ATTOM property mapper", () => {
  it("maps basic profile property facts into seller-editable fields", () => {
    expect(
      mapAttomProperty({
        address: {
          countrySubd: "CA",
          line1: "123 Main St",
          locality: "Sherman Oaks",
          postal1: "91423",
        },
        building: {
          rooms: { bathstotal: "2", beds: "4" },
          size: { livingsize: "2140" },
        },
        location: { latitude: "34.148", longitude: "-118.432" },
        lot: { lotsizesqft: "7200" },
      }),
    ).toMatchObject({
      addressLine1: "123 Main St",
      bathrooms: 2,
      bedrooms: 4,
      city: "Sherman Oaks",
      lat: 34.148,
      lng: -118.432,
      lotSize: 7200,
      squareFeet: 2140,
      state: "CA",
      zip: "91423",
    });
  });
});
