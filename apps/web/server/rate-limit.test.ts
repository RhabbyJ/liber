import { afterEach, describe, expect, it, vi } from "vitest";
import { checkRateLimit, clientIpFromHeaders, clientIpFromRequest, type RateLimitStore } from "./rate-limit";

function memoryStore(): RateLimitStore {
  const buckets = new Map<string, { count: number; resetAt: number }>();
  return {
    async consume(key, limit, windowMs) {
      const now = Date.now();
      const current = buckets.get(key);
      const bucket = !current || current.resetAt <= now
        ? { count: 1, resetAt: now + windowMs }
        : { ...current, count: current.count + 1 };
      buckets.set(key, bucket);
      return {
        allowed: bucket.count <= limit,
        limit,
        retryAfterSeconds: bucket.count <= limit ? 0 : Math.max(1, Math.ceil((bucket.resetAt - now) / 1000)),
      };
    },
  };
}

describe("rate limit utility", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("does not let direct requests choose arbitrary IP buckets", () => {
    vi.stubEnv("VERCEL", "");
    expect(clientIpFromHeaders(new Headers({ "x-forwarded-for": "203.0.113.7", "x-real-ip": "203.0.113.8" }))).toBe("unknown-ip");
  });

  it("prefers the Vercel-controlled address over an additional proxy chain", () => {
    vi.stubEnv("VERCEL", "1");
    expect(clientIpFromRequest(new Request("https://liber.test", { headers: {
      "x-vercel-forwarded-for": "203.0.113.9", "x-forwarded-for": "203.0.113.7, 203.0.113.8",
    } }))).toBe("203.0.113.9");
  });

  it.each(["arbitrary-bucket", "203.0.113.7, 203.0.113.8", "203.0.113.7:80", "a".repeat(500)])("does not mint buckets for malformed IP %j", (value) => {
    vi.stubEnv("VERCEL", "1");
    expect(clientIpFromHeaders(new Headers({ "x-forwarded-for": value }))).toBe("unknown-ip");
  });

  it("canonicalizes equivalent IPv6 spellings into the same quota bucket", () => {
    vi.stubEnv("VERCEL", "1");
    expect(clientIpFromHeaders(new Headers({ "x-forwarded-for": "2001:0DB8:0000:0000:0000:0000:0000:0001" }))).toBe("2001:db8::1");
    expect(clientIpFromHeaders(new Headers({ "x-forwarded-for": "2001:db8::1" }))).toBe("2001:db8::1");
  });
  it("uses a shared-store contract and blocks after the configured quota", async () => {
    const key = `test:${crypto.randomUUID()}`;
    const store = memoryStore();

    expect((await checkRateLimit(key, 2, 60_000, store)).allowed).toBe(true);
    expect((await checkRateLimit(key, 2, 60_000, store)).allowed).toBe(true);

    const blocked = await checkRateLimit(key, 2, 60_000, store);
    expect(blocked.allowed).toBe(false);
    expect(blocked.retryAfterSeconds).toBeGreaterThan(0);
  });
});
