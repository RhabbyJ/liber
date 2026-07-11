import { prisma } from "@liber/db";
import { sendInviteEmail, type InviteEmailInput } from "./email";

const MAX_ATTEMPTS = 5;
const LEASE_MS = 2 * 60_000;

type ClaimedEmailJob = {
  id: string;
  type: string;
  payload: InviteEmailInput;
  attempts: number;
  idempotencyKey: string;
  inviteId: string | null;
};

export async function processEmailOutbox(limit = 10, workerId = `email_${crypto.randomUUID()}`) {
  const jobs = await claimEmailJobs(limit, workerId);
  let sent = 0;
  let failed = 0;
  let cancelled = 0;

  for (const job of jobs) {
    try {
      if (job.type !== "INVITE") throw new Error(`Unsupported email job type: ${job.type}`);
      if (!job.inviteId || !(await isInviteDeliverable(job.inviteId))) {
        await prisma.emailOutbox.updateMany({
          where: { id: job.id, status: "SENDING", workerId },
          data: {
            lastError: "Invite became ineligible before delivery.",
            leaseUntil: null,
            lockedAt: null,
            nextAttemptAt: null,
            status: "CANCELLED",
            workerId: null,
          },
        });
        cancelled += 1;
        continue;
      }
      const result = await sendInviteEmail(job.payload, job.idempotencyKey);
      if (result.provider === "mock" && process.env.NODE_ENV !== "development" && process.env.NODE_ENV !== "test") {
        throw new Error(result.reason || "Email provider is not configured.");
      }
      await prisma.emailOutbox.updateMany({
        where: { id: job.id, status: "SENDING", workerId },
        data: {
          lastError: null,
          leaseUntil: null,
          lockedAt: null,
          nextAttemptAt: null,
          providerMessageId: result.id ?? (result.provider === "mock" ? "development-mock" : null),
          sentAt: new Date(),
          status: "SENT",
          workerId: null,
        },
      });
      sent += 1;
    } catch (error) {
      const message = error instanceof Error ? error.message : "Email job failed.";
      const retryDelayMs = Math.min(60, 2 ** job.attempts) * 60_000;
      await prisma.emailOutbox.updateMany({
        where: { id: job.id, status: "SENDING", workerId },
        data: {
          lastError: message,
          leaseUntil: null,
          lockedAt: null,
          nextAttemptAt: job.attempts >= MAX_ATTEMPTS ? null : new Date(Date.now() + retryDelayMs),
          status: "FAILED",
          workerId: null,
        },
      });
      failed += 1;
    }
  }

  await prisma.workerHeartbeat.upsert({
    where: { worker: "email-outbox" },
    update: { lastRunAt: new Date(), metadata: { cancelled, failed, processed: jobs.length, sent } },
    create: { worker: "email-outbox", lastRunAt: new Date(), metadata: { cancelled, failed, processed: jobs.length, sent } },
  });
  return { cancelled, failed, processed: jobs.length, sent };
}

export async function claimEmailJobs(limit: number, workerId: string): Promise<ClaimedEmailJob[]> {
  const leaseUntil = new Date(Date.now() + LEASE_MS);
  return prisma.$queryRaw<ClaimedEmailJob[]>`
    WITH candidates AS (
      SELECT id
      FROM public."EmailOutbox"
      WHERE attempts < ${MAX_ATTEMPTS}
        AND (
          (status IN ('PENDING', 'FAILED') AND ("nextAttemptAt" IS NULL OR "nextAttemptAt" <= now()))
          OR (status = 'SENDING' AND ("leaseUntil" IS NULL OR "leaseUntil" <= now()))
        )
      ORDER BY "createdAt" ASC
      FOR UPDATE SKIP LOCKED
      LIMIT ${limit}
    )
    UPDATE public."EmailOutbox" job
    SET
      attempts = job.attempts + 1,
      status = 'SENDING',
      "lockedAt" = now(),
      "leaseUntil" = ${leaseUntil},
      "workerId" = ${workerId},
      "updatedAt" = now()
    FROM candidates
    WHERE job.id = candidates.id
    RETURNING
      job.id,
      job.type,
      job.payload,
      job.attempts,
      job."inviteId" AS "inviteId",
      job."idempotencyKey" AS "idempotencyKey"
  `;
}

async function isInviteDeliverable(inviteId: string) {
  const [result] = await prisma.$queryRaw<Array<{ deliverable: boolean }>>`
    SELECT app_private.is_invite_deliverable(${inviteId}) AS deliverable
  `;
  return result?.deliverable === true;
}
