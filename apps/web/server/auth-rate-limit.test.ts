import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const queryRaw = vi.hoisted(() => vi.fn());

vi.mock("@liber/db", () => ({
  prisma: { $queryRaw: queryRaw },
}));

import { authRateLimitConfig, enforceSharedAuthRateLimit } from "./auth-rate-limit";

describe("shared auth rate limiting", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  beforeEach(() => {
    vi.clearAllMocks();
    queryRaw.mockResolvedValue([{ allowed: true, limit_value: 10, retry_after_seconds: 0 }]);
  });

  it("uses the shared database limiter for both IP and normalized email keys", async () => {
    await expect(
      enforceSharedAuthRateLimit({
        action: "login",
        email: " Buyer@Example.Test ",
        ip: "203.0.113.8",
      }),
    ).resolves.toMatchObject({ allowed: true });

    expect(queryRaw).toHaveBeenCalledTimes(2);
    const values = queryRaw.mock.calls.flatMap((call) => call.slice(1));
    expect(values).not.toContain("buyer@example.test");
    expect(values).not.toContain("203.0.113.8");
    expect(values.filter((value) => typeof value === "string" && /^[0-9a-f]{64}$/.test(value))).toHaveLength(2);
    const sql = queryRaw.mock.calls[0]?.[0]?.join("") ?? "";
    expect(sql).toContain("app_private.consume_rate_limit");
  });

  it("does not consume or create an email bucket after the IP budget is denied", async () => {
    queryRaw.mockResolvedValueOnce([
      { allowed: false, limit_value: 5, retry_after_seconds: 60 },
    ]);

    await expect(
      enforceSharedAuthRateLimit({
        action: "signup",
        email: "buyer@example.test",
        ip: "203.0.113.8",
      }),
    ).resolves.toMatchObject({ allowed: false, retryAfterSeconds: 60 });

    expect(queryRaw).toHaveBeenCalledTimes(1);
  });

  it("defines independent login, signup, resend, and recovery budgets", () => {
    expect(authRateLimitConfig("login").ip.windowSeconds).toBe(60);
    expect(authRateLimitConfig("signup").ip.limit).toBe(5);
    expect(authRateLimitConfig("resend").email.limit).toBe(3);
    expect(authRateLimitConfig("recovery").email.windowSeconds).toBe(3600);
  });

  it("fails closed when the shared limiter is unavailable in production", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("AUTH_RATE_LIMIT_PEPPER", "production-test-pepper-at-least-32-characters");
    queryRaw.mockRejectedValue(new Error("database unavailable"));

    await expect(
      enforceSharedAuthRateLimit({
        action: "login",
        email: "buyer@example.test",
        ip: "203.0.113.8",
      }),
    ).rejects.toThrow("Shared auth rate limiting is unavailable");
  });
});
