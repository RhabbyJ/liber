import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  authOperations: vi.fn(),
  emailOutbox: vi.fn(),
  heartbeat: vi.fn(),
  uploads: vi.fn(),
}));

vi.mock("@liber/db", () => ({ prisma: { workerHeartbeat: { upsert: mocks.heartbeat } } }));
vi.mock("../../../../server/auth-operations", () => ({ processAuthOperations: mocks.authOperations }));
vi.mock("../../../../server/email-outbox", () => ({ processEmailOutbox: mocks.emailOutbox }));
vi.mock("../../../../server/uploads/service", () => ({ cleanupAbandonedUploads: mocks.uploads }));

import { GET, maxDuration } from "./route";

const secret = "outbox-route-test-secret-with-32-characters";

describe("GET /api/maintenance/outbox", () => {
  beforeEach(() => {
    vi.stubEnv("CRON_SECRET", secret);
    mocks.authOperations.mockReset().mockResolvedValue({ completed: 0, failed: 0, processed: 0 });
    mocks.emailOutbox.mockReset().mockResolvedValue({ cancelled: 0, failed: 0, processed: 3, sent: 3 });
    mocks.uploads.mockReset().mockResolvedValue({ inspected: 1, removed: 1 });
    mocks.heartbeat.mockReset().mockResolvedValue({});
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it("rejects a request without the maintenance bearer secret before running workers", async () => {
    const response = await GET(request("Bearer wrong"));

    expect(response.status).toBe(401);
    expect(mocks.emailOutbox).not.toHaveBeenCalled();
  });

  it("runs every worker and records the upload cleanup heartbeat", async () => {
    const response = await GET(request(`Bearer ${secret}`));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      authOperations: { completed: 0, failed: 0, processed: 0 },
      emailOutbox: { cancelled: 0, failed: 0, processed: 3, sent: 3 },
      uploads: { inspected: 1, removed: 1 },
    });
    expect(mocks.emailOutbox).toHaveBeenCalledWith();
    expect(mocks.heartbeat).toHaveBeenCalledWith(expect.objectContaining({ where: { worker: "upload-cleanup" } }));
    expect(maxDuration).toBeGreaterThanOrEqual(60);
  });

  it("returns 500 when one worker fails but still reports the others", async () => {
    mocks.uploads.mockRejectedValueOnce(new Error("Supabase Storage is not configured."));

    const response = await GET(request(`Bearer ${secret}`));

    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toMatchObject({
      authOperations: { processed: 0 },
      emailOutbox: { sent: 3 },
      failedWorkers: ["uploads"],
      uploads: { failed: true, error: { errorClass: "Error" } },
    });
    expect(mocks.heartbeat).not.toHaveBeenCalled();
  });
});

function request(authorization: string) {
  return new NextRequest("http://127.0.0.1:3000/api/maintenance/outbox", { headers: { authorization } });
}
