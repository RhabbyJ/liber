import { describe, expect, it } from "vitest";
import { checkRateLimit, type RateLimitStore } from "./rate-limit";

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
