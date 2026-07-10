import { readFileSync } from "node:fs";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const queryRaw = vi.hoisted(() => vi.fn());
const localRateLimit = vi.hoisted(() => vi.fn());

vi.mock("@liber/db", () => ({
  prisma: { $queryRaw: queryRaw },
}));

vi.mock("./rate-limit", () => ({
  checkRateLimit: localRateLimit,
}));

import { assertSharedRateLimit, consumeSharedRateLimit } from "./shared-rate-limit";

describe("shared rate limiter", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  beforeEach(() => {
    vi.clearAllMocks();
    queryRaw.mockResolvedValue([{ allowed: true, limit_value: 10, retry_after_seconds: 0 }]);
  });

  it("uses the atomic database function without exposing the raw identifier", async () => {
    await expect(consumeSharedRateLimit({
      identifier: "buyer@example.test",
      limit: 10,
      namespace: "seller:buyer-search",
      windowSeconds: 60,
    })).resolves.toEqual({ allowed: true, limit: 10, retryAfterSeconds: 0 });

    const values = queryRaw.mock.calls[0]?.slice(1) ?? [];
    expect(values).toContain("seller:buyer-search");
    expect(values).not.toContain("buyer@example.test");
    expect(values.some((value) => typeof value === "string" && /^[0-9a-f]{64}$/.test(value))).toBe(true);
  });

  it("uses the bounded process-local fallback only outside production", async () => {
    vi.stubEnv("NODE_ENV", "development");
    queryRaw.mockRejectedValue(new Error("database unavailable"));
    localRateLimit.mockReturnValue({ allowed: true, limit: 20, retryAfterSeconds: 0 });

    await expect(consumeSharedRateLimit({
      identifier: "203.0.113.9",
      limit: 20,
      namespace: "geocode:ip",
      windowSeconds: 60,
    })).resolves.toMatchObject({ allowed: true, limit: 20 });
    expect(localRateLimit).toHaveBeenCalledOnce();
  });

  it("fails closed in production and requires a strong HMAC pepper", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("AUTH_RATE_LIMIT_PEPPER", "");

    await expect(consumeSharedRateLimit({
      identifier: "203.0.113.9",
      limit: 20,
      namespace: "geocode:ip",
      windowSeconds: 60,
    })).rejects.toThrow("AUTH_RATE_LIMIT_PEPPER must contain at least 32 characters");

    vi.stubEnv("AUTH_RATE_LIMIT_PEPPER", "production-test-pepper-at-least-32-characters");
    queryRaw.mockRejectedValue(new Error("database unavailable"));
    await expect(consumeSharedRateLimit({
      identifier: "203.0.113.9",
      limit: 20,
      namespace: "geocode:ip",
      windowSeconds: 60,
    })).rejects.toThrow("Shared rate limiting is unavailable");
    expect(localRateLimit).not.toHaveBeenCalled();
  });

  it("turns a denied shared bucket into the common server error", async () => {
    queryRaw.mockResolvedValue([{ allowed: false, limit_value: 30, retry_after_seconds: 19 }]);
    await expect(assertSharedRateLimit({
      identifier: "seller-id",
      limit: 30,
      namespace: "seller:invite",
      windowSeconds: 3600,
    })).rejects.toThrow("Rate limit reached. Try again later.");
  });
});

describe("shared limiter call sites", () => {
  const repositoryRoot = path.resolve(process.cwd(), "../..");
  const source = (relativePath: string) => readFileSync(path.join(repositoryRoot, relativePath), "utf8");

  it("covers every LA launch abuse boundary and leaves no production local limiter call", () => {
    const contracts = source("apps/web/server/contracts.ts");
    const geocode = source("apps/web/app/api/geo/geocode/route.ts");
    const enrichment = source("apps/web/app/api/property/enrich/route.ts");
    const combined = `${contracts}\n${geocode}\n${enrichment}`;

    for (const namespace of [
      "seller:buyer-search",
      "seller:buyer-profile-view",
      "user:buyer-profile-view",
      "seller:invite",
      "upload:property-image",
      "upload:verification",
      "geocode:ip",
      "geocode:user",
      "property-enrich:ip",
      "property-enrich:user",
    ]) {
      expect(combined).toContain(`namespace: \"${namespace}\"`);
    }
    expect(combined).not.toMatch(/\b(?:assertAuditRateLimit|assertRateLimit|checkRateLimit)\s*\(/);
  });
});
