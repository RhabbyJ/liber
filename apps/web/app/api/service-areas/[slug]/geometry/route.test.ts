import { beforeEach, describe, expect, it, vi } from "vitest";

const getGeometry = vi.hoisted(() => vi.fn());

vi.mock("../../../../../server/service-areas", () => ({
  GeographyUnavailableError: class GeographyUnavailableError extends Error {},
  getActiveServiceAreaGeometryBySlug: getGeometry,
}));

import { GET } from "./route";

const hash = "a".repeat(64);
const geometry = {
  geojson: { features: [], type: "FeatureCollection" },
  sha256: hash,
};

describe("service-area geometry route", () => {
  beforeEach(() => getGeometry.mockReset());

  it("loads the exact retained version for an immutable URL", async () => {
    getGeometry.mockResolvedValue(geometry);
    const response = await GET(
      new Request(`https://liber.test/api/service-areas/90001/geometry?market=los-angeles&v=${hash}`),
      { params: Promise.resolve({ slug: "90001" }) },
    );

    expect(getGeometry).toHaveBeenCalledWith("90001", "los-angeles", hash);
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("public, max-age=31536000, immutable");
    await expect(response.json()).resolves.toEqual(geometry.geojson);
  });

  it("uses the current pointer only for an unversioned request", async () => {
    getGeometry.mockResolvedValue(geometry);
    const response = await GET(
      new Request("https://liber.test/api/service-areas/90001/geometry?market=los-angeles"),
      { params: Promise.resolve({ slug: "90001" }) },
    );

    expect(getGeometry).toHaveBeenCalledWith("90001", "los-angeles", undefined);
    expect(response.headers.get("cache-control")).toBe("public, max-age=60");
  });

  it("does not substitute the current geometry when a requested version is absent", async () => {
    getGeometry.mockResolvedValue(null);
    const response = await GET(
      new Request(`https://liber.test/api/service-areas/90001/geometry?market=los-angeles&v=${hash}`),
      { params: Promise.resolve({ slug: "90001" }) },
    );

    expect(response.status).toBe(404);
  });
});
