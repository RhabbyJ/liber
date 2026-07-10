import { beforeEach, describe, expect, it, vi } from "vitest";

const serviceAreaFindFirst = vi.hoisted(() => vi.fn());

vi.mock("@liber/db", () => ({
  Prisma: { sql: vi.fn() },
  prisma: {
    serviceArea: { findFirst: serviceAreaFindFirst },
  },
}));

import { getActiveServiceAreaBySlug } from "./service-areas";

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
  beforeEach(() => serviceAreaFindFirst.mockReset());

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
});
