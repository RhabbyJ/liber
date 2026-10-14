import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const findMany = vi.hoisted(() => vi.fn());

vi.mock("@liber/db", () => ({
  Prisma: { sql: vi.fn() },
  prisma: { serviceArea: { findMany } },
}));

import {
  GeographyUnavailableError,
  resetServiceAreaCatalogCache,
  resolveActiveServiceArea,
  searchAndResolveActiveServiceAreas,
  serviceAreaApiShape,
} from "./service-areas";

function row(slug: string, label: string, type: string, terms: string[], extra: Record<string, unknown> = {}) {
  return {
    active: true,
    bboxEast: -118.4,
    bboxNorth: 34.3,
    bboxSouth: 34.2,
    bboxWest: -118.6,
    centerLat: 34.27,
    centerLng: -118.5,
    city: type === "neighborhood" ? "Los Angeles" : null,
    county: "Los Angeles County",
    currentGeometry: { sha256: "c".repeat(64) },
    geojsonPath: `/api/service-areas/${slug}/geometry`,
    geojsonSha256: "c".repeat(64),
    id: `00000000-0000-4000-8000-${String(slug.length).padStart(12, "0")}`,
    isPilot: false,
    label,
    market: { slug: "los-angeles" },
    postalCode: null,
    reviewedSearchTerms: terms.map((termNormalized) => ({ termNormalized })),
    searchTerms: terms,
    slug,
    source: "la-county-csa",
    sourceLicense: null,
    sourceUrl: null,
    sourceVersion: "2026-07-12",
    state: "CA",
    type,
    ...extra,
  };
}

const rows = [
  row("granada-hills", "Granada Hills", "neighborhood", ["granada hills", "granada hills ca"]),
  row("91344", "91344", "zip", ["91344"], { postalCode: "91344" }),
  row("unreviewed-hills", "Unreviewed Hills", "neighborhood", []),
];

describe("cached service-area search catalog", () => {
  beforeEach(() => {
    resetServiceAreaCatalogCache();
    findMany.mockReset();
    findMany.mockResolvedValue(rows);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllEnvs();
  });

  it("loads only active areas in the active market with their reviewed terms", async () => {
    await resolveActiveServiceArea("Granada Hills", "los-angeles");
    expect(findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { active: true, market: { active: true, slug: "los-angeles" } },
      include: expect.objectContaining({ reviewedSearchTerms: { select: { termNormalized: true } } }),
    }));
  });

  it("resolves exact names and returns typo suggestions with their match kind", async () => {
    const exact = await resolveActiveServiceArea("granada hills, ca", "los-angeles");
    expect(exact).toMatchObject({ status: "resolved", area: { slug: "granada-hills" } });

    const typo = await searchAndResolveActiveServiceAreas("granda hills", 8, "los-angeles");
    expect(typo.resolution.status).toBe("none");
    expect(typo.suggestions.map((area) => [area.slug, area.match])).toEqual([["granada-hills", "fuzzy"]]);
    expect(serviceAreaApiShape(typo.suggestions[0])).toMatchObject({ match: "fuzzy", slug: "granada-hills" });
    expect(serviceAreaApiShape(typo.suggestions[0])).not.toHaveProperty("id");
  });

  it("fails closed for areas without reviewed terms", async () => {
    expect((await searchAndResolveActiveServiceAreas("unreviewed", 8, "los-angeles")).suggestions).toEqual([]);
  });

  it("reuses one catalog load across keystrokes and refreshes it after a minute", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-10-13T12:00:00Z"));
    await searchAndResolveActiveServiceAreas("g", 8, "los-angeles");
    await searchAndResolveActiveServiceAreas("gr", 8, "los-angeles");
    await searchAndResolveActiveServiceAreas("gra", 8, "los-angeles");
    expect(findMany).toHaveBeenCalledTimes(1);

    vi.setSystemTime(new Date("2026-10-13T12:01:30Z"));
    findMany.mockResolvedValueOnce([rows[1]]);
    // A recent catalog answers immediately while one refresh replaces it.
    expect((await resolveActiveServiceArea("Granada Hills", "los-angeles")).status).toBe("resolved");
    await vi.waitFor(async () => {
      expect((await resolveActiveServiceArea("Granada Hills", "los-angeles")).status).toBe("none");
    });
    expect(findMany).toHaveBeenCalledTimes(2);
  });

  it("returns a controlled unavailable error when production geography cannot load", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    findMany.mockRejectedValue(new Error("connection refused"));
    await expect(searchAndResolveActiveServiceAreas("granada", 8, "los-angeles")).rejects.toBeInstanceOf(GeographyUnavailableError);
  });
});
