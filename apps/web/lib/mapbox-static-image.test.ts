import { describe, expect, it } from "vitest";
import { mapboxStaticImageUrl } from "./mapbox-static-image";

const market = {
  bbox: [-118.67, 34.11, -118.18, 34.31] as [number, number, number, number],
  center: { lat: 34.21, lng: -118.425 },
  label: "Los Angeles",
  slug: "los-angeles",
};

describe("Mapbox static demand map", () => {
  it("returns no image without a browser-safe token", () => {
    expect(mapboxStaticImageUrl({ market, points: [], token: "" })).toBeNull();
  });

  it("renders approximate demand points on a geographic street map", () => {
    const url = mapboxStaticImageUrl({
      market,
      points: [
        { lat: 34.16, lng: -118.5 },
        { lat: 34.24, lng: -118.31 },
      ],
      token: "pk.public-test-token",
    });

    expect(url).toContain("/mapbox/streets-v12/static/");
    expect(url).toContain("pin-s+16834c(-118.5,34.16)");
    expect(url).toContain("pin-s+16834c(-118.31,34.24)");
    expect(url).toContain("access_token=pk.public-test-token");
  });

  it("centers a selected service area without adding a fake boundary", () => {
    const url = mapboxStaticImageUrl({
      market,
      points: [{ lat: 34.18, lng: -118.33 }],
      selectedArea: {
        bbox: [-118.37, 34.14, -118.28, 34.22],
        center: { lat: 34.18, lng: -118.325 },
        geojsonPath: "/geo/service-areas/city/burbank.geojson",
        label: "Burbank",
      },
      token: "pk.public-test-token",
    });

    expect(url).toContain("/-118.325,34.18,");
    expect(url).not.toContain("geojson");
  });
});
