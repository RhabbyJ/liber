import { Prisma, prisma } from "@liber/db";
import {
  tourEventIsCurrent, tourMutationSchema, tourNotificationTime,
  type TourEvent, type TourView,
} from "../../lib/tour-scheduling";
import { MessagingError } from "./errors";
import { sendTourEmail } from "../email";
import {
  getConversationScheduleContext, getConversationScheduleDeliveryContext,
  withConversationScheduleMutation,
  withConversationScheduleDelivery,
} from "./service";

type Tour = NonNullable<Awaited<ReturnType<typeof prisma.tourSchedule.findUnique>>>;

export async function getConversationTour(conversationId: string) {
  const context = await getConversationScheduleContext(conversationId);
  const [schedule, heartbeat] = await Promise.all([
    prisma.tourSchedule.findUnique({ where: { conversationId } }),
    prisma.workerHeartbeat.findUnique({ where: { worker: "email-outbox" }, select: { lastRunAt: true } }),
  ]);
  return {
    ...tourView(schedule, context),
    emailRemindersAvailable: Boolean(process.env.LIBER_TOUR_REMINDERS_ENABLED === "true"
      && context.canReceiveTourEmail && process.env.RESEND_API_KEY && process.env.RESEND_FROM_EMAIL
      && heartbeat && heartbeat.lastRunAt.getTime() >= Date.now() - 5 * 60_000),
  };
}

export async function mutateConversationTour(conversationId: string, rawInput: unknown) {
  const input = tourMutationSchema.parse(rawInput);
  return withConversationScheduleMutation(conversationId, async (tx, context) => {
    const current = await tx.tourSchedule.findUnique({ where: { conversationId } });
    if (current?.lastActionId === input.clientActionId && current.lastActorUserId === context.userId) {
      const expectedStatus = input.action === "PROPOSE" ? "PROPOSED" : input.action === "CONFIRM" ? "CONFIRMED" : "CANCELLED";
      const sameProposal = input.action !== "PROPOSE" || (
        current.startsAt.toISOString() === new Date(input.startsAt).toISOString()
        && current.timeZone === input.timeZone && current.durationMinutes === input.durationMinutes
      );
      if (current.status !== expectedStatus || input.expectedRevision !== current.revision - 1 || !sameProposal) {
        throw new MessagingError("CONFLICT", "This request was already used for a different tour update. Refresh and try again.", 409);
      }
      return tourView(current, context);
    }
    if ((current?.revision ?? 0) !== input.expectedRevision) {
      throw new MessagingError("CONFLICT", "The tour changed. Refresh and review the latest time.", 409);
    }
    const now = new Date();
    if (input.action === "PROPOSE") {
      const startsAt = new Date(input.startsAt);
      if (startsAt.getTime() < now.getTime() + 15 * 60_000 || startsAt.getTime() > now.getTime() + 180 * 86_400_000) {
        throw new MessagingError("INVALID_INPUT", "Choose a tour time between 15 minutes and 180 days from now.", 400);
      }
    } else if (!current || current.status === "CANCELLED" || current.startsAt.getTime() <= now.getTime()) {
      throw new MessagingError("CONFLICT", "This tour can no longer be changed. Propose a new time.", 409);
    } else if (input.action === "CONFIRM" && (current.status !== "PROPOSED" || current.proposedByUserId === context.userId)) {
      throw new MessagingError("CONFLICT", "Only the other participant can confirm a proposed time.", 409);
    }
    const event: TourEvent = input.action === "PROPOSE" ? "PROPOSED" : input.action === "CONFIRM" ? "CONFIRMED" : "CANCELLED";
    const revision = (current?.revision ?? 0) + 1;
    const data = {
      lastActionId: input.clientActionId,
      lastActorUserId: context.userId,
      revision,
      status: event,
      ...(input.action === "PROPOSE" ? {
        startsAt: new Date(input.startsAt), timeZone: input.timeZone,
        durationMinutes: input.durationMinutes, proposedByUserId: context.userId,
      } : {}),
    };
    const schedule = current
      ? await tx.tourSchedule.update({ where: { id: current.id }, data })
      : await tx.tourSchedule.create({ data: {
        ...data, conversationId,
        startsAt: new Date(input.action === "PROPOSE" ? input.startsAt : ""),
        timeZone: input.action === "PROPOSE" ? input.timeZone : "UTC",
        durationMinutes: input.action === "PROPOSE" ? input.durationMinutes : 60,
        proposedByUserId: context.userId,
      } });
    await tx.emailOutbox.updateMany({
      where: { tourScheduleId: schedule.id, status: { in: ["PENDING", "FAILED", "SENDING"] } },
      data: { status: "CANCELLED", nextAttemptAt: null, lockedAt: null, leaseUntil: null, workerId: null, lastError: "Tour schedule changed." },
    });
    await queueTourEmail(tx, schedule, context.otherUserId, event, now);
    if (event === "CONFIRMED") {
      for (const recipient of [context.userId, context.otherUserId]) {
        for (const notification of ["REMINDER", "FOLLOW_UP"] as const) {
          await queueTourEmail(tx, schedule, recipient, notification, now);
        }
      }
    }
    await tx.adminAuditLog.create({ data: {
      actorUserId: context.userId, action: `TOUR_${event}`, targetType: "TourSchedule", targetId: schedule.id,
      metadata: { conversationId, revision, startsAt: schedule.startsAt.toISOString(), durationMinutes: schedule.durationMinutes, timeZone: schedule.timeZone },
    } });
    await tx.message.create({ data: {
      conversationId, kind: "SYSTEM", clientMessageId: crypto.randomUUID(),
      body: event === "PROPOSED" ? "A property tour time was proposed. Review the tour schedule above."
        : event === "CONFIRMED" ? "The property tour was confirmed. Review the tour schedule above."
          : "The property tour was cancelled. You can propose another time in the tour schedule above.",
    }, select: { id: true } });
    return tourView(schedule, context);
  });
}

