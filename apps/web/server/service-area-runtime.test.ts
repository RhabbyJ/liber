import { beforeEach, describe, expect, it, vi } from "vitest";

const serviceAreaFindFirst = vi.hoisted(() => vi.fn());
const marketFindFirst = vi.hoisted(() => vi.fn());

vi.mock("@liber/db", () => ({
  Prisma: { sql: vi.fn() },
  prisma: {
    market: { findFirst: marketFindFirst },
    serviceArea: { findFirst: serviceAreaFindFirst },
  },
}));

import { getActiveMarketBySlug, getActiveServiceAreaBySlug, serviceAreaApiShape } from "./service-areas";

const areaRow = {
  active: true,
  bboxEast: -118.1,
  bboxNorth: 34.3,
  bboxSouth: 34.1,
  bboxWest: -118.4,
  centerLat: 34.2,
  centerLng: -118.25,
  city: "Example",
  county: "Los Angeles County",
  currentGeometry: { sha256: "b".repeat(64) },
  geojsonPath: "/geo/service-areas/legacy.geojson",
  geojsonSha256: "a".repeat(64),
  id: "00000000-0000-4000-8000-000000000001",
  isPilot: false,
  label: "Example",
  market: { slug: "los-angeles" },
  postalCode: null,
  searchTerms: [],
  slug: "example",
  source: "official-source",
  sourceLicense: "Public domain",
  sourceUrl: "https://example.test",
  sourceVersion: "v1",
  state: "CA",
  type: "city",
};

describe("service-area geometry metadata", () => {
  beforeEach(() => {
    marketFindFirst.mockReset();
    serviceAreaFindFirst.mockReset();
  });

  it("loads ordinary market metadata without display geometry", async () => {
    marketFindFirst.mockResolvedValue({
      active: true,
      bboxEast: -117.6,
      bboxNorth: 34.9,
      bboxSouth: 32.7,
      bboxWest: -119,
      centerLat: 34.2,
      centerLng: -118.2,
      country: "US",
      id: "00000000-0000-4000-8000-000000000010",
      label: "Los Angeles County",
      slug: "los-angeles",
      state: "CA",
    });

    const market = await getActiveMarketBySlug("los-angeles");

    expect(market).not.toHaveProperty("boundaryGeojsonPath");
    expect(marketFindFirst).toHaveBeenCalledWith({ where: { active: true, slug: "los-angeles" } });
  });

  it("builds immutable URLs from the approved geometry pointer", async () => {
    serviceAreaFindFirst.mockResolvedValue(areaRow);

    const area = await getActiveServiceAreaBySlug("example", "los-angeles");

    expect(area?.geojsonPath).toBe(
      `/api/service-areas/example/geometry?market=los-angeles&v=${"b".repeat(64)}`,
    );
    expect(area?.geojsonSha256).toBe("b".repeat(64));
  });

  it("keeps the legacy path only while no approved pointer exists", async () => {
    serviceAreaFindFirst.mockResolvedValue({ ...areaRow, currentGeometry: null });

    const area = await getActiveServiceAreaBySlug("example", "los-angeles");

    expect(area?.geojsonPath).toBe("/geo/service-areas/legacy.geojson");
    expect(area?.geojsonSha256).toBe("a".repeat(64));
  });

  it("does not serialize the internal service-area UUID publicly", async () => {
    serviceAreaFindFirst.mockResolvedValue(areaRow);
    const area = await getActiveServiceAreaBySlug("example", "los-angeles");
    if (!area) throw new Error("Expected fixture service area.");
    const shape = serviceAreaApiShape(area);

    expect(shape).not.toHaveProperty("id");
    expect(shape).toMatchObject({ market_slug: "los-angeles", slug: "example" });
  });
});
