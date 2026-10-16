import { PrismaClientKnownRequestError } from "@prisma/client/runtime/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ upsert: vi.fn() }));
vi.mock("@liber/db", () => ({ prisma: { workerHeartbeat: { upsert: mocks.upsert } } }));

import { maintenanceRequestAuthorized, runMaintenanceWorkers } from "./maintenance-runner";

describe("maintenance worker isolation", () => {
  let consoleError: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    mocks.upsert.mockReset().mockResolvedValue({});
    consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => consoleError.mockRestore());

  it("keeps running the other workers when one throws and reports the run as failed", async () => {
    const providerFailure = new PrismaClientKnownRequestError(
      'Raw query failed. Code: `23505`. Message: `duplicate key value violates unique constraint "EmailOutbox_idempotencyKey_key"` for recipient@example.test',
      { clientVersion: "7.8.0", code: "P2010", meta: { driverAdapterError: { cause: { originalCode: "23505" } } } },
    );
    const uploads = vi.fn(async () => ({ inspected: 2, removed: 1 }));

    const { body, status } = await runMaintenanceWorkers("/api/maintenance/outbox", [
      { name: "authOperations", run: async () => ({ completed: 1, failed: 0, processed: 1 }) },
      { name: "emailOutbox", run: async () => { throw providerFailure; } },
      { name: "uploads", heartbeat: "upload-cleanup", run: uploads },
    ]);

    expect(status).toBe(500);
    expect(uploads).toHaveBeenCalledOnce();
    expect(body).toEqual({
      authOperations: { completed: 1, failed: 0, processed: 1 },
      emailOutbox: { failed: true, error: { code: "P2010", dbCode: "23505", errorClass: "PrismaClientKnownRequestError" } },
      failedWorkers: ["emailOutbox"],
      uploads: { inspected: 2, removed: 1 },
    });
    expect(consoleError).toHaveBeenCalledExactlyOnceWith("Maintenance worker failed.", {
      code: "P2010",
      dbCode: "23505",
      errorClass: "PrismaClientKnownRequestError",
      message: expect.stringContaining("EmailOutbox_idempotencyKey_key"),
      route: "/api/maintenance/outbox",
      worker: "emailOutbox",
    });
    expect(JSON.stringify(consoleError.mock.calls)).not.toContain("recipient@example.test");
  });

  it("records heartbeats only for successful workers that declare one", async () => {
    const { status } = await runMaintenanceWorkers("/api/maintenance/expire", [
      {
        name: "expiration",
        heartbeat: "marketplace-expiry",
        run: async () => ({ badgesExpired: 2, hasMore: false, ignored: { nested: true } }),
      },
      { name: "failing", heartbeat: "failing-worker", run: async () => { throw new Error("boom"); } },
      { name: "rateLimitBuckets", run: async () => ({ sharedBucketsPruned: 3 }) },
    ]);

    expect(status).toBe(500);
    expect(mocks.upsert).toHaveBeenCalledOnce();
    expect(mocks.upsert).toHaveBeenCalledWith({
      where: { worker: "marketplace-expiry" },
      update: { lastRunAt: expect.any(Date), metadata: { badgesExpired: 2, hasMore: false } },
      create: { worker: "marketplace-expiry", lastRunAt: expect.any(Date), metadata: { badgesExpired: 2, hasMore: false } },
    });
  });

  it("fails the worker when its heartbeat cannot be recorded", async () => {
    mocks.upsert.mockRejectedValueOnce(new Error("Can't reach database server"));

    const { body, status } = await runMaintenanceWorkers("/api/maintenance/outbox", [
      { name: "uploads", heartbeat: "upload-cleanup", run: async () => ({ inspected: 0, removed: 0 }) },
    ]);

    expect(status).toBe(500);
    expect(body).toEqual({
      failedWorkers: ["uploads"],
      uploads: { failed: true, error: { errorClass: "Error" } },
    });
  });

  it("returns 200 with every worker result when all succeed", async () => {
    const { body, status } = await runMaintenanceWorkers("/api/maintenance/outbox", [
      { name: "authOperations", run: async () => ({ processed: 0 }) },
      { name: "emailOutbox", run: async () => ({ failed: 0, processed: 0 }) },
    ]);

    expect(status).toBe(200);
    expect(body).toEqual({ authOperations: { processed: 0 }, emailOutbox: { failed: 0, processed: 0 } });
    expect(consoleError).not.toHaveBeenCalled();
  });

  it("accepts only the exact bearer secret", () => {
    const secret = "maintenance-secret-at-least-thirty-two-characters";
    expect(maintenanceRequestAuthorized(`Bearer ${secret}`, secret)).toBe(true);
    expect(maintenanceRequestAuthorized(`Bearer ${secret}x`, secret)).toBe(false);
    expect(maintenanceRequestAuthorized(secret, secret)).toBe(false);
    expect(maintenanceRequestAuthorized(null, secret)).toBe(false);
    expect(maintenanceRequestAuthorized(`Bearer ${secret}`, "")).toBe(false);
    expect(maintenanceRequestAuthorized("Bearer ", undefined)).toBe(false);
  });
});
