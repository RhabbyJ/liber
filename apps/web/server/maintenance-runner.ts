import { createHash, timingSafeEqual } from "node:crypto";
import { prisma } from "@liber/db";
import { summarizeError, type ErrorSummary } from "./error-summary";

export type MaintenanceWorker = {
  /** Key in the route response and the worker label in logs. */
  name: string;
  /** WorkerHeartbeat row recorded after each successful run; readiness checks its age. */
  heartbeat?: string;
  run: () => Promise<unknown>;
};

export type MaintenanceWorkerFailure = {
  failed: true;
  error: Omit<ErrorSummary, "message">;
};

/**
 * Runs independent maintenance workers so one failure cannot hide the others'
 * results. A failed worker is logged with its class, codes, and a redacted
 * message (never recipients or content) and makes the route return 500, which
 * Vercel records as a failed cron invocation.
 */
export async function runMaintenanceWorkers(route: string, workers: MaintenanceWorker[]) {
  const outcomes = await Promise.all(workers.map(async (worker) => {
    try {
      const result = await worker.run();
      if (worker.heartbeat) await recordWorkerHeartbeat(worker.heartbeat, result);
      return { name: worker.name, ok: true, value: result };
    } catch (error) {
      const { message, ...codes } = summarizeError(error);
      console.error("Maintenance worker failed.", { route, worker: worker.name, ...codes, message });
      const failure: MaintenanceWorkerFailure = { failed: true, error: codes };
      return { name: worker.name, ok: false, value: failure };
    }
  }));
  const failedWorkers = outcomes.filter((outcome) => !outcome.ok).map((outcome) => outcome.name);
  return {
    body: {
      ...Object.fromEntries(outcomes.map((outcome) => [outcome.name, outcome.value])),
      ...(failedWorkers.length > 0 ? { failedWorkers } : {}),
    },
    status: failedWorkers.length > 0 ? 500 : 200,
  };
}

export async function recordWorkerHeartbeat(worker: string, result: unknown) {
  const metadata = heartbeatMetadata(result);
  await prisma.workerHeartbeat.upsert({
    where: { worker },
    update: { lastRunAt: new Date(), metadata },
    create: { worker, lastRunAt: new Date(), metadata },
  });
}

export function maintenanceRequestAuthorized(authorization: string | null, secret = process.env.CRON_SECRET) {
  if (!secret || !authorization) return false;
  const provided = createHash("sha256").update(authorization).digest();
  const expected = createHash("sha256").update(`Bearer ${secret}`).digest();
  return timingSafeEqual(provided, expected);
}

// Heartbeats keep only scalar counters and flags from a worker result.
function heartbeatMetadata(result: unknown) {
  if (typeof result !== "object" || result === null) return {};
  return Object.fromEntries(Object.entries(result).filter(([, value]) => (
    typeof value === "number" || typeof value === "boolean" || typeof value === "string"
  )));
}
