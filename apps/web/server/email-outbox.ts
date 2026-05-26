import { prisma } from "@liber/db";
import { sendInviteEmail, type InviteEmailInput } from "./email";

const MAX_ATTEMPTS = 5;

export async function processEmailOutbox(limit = 10) {
  const now = new Date();
  const jobs = await prisma.emailOutbox.findMany({
    where: {
      attempts: { lt: MAX_ATTEMPTS },
      AND: [
        { OR: [{ status: "PENDING" }, { status: "FAILED" }] },
        { OR: [{ nextAttemptAt: null }, { nextAttemptAt: { lte: now } }] },
      ],
    },
    orderBy: { createdAt: "asc" },
    take: limit,
  });

  let sent = 0;
  let failed = 0;

  for (const job of jobs) {
    const attempts = job.attempts + 1;
    await prisma.emailOutbox.update({
      where: { id: job.id },
      data: { attempts, status: "SENDING" },
    });

    try {
      if (job.type !== "INVITE") throw new Error(`Unsupported email job type: ${job.type}`);
      await sendInviteEmail(job.payload as InviteEmailInput);
      await prisma.emailOutbox.update({
        where: { id: job.id },
        data: {
          lastError: null,
          nextAttemptAt: null,
          sentAt: new Date(),
          status: "SENT",
        },
      });
      sent += 1;
    } catch (error) {
      const message = error instanceof Error ? error.message : "Email job failed.";
      const retryDelayMs = Math.min(60, 2 ** attempts) * 60_000;
      await prisma.emailOutbox.update({
        where: { id: job.id },
        data: {
          lastError: message,
          nextAttemptAt: attempts >= MAX_ATTEMPTS ? null : new Date(Date.now() + retryDelayMs),
          status: "FAILED",
        },
      });
      failed += 1;
    }
  }

  return { failed, processed: jobs.length, sent };
}
