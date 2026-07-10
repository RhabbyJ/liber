import { prisma, type Prisma } from "@liber/db";
import { randomUUID } from "node:crypto";
import { sendInviteEmail, type InviteEmailInput } from "./email";

const MAX_ATTEMPTS = 5;
const LEASE_SECONDS = 5 * 60;
const MAX_BATCH_SIZE = 100;

type ClaimedEmailJob = {
  attempts: number;
  id: string;
  leaseToken: string;
  payload: Prisma.JsonValue;
  recipientUserId: string | null;
  type: string;
};

export async function processEmailOutbox(limit = 10) {
  const batchSize = Math.max(1, Math.min(MAX_BATCH_SIZE, Math.trunc(limit) || 1));
  const leaseToken = randomUUID();
  const jobs = await prisma.$queryRaw<ClaimedEmailJob[]>`
    SELECT id, type, payload, attempts, "recipientUserId", "leaseToken"
    FROM app_private.claim_email_outbox(
      ${batchSize},
      ${leaseToken}::uuid,
      ${LEASE_SECONDS},
      ${MAX_ATTEMPTS}
    )
  `;

  let sent = 0;
  let failed = 0;

  for (const job of jobs) {
    try {
      if (!job.recipientUserId) {
        await cancelClaim(job, "RECIPIENT_REQUIRED");
        failed += 1;
        continue;
      }
      if (job.type !== "INVITE") throw new Error(`Unsupported email job type: ${job.type}`);

      const recipient = await prisma.user.findUnique({
        where: { id: job.recipientUserId },
        select: { email: true, status: true },
      });
      if (recipient?.status !== "ACTIVE") {
        await cancelClaim(job, "ACCOUNT_INACTIVE");
        failed += 1;
        continue;
      }

      await sendInviteEmail(
        {
          ...(job.payload as InviteEmailInput),
          to: recipient.email,
        },
        { idempotencyKey: `invite/${job.id}` },
      );
      const completed = await prisma.emailOutbox.updateMany({
        where: {
          cancelledAt: null,
          id: job.id,
          leaseToken: job.leaseToken,
          status: "SENDING",
        },
        data: {
          lastError: null,
          leaseExpiresAt: null,
          leaseToken: null,
          nextAttemptAt: null,
          sentAt: new Date(),
          status: "SENT",
        },
      });
      if (completed.count === 1) sent += 1;
      else failed += 1;
    } catch (error) {
      const message = error instanceof Error ? error.message.slice(0, 500) : "Email job failed.";
      const retryDelayMs = Math.min(60, 2 ** job.attempts) * 60_000;
      const released = await prisma.emailOutbox.updateMany({
        where: { id: job.id, leaseToken: job.leaseToken, status: "SENDING" },
        data: {
          lastError: message,
          leaseExpiresAt: null,
          leaseToken: null,
          nextAttemptAt: job.attempts >= MAX_ATTEMPTS
            ? null
            : new Date(Date.now() + retryDelayMs),
          status: "FAILED",
        },
      });
      if (released.count === 1) failed += 1;
    }
  }

  return { failed, processed: jobs.length, sent };
}

async function cancelClaim(job: Pick<ClaimedEmailJob, "id" | "leaseToken">, reason: string) {
  await prisma.emailOutbox.updateMany({
    where: { id: job.id, leaseToken: job.leaseToken, sentAt: null, status: "SENDING" },
    data: {
      cancelledAt: new Date(),
      lastError: reason,
      leaseExpiresAt: null,
      leaseToken: null,
      nextAttemptAt: null,
      status: "FAILED",
    },
  });
}
