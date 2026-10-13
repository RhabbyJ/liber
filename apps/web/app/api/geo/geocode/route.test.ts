import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ session: vi.fn(), limit: vi.fn(), resolve: vi.fn(), market: vi.fn(), fetch: vi.fn() }));
vi.mock("../../../../server/session", () => ({ getSessionUser: mocks.session }));
vi.mock("../../../../server/rate-limit", () => ({ checkRateLimit: mocks.limit, clientIpFromRequest: () => "203.0.113.9" }));
vi.mock("../../../../server/external-fetch", () => ({ fetchWithRetry: mocks.fetch }));
vi.mock("../../../../server/service-areas", () => ({
  GeographyUnavailableError: class GeographyUnavailableError extends Error {},
  getActiveMarketBySlug: mocks.market, marketBboxParam: () => "-119,33,-117,35", resolveActiveServiceArea: mocks.resolve,
}));
import { GET } from "./route";

describe("geocode abuse boundary", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.session.mockResolvedValue({ id: "user-id" });
    mocks.limit.mockResolvedValue({ allowed: true, limit: 40, retryAfterSeconds: 0 });
    mocks.resolve.mockResolvedValue({ status: "none" });
  });

  it("rejects junk before querying auth, quotas, geography or the provider", async () => {
    expect((await GET(new Request("https://liber.test/api/geo/geocode?query=short"))).status).toBe(400);
    expect(mocks.session).not.toHaveBeenCalled();
    expect(mocks.limit).not.toHaveBeenCalled();
    expect(mocks.resolve).not.toHaveBeenCalled();
    expect(mocks.fetch).not.toHaveBeenCalled();
  });

  it("requires authentication for valid queries", async () => {
    mocks.session.mockResolvedValue(null);
    const response = await GET(new Request("https://liber.test/api/geo/geocode?market=los-angeles&query=Sherman"));
    expect(response.status).toBe(401);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(mocks.limit).not.toHaveBeenCalled();
  });

  it("fails closed on quota failures", async () => {
    mocks.limit.mockRejectedValue(new Error("private database diagnostic"));
    const response = await GET(new Request("https://liber.test/api/geo/geocode?market=los-angeles&query=Sherman"));
    expect(response.status).toBe(503);
    expect(mocks.resolve).not.toHaveBeenCalled();
    expect(mocks.fetch).not.toHaveBeenCalled();
    expect(await response.text()).not.toContain("private database");
  });

  it("returns Retry-After when either budget is exhausted", async () => {
    mocks.limit.mockResolvedValueOnce({ allowed: true, limit: 60, retryAfterSeconds: 0 })
      .mockResolvedValueOnce({ allowed: false, limit: 40, retryAfterSeconds: 23 });
    const response = await GET(new Request("https://liber.test/api/geo/geocode?market=los-angeles&query=Sherman"));
    expect(response.status).toBe(429);
    expect(response.headers.get("retry-after")).toBe("23");
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(mocks.resolve).not.toHaveBeenCalled();
  });
});
