import { beforeEach, describe, expect, it, vi } from "vitest";

const getGeometry = vi.hoisted(() => vi.fn());

vi.mock("../../../../../server/service-areas", () => ({
  GeographyUnavailableError: class GeographyUnavailableError extends Error {},
  getActiveMarketDisplayGeometryBySlug: getGeometry,
}));

import { GET } from "./route";

const hash = "b".repeat(64);
const geojson = {
  type: "FeatureCollection",
  features: [{
    type: "Feature",
    properties: { kind: "county", label: "Los Angeles County", slug: "los-angeles-county" },
    geometry: { type: "Polygon", coordinates: [] },
  }],
};

describe("market display-boundary route", () => {
  beforeEach(() => getGeometry.mockReset());

  it("serves an immutable privacy-safe version", async () => {
    getGeometry.mockResolvedValue({ geojson, sha256: hash });
    const response = await GET(
      new Request(`https://liber.test/api/markets/los-angeles/boundaries?v=${hash}`),
      { params: Promise.resolve({ slug: "los-angeles" }) },
    );

    expect(getGeometry).toHaveBeenCalledWith("los-angeles", hash);
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("public, max-age=31536000, immutable");
    expect(JSON.stringify(await response.json())).not.toMatch(/[0-9a-f]{8}-[0-9a-f-]{27}/i);
  });

  it("honors the immutable ETag", async () => {
    getGeometry.mockResolvedValue({ geojson, sha256: hash });
    const response = await GET(
      new Request(`https://liber.test/api/markets/los-angeles/boundaries?v=${hash}`, {
        headers: { "if-none-match": `"${hash}"` },
      }),
      { params: Promise.resolve({ slug: "los-angeles" }) },
    );

    expect(response.status).toBe(304);
  });

  it("rejects malformed versions without querying storage", async () => {
    const response = await GET(
      new Request("https://liber.test/api/markets/los-angeles/boundaries?v=current"),
      { params: Promise.resolve({ slug: "los-angeles" }) },
    );

    expect(response.status).toBe(404);
    expect(getGeometry).not.toHaveBeenCalled();
  });
});
