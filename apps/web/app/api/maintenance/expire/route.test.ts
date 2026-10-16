import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ expire: vi.fn(), heartbeat: vi.fn(), prune: vi.fn() }));

vi.mock("@liber/db", () => ({ prisma: { workerHeartbeat: { upsert: mocks.heartbeat } } }));
vi.mock("../../../../server/maintenance", () => ({
  expireMarketplaceState: mocks.expire,
  pruneExpiredRateLimitBuckets: mocks.prune,
}));

import { GET, POST } from "./route";

const secret = "expire-route-test-secret-with-32-characters";
const expiration = {
  badgesExpired: 0,
  hasMore: false,
  invitesExpired: 1,
  loiNegotiationsExpired: 0,
  loiNegotiationsFrozen: 0,
  outboxPayloadsMinimized: 2,
};

describe("/api/maintenance/expire", () => {
  beforeEach(() => {
    vi.stubEnv("CRON_SECRET", secret);
    mocks.expire.mockReset().mockResolvedValue(expiration);
    mocks.prune.mockReset().mockResolvedValue({ hasMore: false, legacyBucketsPruned: 4, sharedBucketsPruned: 5 });
    mocks.heartbeat.mockReset().mockResolvedValue({});
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it("rejects requests without the bearer secret", async () => {
    const response = await POST(request("POST", null));

    expect(response.status).toBe(401);
    expect(mocks.expire).not.toHaveBeenCalled();
    expect(mocks.prune).not.toHaveBeenCalled();
  });

  it("expires state, prunes limiter buckets, and records the expiry heartbeat", async () => {
    const response = await GET(request("GET", `Bearer ${secret}`));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      expiration,
      rateLimitBuckets: { hasMore: false, legacyBucketsPruned: 4, sharedBucketsPruned: 5 },
    });
    expect(mocks.heartbeat).toHaveBeenCalledExactlyOnceWith({
      where: { worker: "marketplace-expiry" },
      update: { lastRunAt: expect.any(Date), metadata: expiration },
      create: { worker: "marketplace-expiry", lastRunAt: expect.any(Date), metadata: expiration },
    });
  });

  it("still expires state when pruning fails and returns 500", async () => {
    mocks.prune.mockRejectedValueOnce(Object.assign(
      new Error("function app_private.prune_rate_limit_buckets(timestamp with time zone, integer) does not exist"),
      { code: "42883", severity: "ERROR" },
    ));

    const response = await POST(request("POST", `Bearer ${secret}`));

    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toEqual({
      expiration,
      failedWorkers: ["rateLimitBuckets"],
      rateLimitBuckets: { failed: true, error: { dbCode: "42883", errorClass: "Error" } },
    });
    expect(mocks.heartbeat).toHaveBeenCalledOnce();
  });
});

function request(method: "GET" | "POST", authorization: string | null) {
  return new NextRequest("http://127.0.0.1:3000/api/maintenance/expire", {
    headers: authorization ? { authorization } : {},
    method,
  });
}