function tourView(schedule: Tour | null, context: { userId: string; canSchedule: boolean }): TourView {
  return { canSchedule: context.canSchedule, schedule: schedule ? {
    revision: schedule.revision, status: schedule.status as "PROPOSED" | "CONFIRMED" | "CANCELLED",
    startsAt: schedule.startsAt.toISOString(), timeZone: schedule.timeZone,
    durationMinutes: schedule.durationMinutes, proposedByYou: schedule.proposedByUserId === context.userId,
  } : null };
}

async function queueTourEmail(tx: Prisma.TransactionClient, schedule: Tour, recipient: string, event: TourEvent, now: Date) {
  await tx.emailOutbox.create({ data: {
    type: "TOUR_UPDATE", to: "", payload: {},
    idempotencyKey: tourOutboxKey(schedule.id, schedule.revision, event, recipient),
    tourScheduleId: schedule.id, tourRevision: schedule.revision, tourRecipientUserId: recipient, tourEvent: event,
    nextAttemptAt: tourNotificationTime(event, schedule.startsAt, schedule.durationMinutes, now),
  }, select: { id: true } });
}

export function tourOutboxKey(id: string, revision: number, event: string, recipient: string) {
  return `tour:${id}:${revision}:${event}:${recipient}`;
}

type TourEmailJob = {
  tourScheduleId?: string | null; tourRevision?: number | null; tourRecipientUserId?: string | null;
  tourEvent?: string | null; idempotencyKey: string;
};

export async function prepareTourEmail(job: TourEmailJob) {
  if (process.env.LIBER_TOUR_REMINDERS_ENABLED !== "true") return null;
  const { tourScheduleId: id, tourRevision: revision, tourRecipientUserId: recipient, tourEvent: event } = job;
  if (!id || !revision || !recipient || !event || job.idempotencyKey !== tourOutboxKey(id, revision, event, recipient)) return null;
  const schedule = await prisma.tourSchedule.findUnique({ where: { id } });
  if (!schedule || !tourEventIsCurrent({
    event, revision, currentRevision: schedule.revision, status: schedule.status,
    startsAt: schedule.startsAt, durationMinutes: schedule.durationMinutes, now: new Date(),
  })) return null;
  if (["PROPOSED", "CONFIRMED", "CANCELLED"].includes(event) && recipient === schedule.lastActorUserId) return null;
  try {
    const access = await getConversationScheduleDeliveryContext(schedule.conversationId, recipient);
    if (!access?.email?.trim()) return null;
    return { conversationId: schedule.conversationId, to: access.email.trim(), event: event as TourEvent };
  } catch (error) {
    if (error instanceof MessagingError) return null;
    throw error;
  }
}

export async function sendCurrentTourEmail(job: TourEmailJob & { id: string; attempts: number }, workerId: string) {
  const prepared = await prepareTourEmail(job);
  if (!prepared || !job.tourRecipientUserId) return null;
  try {
    return await withConversationScheduleDelivery(prepared.conversationId, job.tourRecipientUserId, async (tx, recipient) => {
      // Hold the same locks as reschedule/cancel/block through provider dispatch.
      // Provider idempotency protects retry if delivery succeeds but this transaction fails.
      // One interactive transaction is one connection: run its queries sequentially.
      const schedule = await tx.tourSchedule.findUnique({ where: { id: job.tourScheduleId! } });
      const lease = await tx.emailOutbox.findFirst({ where: { id: job.id, attempts: job.attempts, status: "SENDING", workerId, leaseUntil: { gt: new Date() } }, select: { id: true } });
      if (!lease || !schedule || !tourEventIsCurrent({
        event: job.tourEvent!, revision: job.tourRevision!, currentRevision: schedule.revision,
        status: schedule.status, startsAt: schedule.startsAt, durationMinutes: schedule.durationMinutes, now: new Date(),
      })) return null;
      return sendTourEmail({ ...prepared, to: recipient.email }, job.idempotencyKey);
    });
  } catch (error) {
    if (error instanceof MessagingError) return null;
    throw error;
  }
}
