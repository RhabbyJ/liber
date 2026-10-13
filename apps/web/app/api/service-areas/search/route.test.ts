import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  checkRateLimit: vi.fn(),
  search: vi.fn(),
}));

vi.mock("@liber/db", () => ({ Prisma: {}, prisma: {} }));

vi.mock("../../../../server/rate-limit", () => ({
  checkRateLimit: mocks.checkRateLimit,
  clientIpFromRequest: () => "203.0.113.7",
}));

vi.mock("../../../../server/service-areas", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../../../server/service-areas")>();
  return { ...actual, searchAndResolveActiveServiceAreas: mocks.search };
});

import { GET } from "./route";

const granadaHills = {
  active: true,
  bbox: [-118.54, 34.25, -118.47, 34.3] as [number, number, number, number],
  center: { lat: 34.27, lng: -118.5 },
  city: "Los Angeles",
  county: "Los Angeles",
  disclaimer: "Approximate Los Angeles County statistical community service area.",
  geojsonPath: "/api/service-areas/granada-hills/geometry?market=los-angeles",
  id: "11111111-1111-4111-8111-111111111111",
  isPilot: false,
  label: "Granada Hills",
  marketSlug: "los-angeles",
  postalCode: null,
  searchTerms: ["granada hills"],
  slug: "granada-hills",
  source: "la-county-csa",
  sourceVersion: "2026-07-12",
  state: "CA",
  type: "neighborhood" as const,
};

function request(query: string) {
  return new Request(`https://liber.example/api/service-areas/search?${query}`);
}

describe("service-area search route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.checkRateLimit.mockResolvedValue({ allowed: true, limit: 120, retryAfterSeconds: 0 });
    mocks.search.mockResolvedValue({
      resolution: { status: "resolved", area: granadaHills },
      suggestions: [granadaHills],
    });
  });

  it("returns cacheable public suggestions without database identifiers", async () => {
    const response = await GET(request("market=los-angeles&q=Granada%20Hills"));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toContain("s-maxage=300");
    expect(mocks.checkRateLimit).toHaveBeenCalledWith("service-area-search:ip:203.0.113.7", 120, 60_000);
    expect(body.resolution).toMatchObject({ status: "resolved", area: { slug: "granada-hills", city: "Los Angeles" } });
    expect(body.suggestions).toHaveLength(1);
    expect(JSON.stringify(body)).not.toContain(granadaHills.id);
  });

  it("answers empty queries without touching the limiter or database", async () => {
    const response = await GET(request("market=los-angeles&q=%20-%20"));

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ resolution: { status: "none" }, suggestions: [] });
    expect(mocks.checkRateLimit).not.toHaveBeenCalled();
    expect(mocks.search).not.toHaveBeenCalled();
  });

  it("rejects malformed markets and oversized queries before any lookup", async () => {
    for (const query of ["market=LA%20County&q=granada", `market=los-angeles&q=${"a".repeat(81)}`]) {
      const response = await GET(request(query));
      expect(response.headers.get("Cache-Control")).toBe("no-store");
      expect(await response.json()).toEqual({ resolution: { status: "none" }, suggestions: [] });
    }
    expect(mocks.search).not.toHaveBeenCalled();
  });

  it("throttles per IP with an uncached 429", async () => {
    mocks.checkRateLimit.mockResolvedValue({ allowed: false, limit: 120, retryAfterSeconds: 42 });
    const response = await GET(request("market=los-angeles&q=granada"));

    expect(response.status).toBe(429);
    expect(response.headers.get("Retry-After")).toBe("42");
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect(mocks.search).not.toHaveBeenCalled();
  });

  it("fails closed with an uncached 503 when geography is unavailable", async () => {
    mocks.search.mockRejectedValue(new Error("connection refused"));
    const response = await GET(request("market=los-angeles&q=granada"));
    const body = await response.json();

    expect(response.status).toBe(503);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect(body.suggestions).toEqual([]);
    expect(body.error).toBe("Liber service-area data is temporarily unavailable.");
  });
});
