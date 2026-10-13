import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({ session: vi.fn(), limit: vi.fn(), enrich: vi.fn() }));
vi.mock("../../../../server/session", () => ({ getSessionUser: mocks.session }));
vi.mock("../../../../server/rate-limit", () => ({ checkRateLimit: mocks.limit, clientIpFromRequest: () => "203.0.113.9" }));
vi.mock("../../../../server/attom", () => ({ enrichPropertyByAddress: mocks.enrich }));
import { POST } from "./route";

const validBody = { addressLine1: "1 Test Street", city: "Los Angeles", market: "los-angeles", state: "ca", zip: "90001" };
function request(body: unknown, headers: Record<string, string> = {}) {
  return new NextRequest("https://liber.test/api/property/enrich", {
    method: "POST", body: JSON.stringify(body),
    headers: { "content-type": "application/json", origin: "https://liber.test", ...headers },
  });
}

describe("property provider boundary", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.session.mockResolvedValue({ id: "seller-id", roles: ["SELLER"] });
    mocks.limit.mockResolvedValue({ allowed: true, limit: 20, retryAfterSeconds: 0 });
    mocks.enrich.mockResolvedValue({ error: null, property: { city: "Los Angeles" }, status: 200 });
  });

  it.each([null, [], { addressLine1: "x".repeat(161) }, { ...validBody, state: {} }])("rejects invalid input before auth, database quotas or provider calls: %j", async (body) => {
    expect((await POST(request(body))).status).toBe(400);
    expect(mocks.session).not.toHaveBeenCalled();
    expect(mocks.limit).not.toHaveBeenCalled();
    expect(mocks.enrich).not.toHaveBeenCalled();
  });

  it("rejects oversized payloads even with a forged length", async () => {
    const response = await POST(request({ ...validBody, ignored: "x".repeat(9 * 1024) }, { "content-length": "1" }));
    expect(response.status).toBe(413);
    expect(mocks.session).not.toHaveBeenCalled();
  });

  it("normalizes the state and never caches private address results", async () => {
    const response = await POST(request(validBody));
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(mocks.enrich).toHaveBeenCalledWith({ ...validBody, state: "CA" });
  });

  it("requires an eligible role before quota or provider calls", async () => {
    mocks.session.mockResolvedValue({ id: "buyer-id", roles: ["BUYER"] });
    expect((await POST(request(validBody))).status).toBe(403);
    expect(mocks.limit).not.toHaveBeenCalled();
    expect(mocks.enrich).not.toHaveBeenCalled();
  });

  it("fails closed when the shared database limiter is unavailable", async () => {
    mocks.limit.mockRejectedValue(new Error("private database details"));
    const response = await POST(request(validBody));
    expect(response.status).toBe(503);
    expect(mocks.enrich).not.toHaveBeenCalled();
    expect(await response.text()).not.toContain("private database");
  });

  it("returns an uncached Retry-After without reaching the provider", async () => {
    mocks.limit.mockResolvedValue({ allowed: false, limit: 20, retryAfterSeconds: 12 });
    const response = await POST(request(validBody));
    expect(response.status).toBe(429);
    expect(response.headers.get("retry-after")).toBe("12");
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(mocks.enrich).not.toHaveBeenCalled();
  });

  it("hides network diagnostics containing private address data", async () => {
    mocks.enrich.mockRejectedValue(new Error("fetch https://provider.test/?address=private-address failed"));
    const response = await POST(request(validBody));
    expect(response.status).toBe(503);
    expect(await response.text()).not.toContain("private-address");
  });
});
