import { prisma } from "@liber/db";
import { createSupabaseAdminClient } from "./supabase";

const MAX_ATTEMPTS = 8;
const LEASE_MS = 2 * 60_000;

type ClaimedAuthOperation = {
  id: string;
  userId: string;
  type: string;
  attempts: number;
};

export async function processAuthOperations(limit = 10, workerId = `auth_${crypto.randomUUID()}`) {
  let completed = 0;
  let failed = 0;
  let processed = 0;
  const supabase = createSupabaseAdminClient();

  while (processed < limit) {
    const [operation] = await claimAuthOperations(1, workerId);
    if (!operation) break;
    processed += 1;
    try {
      if (!supabase) throw new Error("Supabase Auth admin client is not configured.");
      if (operation.type !== "BAN_USER") throw new Error(`Unsupported Auth operation: ${operation.type}`);
      const lease = await prisma.authOperation.updateMany({
        where: activeAuthClaim(operation, workerId),
        data: { leaseUntil: new Date(Date.now() + LEASE_MS) },
      });
      if (lease.count !== 1) continue;
      const { error } = await supabase.auth.admin.updateUserById(operation.userId, { ban_duration: "876000h" });
      if (error) throw new Error(error.message);
      const result = await prisma.authOperation.updateMany({
        where: activeAuthClaim(operation, workerId),
        data: {
          completedAt: new Date(),
          lastError: null,
          leaseUntil: null,
          lockedAt: null,
          status: "COMPLETED",
          workerId: null,
        },
      });
      completed += result.count;
    } catch (error) {
      const message = error instanceof Error ? error.message : "Auth operation failed.";
      const result = await prisma.authOperation.updateMany({
        where: activeAuthClaim(operation, workerId),
        data: {
          lastError: message,
          leaseUntil: null,
          lockedAt: null,
          nextAttemptAt: operation.attempts >= MAX_ATTEMPTS
            ? null
            : new Date(Date.now() + Math.min(60, 2 ** operation.attempts) * 60_000),
          status: "FAILED",
          workerId: null,
        },
      });
      failed += result.count;
    }
  }

  await prisma.workerHeartbeat.upsert({
    where: { worker: "auth-operations" },
    update: { lastRunAt: new Date(), metadata: { completed, failed, processed } },
    create: { worker: "auth-operations", lastRunAt: new Date(), metadata: { completed, failed, processed } },
  });
  return { completed, failed, processed };
}

function activeAuthClaim(operation: ClaimedAuthOperation, workerId: string) {
  return {
    id: operation.id,
    attempts: operation.attempts,
    leaseUntil: { gt: new Date() },
    status: "PROCESSING" as const,
    workerId,
  };
}

export async function claimAuthOperations(limit: number, workerId: string): Promise<ClaimedAuthOperation[]> {
  const leaseUntil = new Date(Date.now() + LEASE_MS);
  return prisma.$queryRaw<ClaimedAuthOperation[]>`
    WITH exhausted_candidates AS (
      SELECT id
      FROM public."AuthOperation"
      WHERE status = 'PROCESSING' AND attempts >= ${MAX_ATTEMPTS}
        AND ("leaseUntil" IS NULL OR "leaseUntil" <= now())
      ORDER BY "createdAt" ASC
      FOR UPDATE SKIP LOCKED
      LIMIT ${limit}
    ), exhausted AS (
      UPDATE public."AuthOperation" operation
      SET status = 'FAILED', "lastError" = 'Auth operation lease expired after the final attempt.',
        "leaseUntil" = NULL, "lockedAt" = NULL, "workerId" = NULL,
        "nextAttemptAt" = NULL, "updatedAt" = now()
      FROM exhausted_candidates
      WHERE operation.id = exhausted_candidates.id
      RETURNING operation.id
    ), candidates AS (
      SELECT id
      FROM public."AuthOperation"
      WHERE attempts < ${MAX_ATTEMPTS}
        AND (
          (status IN ('PENDING', 'FAILED') AND ("nextAttemptAt" IS NULL OR "nextAttemptAt" <= now()))
          OR (status = 'PROCESSING' AND ("leaseUntil" IS NULL OR "leaseUntil" <= now()))
        )
      ORDER BY "createdAt" ASC
      FOR UPDATE SKIP LOCKED
      LIMIT ${limit}
    )
    UPDATE public."AuthOperation" operation
    SET
      attempts = operation.attempts + 1,
      status = 'PROCESSING',
      "lockedAt" = now(),
      "leaseUntil" = ${leaseUntil},
      "workerId" = ${workerId},
      "updatedAt" = now()
    FROM candidates
    WHERE operation.id = candidates.id
    RETURNING operation.id, operation."userId" AS "userId", operation.type, operation.attempts
  `;
}
