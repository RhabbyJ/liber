import { prisma, type Prisma } from "@liber/db";
import { createSupabaseAdminClient } from "./supabase";

const MAX_ATTEMPTS = 8;
const LEASE_MS = 2 * 60_000;

export type AuthOperationType = "BAN_USER" | "UNBAN_USER";

// Each operation sets the Supabase Auth ban to match one application account status.
const AUTH_OPERATIONS = new Map<string, { accountStatus: "ACTIVE" | "SUSPENDED"; banDuration: string }>([
  ["BAN_USER", { accountStatus: "SUSPENDED", banDuration: "876000h" }],
  ["UNBAN_USER", { accountStatus: "ACTIVE", banDuration: "none" }],
]);

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
      const effect = AUTH_OPERATIONS.get(operation.type);
      if (!effect) throw new Error(`Unsupported Auth operation: ${operation.type}`);
      const lease = await prisma.authOperation.updateMany({
        where: activeAuthClaim(operation, workerId),
        data: { leaseUntil: new Date(Date.now() + LEASE_MS) },
      });
      if (lease.count !== 1) continue;
      // A later suspension or reinstatement owns the account's Auth state now.
      if (await accountStatus(operation.userId) !== effect.accountStatus) {
        const result = await prisma.authOperation.updateMany({
          where: activeAuthClaim(operation, workerId),
          data: {
            completedAt: new Date(),
            lastError: "Superseded by a later account status change; Auth was not called.",
            leaseUntil: null,
            lockedAt: null,
            status: "COMPLETED",
            workerId: null,
          },
        });
        completed += result.count;
        continue;
      }
      const { error } = await supabase.auth.admin.updateUserById(operation.userId, { ban_duration: effect.banDuration });
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

async function accountStatus(userId: string) {
  const [account] = await prisma.$queryRaw<Array<{ status: string }>>`
    SELECT status::text AS status FROM public."User" WHERE id = ${userId}::uuid
  `;
  return account?.status ?? null;
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

/**
 * Queues the Auth ban or unban for an account status change made in `tx`. Unclaimed
 * operations of the opposite type are settled first: the newest status wins, and a
 * claimed one finishes before this operation becomes claimable.
 */
export async function queueAuthOperation(
  tx: Prisma.TransactionClient,
  userId: string,
  type: AuthOperationType,
  reason: string,
) {
  const superseded: AuthOperationType = type === "BAN_USER" ? "UNBAN_USER" : "BAN_USER";
  await tx.authOperation.updateMany({
    where: {
      userId,
      type: superseded,
      OR: [{ status: "PENDING" }, { status: "FAILED", attempts: { lt: MAX_ATTEMPTS } }],
    },
    data: { completedAt: new Date(), lastError: reason, nextAttemptAt: null, status: "COMPLETED" },
  });
  const id = `authop_${crypto.randomUUID()}`;
  await tx.authOperation.create({
    data: {
      id,
      // One row per status change: suspend, reinstate, then suspend again each need an Auth call.
      idempotencyKey: `${type === "BAN_USER" ? "ban-user" : "unban-user"}:${userId}:${id}`,
      status: "PENDING",
      type,
      userId,
    },
  });
  return id;
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
      SELECT candidate.id
      FROM public."AuthOperation" candidate
      WHERE candidate.attempts < ${MAX_ATTEMPTS}
        AND (
          (candidate.status IN ('PENDING', 'FAILED') AND (candidate."nextAttemptAt" IS NULL OR candidate."nextAttemptAt" <= now()))
          OR (candidate.status = 'PROCESSING' AND (candidate."leaseUntil" IS NULL OR candidate."leaseUntil" <= now()))
        )
        -- One account's operations run in creation order, so a ban and a later unban
        -- can never reach Supabase out of order.
        AND NOT EXISTS (
          SELECT 1
          FROM public."AuthOperation" earlier
          WHERE earlier."userId" = candidate."userId"
            AND (earlier."createdAt", earlier.id) < (candidate."createdAt", candidate.id)
            AND (
              earlier.status IN ('PENDING', 'PROCESSING')
              OR (earlier.status = 'FAILED' AND earlier.attempts < ${MAX_ATTEMPTS})
            )
        )
      ORDER BY candidate."createdAt" ASC
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
