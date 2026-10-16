import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  prisma: {
    $queryRaw: vi.fn(),
    emailOutbox: { updateMany: vi.fn() },
    workerHeartbeat: { upsert: vi.fn() },
  },
  sendInvite: vi.fn(),
}));

vi.mock("@liber/db", () => ({ prisma: mocks.prisma }));
vi.mock("./email", () => ({
  sendInviteEmail: mocks.sendInvite,
  sendLoiUpdateEmail: vi.fn(),
  sendUnreadMessageEmail: vi.fn(),
}));
vi.mock("./messaging/tours", () => ({ prepareTourEmail: vi.fn(), sendCurrentTourEmail: vi.fn() }));

import { EMAIL_WORKER_TIME_BUDGET_MS, processEmailOutbox } from "./email-outbox";

let queue: Array<{ id: string }> = [];
let clock = 0;
const waits: number[] = [];
const runOptions = {
  now: () => clock,
  sleep: async (milliseconds: number) => {
    waits.push(milliseconds);
    clock += milliseconds;
  },
};

describe("email outbox run budget", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    clock = 0;
    waits.length = 0;
    queue = Array.from({ length: 12 }, (_, index) => ({ id: `invite-job-${index + 1}` }));
    mocks.prisma.$queryRaw.mockImplementation(async (strings: TemplateStringsArray) => {
      const sql = strings.join("?");
      if (sql.includes("exhausted_candidates")) {
        const job = queue.shift();
        return job ? [{ ...job, attempts: 1, idempotencyKey: `invite/${job.id}`, inviteId: job.id, type: "INVITE" }] : [];
      }
      if (sql.includes("is_invite_deliverable")) return [{ current_email: "buyer@example.test", deliverable: true }];
      throw new Error(`Unexpected query: ${sql.slice(0, 80)}`);
    });
    mocks.prisma.emailOutbox.updateMany.mockResolvedValue({ count: 1 });
    mocks.prisma.workerHeartbeat.upsert.mockResolvedValue({});
    mocks.sendInvite.mockImplementation(async () => {
      clock += 100;
      return { id: "provider-id", provider: "resend", queued: true };
    });
  });

  it("keeps claiming past the old ten-job batch until the queue is drained", async () => {
    await expect(processEmailOutbox(undefined, "drain-worker", { ...runOptions, sendIntervalMs: 0 }))
      .resolves.toEqual({ cancelled: 0, failed: 0, processed: 12, sent: 12 });

    expect(mocks.sendInvite).toHaveBeenCalledTimes(12);
    expect(heartbeatMetadata()).toMatchObject({ processed: 12, sent: 12, stoppedBy: "drained" });
  });

  it("stops claiming once the run's time budget is spent", async () => {
    mocks.sendInvite.mockImplementation(async () => {
      clock += 9_000;
      return { id: "slow-provider-id", provider: "resend", queued: true };
    });

    await expect(processEmailOutbox(undefined, "budget-worker", { ...runOptions, sendIntervalMs: 0 }))
      .resolves.toMatchObject({ processed: 3, sent: 3 });

    expect(EMAIL_WORKER_TIME_BUDGET_MS).toBe(20_000);
    expect(queue).toHaveLength(9);
    expect(heartbeatMetadata()).toMatchObject({ durationMs: 27_000, stoppedBy: "time-budget" });
  });

  it("paces provider submissions to stay under the provider rate limit", async () => {
    queue = queue.slice(0, 3);

    await processEmailOutbox(undefined, "paced-worker", runOptions);

    // Each send takes 100 ms, so the worker waits the remaining 500 ms before the next one.
    expect(waits).toEqual([500, 500]);
    expect(mocks.sendInvite).toHaveBeenCalledTimes(3);
  });

  it("stops after three consecutive failures and keeps addresses out of the stored error", async () => {
    mocks.sendInvite.mockRejectedValue(new Error("Invalid `to` field: buyer@example.test is not allowed."));

    await expect(processEmailOutbox(undefined, "failing-worker", { ...runOptions, sendIntervalMs: 0 }))
      .resolves.toEqual({ cancelled: 0, failed: 3, processed: 3, sent: 0 });

    expect(queue).toHaveLength(9);
    expect(heartbeatMetadata()).toMatchObject({ failed: 3, stoppedBy: "consecutive-failures" });
    const failures = mocks.prisma.emailOutbox.updateMany.mock.calls
      .map(([argument]) => argument.data)
      .filter((data) => data.status === "FAILED");
    expect(failures).toHaveLength(3);
    expect(failures.every((data) => data.lastError === "Invalid `to` field: [email] is not allowed.")).toBe(true);
  });

  it("honors an explicit job limit", async () => {
    await expect(processEmailOutbox(5, "limited-worker", { ...runOptions, sendIntervalMs: 0 }))
      .resolves.toMatchObject({ processed: 5 });

    expect(heartbeatMetadata()).toMatchObject({ stoppedBy: "job-limit" });
  });
});

function heartbeatMetadata() {
  return mocks.prisma.workerHeartbeat.upsert.mock.calls.at(-1)?.[0].update.metadata;
}
