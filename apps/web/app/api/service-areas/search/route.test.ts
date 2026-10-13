import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ limit: vi.fn(), search: vi.fn() }));
vi.mock("../../../../server/public-geography-http", () => ({
  limitPublicGeographyRequest: mocks.limit, PUBLIC_GEOGRAPHY_CACHE: "public, max-age=60, s-maxage=300",
}));
vi.mock("../../../../server/service-areas", () => ({
  GeographyUnavailableError: class GeographyUnavailableError extends Error {},
  searchAndResolveActiveServiceAreas: mocks.search,
  serviceAreaApiShape: (value: unknown) => value, serviceAreaResolutionApiShape: (value: unknown) => value,
}));
import { GET } from "./route";

describe("public geography search boundary", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.limit.mockResolvedValue(null);
    mocks.search.mockResolvedValue({ resolution: { status: "none" }, suggestions: [] });
  });

  it("does not touch shared quotas or geography for malformed input", async () => {
    await GET(new Request("https://liber.test/api/service-areas/search?market=invalid%2Fmarket"));
    expect(mocks.limit).not.toHaveBeenCalled();
    expect(mocks.search).not.toHaveBeenCalled();
  });

  it("does not query geography after the public budget is exhausted", async () => {
    mocks.limit.mockResolvedValue(new Response(null, { status: 429 }));
    expect((await GET(new Request("https://liber.test/api/service-areas/search?market=los-angeles&q=Encino"))).status).toBe(429);
    expect(mocks.search).not.toHaveBeenCalled();
  });

  it("allows successful public-only results to be cached by the CDN", async () => {
    const response = await GET(new Request("https://liber.test/api/service-areas/search?market=los-angeles&q=Encino"));
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("public, max-age=60, s-maxage=300");
    expect(mocks.search).toHaveBeenCalledWith("Encino", 8, "los-angeles");
  });
});
