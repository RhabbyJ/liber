import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const consume = vi.hoisted(() => vi.fn());
vi.mock("./shared-rate-limit", () => ({ consumeSharedRateLimit: consume }));
import { limitPublicGeographyRequest } from "./public-geography-http";

describe("public geography quota", () => {
  beforeEach(() => { consume.mockReset(); vi.stubEnv("VERCEL", "1"); });
  afterEach(() => vi.unstubAllEnvs());

  it("shares an IP budget across all public geography endpoints", async () => {
    consume.mockResolvedValue({ allowed: true, limit: 120, retryAfterSeconds: 0 });
    const response = await limitPublicGeographyRequest(new Request("https://liber.test/api/service-areas/search", {
      headers: { "x-vercel-forwarded-for": "203.0.113.9" },
    }));
    expect(response).toBeNull();
    expect(consume).toHaveBeenCalledWith({ identifier: "203.0.113.9", limit: 120, namespace: "geography:public:ip", windowSeconds: 60 });
  });

  it("never caches a client-specific quota failure", async () => {
    consume.mockResolvedValue({ allowed: false, limit: 120, retryAfterSeconds: 17 });
    const response = await limitPublicGeographyRequest(new Request("https://liber.test"));
    expect(response?.status).toBe(429);
    expect(response?.headers.get("cache-control")).toBe("private, no-store");
    expect(response?.headers.get("retry-after")).toBe("17");
  });

  it("fails closed and hides database errors", async () => {
    consume.mockRejectedValue(new Error("private database diagnostic"));
    const response = await limitPublicGeographyRequest(new Request("https://liber.test"));
    expect(response?.status).toBe(503);
    expect(await response?.text()).not.toContain("private database");
  });
});
