import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  context: vi.fn(), mutation: vi.fn(), delivery: vi.fn(), lockedDelivery: vi.fn(), send: vi.fn(),
  prisma: {
    tourSchedule: { findUnique: vi.fn(), create: vi.fn(), update: vi.fn() },
    emailOutbox: { create: vi.fn(), updateMany: vi.fn(), findFirst: vi.fn() },
    workerHeartbeat: { findUnique: vi.fn() }, adminAuditLog: { create: vi.fn() }, message: { create: vi.fn() },
  },
}));
vi.mock("@liber/db", () => ({ prisma: mocks.prisma }));
vi.mock("./tour-gate", () => ({ getConversationScheduleContext: mocks.context, withConversationScheduleMutation: mocks.mutation, getConversationScheduleDeliveryContext: mocks.delivery, withConversationScheduleDelivery: mocks.lockedDelivery }));
vi.mock("../email", () => ({ sendTourEmail: mocks.send }));
import { getConversationTour, mutateConversationTour, prepareTourEmail, sendCurrentTourEmail, tourOutboxKey } from "./tours";
import { MessagingError } from "./errors";

const conversationId = "019f62c5-1c07-4a62-9f9a-8302778aa011";
const seller = "019f62c5-1c07-4a62-9f9a-8302778aa012";
const buyer = "019f62c5-1c07-4a62-9f9a-8302778aa013";
const clientActionId = "019f62c5-1c07-4a62-9f9a-8302778aa014";
const id = "019f62c5-1c07-4a62-9f9a-8302778aa015";
let current: Record<string, unknown> | null;
let actor: string;
const proposal = { action: "PROPOSE", clientActionId, expectedRevision: 0, startsAt: "2026-10-01T18:00:00.000Z", timeZone: "America/Los_Angeles", durationMinutes: 60 };

describe("tour lifecycle", () => {
  beforeEach(() => {
    vi.clearAllMocks(); vi.useFakeTimers(); vi.setSystemTime(new Date("2026-10-01T12:00:00Z"));
    vi.stubEnv("LIBER_TOUR_REMINDERS_ENABLED", "true");
    actor = seller; current = null;
    mocks.context.mockImplementation(async () => ({ userId: actor, canSchedule: true, canReceiveTourEmail: true }));
    mocks.mutation.mockImplementation(async (_id, operation) => operation(mocks.prisma, { userId: actor, otherUserId: actor === seller ? buyer : seller, canSchedule: true }));
    mocks.prisma.tourSchedule.findUnique.mockImplementation(async () => current);
    mocks.prisma.tourSchedule.create.mockImplementation(async ({ data }) => { current = { id, ...data }; return current; });
    mocks.prisma.tourSchedule.update.mockImplementation(async ({ data }) => { current = { ...current, ...data }; return current; });
    mocks.prisma.workerHeartbeat.findUnique.mockResolvedValue({ lastRunAt: new Date() });
    mocks.delivery.mockResolvedValue({ email: "recipient@example.test" });
    mocks.lockedDelivery.mockImplementation(async (_conversation, _recipient, operation) => operation(mocks.prisma, { email: "current-recipient@example.test" }));
    mocks.prisma.emailOutbox.findFirst.mockResolvedValue({ id: "outbox-job" });
    mocks.send.mockResolvedValue({ provider: "resend", queued: true });
  });
  afterEach(() => { vi.useRealTimers(); vi.unstubAllEnvs(); });

  it("proposes, confirms as the other party, replaces and cancels without duplicate side effects", async () => {
    await expect(mutateConversationTour(conversationId, proposal)).resolves.toMatchObject({ schedule: { status: "PROPOSED", revision: 1, proposedByYou: true } });
    expect(mocks.prisma.emailOutbox.create).toHaveBeenCalledTimes(1);
    expect(mocks.prisma.message.create).toHaveBeenCalledTimes(1);
    await mutateConversationTour(conversationId, proposal);
    expect(mocks.prisma.emailOutbox.create).toHaveBeenCalledTimes(1);
    expect(mocks.prisma.message.create).toHaveBeenCalledTimes(1);
    actor = buyer;
    await expect(mutateConversationTour(conversationId, { action: "CONFIRM", expectedRevision: 1, clientActionId: crypto.randomUUID() })).resolves.toMatchObject({ schedule: { status: "CONFIRMED", revision: 2 } });
    expect(mocks.prisma.emailOutbox.create).toHaveBeenCalledTimes(6);
    const notifications = mocks.prisma.emailOutbox.create.mock.calls.slice(2).map(([args]) => args.data);
    expect(notifications.filter((row) => row.tourEvent === "REMINDER")).toHaveLength(2);
    expect(notifications.filter((row) => row.tourEvent === "FOLLOW_UP")).toHaveLength(2);
    expect(notifications.every((row) => row.to === "" && JSON.stringify(row.payload) === "{}")).toBe(true);
    await expect(mutateConversationTour(conversationId, { ...proposal, clientActionId: crypto.randomUUID(), expectedRevision: 2 })).resolves.toMatchObject({ schedule: { status: "PROPOSED", revision: 3, proposedByYou: true } });
    await expect(mutateConversationTour(conversationId, { action: "CANCEL", expectedRevision: 3, clientActionId: crypto.randomUUID() })).resolves.toMatchObject({ schedule: { status: "CANCELLED", revision: 4 } });
    expect(mocks.prisma.emailOutbox.updateMany).toHaveBeenCalledTimes(4);
  });

  it("rejects self confirmation, stale revisions and confirmation of a cancelled tour", async () => {
    await mutateConversationTour(conversationId, proposal);
    await expect(mutateConversationTour(conversationId, { ...proposal, durationMinutes: 30 })).rejects.toThrow("different tour update");
    await expect(mutateConversationTour(conversationId, { action: "CONFIRM", expectedRevision: 1, clientActionId: crypto.randomUUID() })).rejects.toThrow("Only the other participant");
    actor = buyer;
    await expect(mutateConversationTour(conversationId, { action: "CONFIRM", expectedRevision: 2, clientActionId: crypto.randomUUID() })).rejects.toThrow("tour changed");
    await mutateConversationTour(conversationId, { action: "CANCEL", expectedRevision: 1, clientActionId: crypto.randomUUID() });
    await expect(mutateConversationTour(conversationId, { action: "CONFIRM", expectedRevision: 2, clientActionId: crypto.randomUUID() })).rejects.toThrow("no longer be changed");
  });

  it("rejects too-near, past and far-future proposals before writing", async () => {
    for (const startsAt of ["2026-10-01T12:10:00Z", "2026-09-01T12:00:00Z", "2027-10-01T12:00:00Z"]) {
      await expect(mutateConversationTour(conversationId, { ...proposal, startsAt })).rejects.toThrow("15 minutes and 180 days");
    }
    expect(mocks.prisma.tourSchedule.create).not.toHaveBeenCalled();
  });

  it("does not promise reminders for synthetic/muted/ineligible recipients or stale workers", async () => {
    vi.stubEnv("RESEND_API_KEY", "test"); vi.stubEnv("RESEND_FROM_EMAIL", "test@example.test");
    await expect(getConversationTour(conversationId)).resolves.toMatchObject({ emailRemindersAvailable: true });
    vi.stubEnv("LIBER_TOUR_REMINDERS_ENABLED", "false");
    await expect(getConversationTour(conversationId)).resolves.toMatchObject({ emailRemindersAvailable: false });
    vi.stubEnv("LIBER_TOUR_REMINDERS_ENABLED", "true");
    mocks.context.mockResolvedValue({ userId: actor, canSchedule: true, canReceiveTourEmail: false });
    await expect(getConversationTour(conversationId)).resolves.toMatchObject({ emailRemindersAvailable: false });
    mocks.context.mockResolvedValue({ userId: actor, canSchedule: true, canReceiveTourEmail: true });
    mocks.prisma.workerHeartbeat.findUnique.mockResolvedValue({ lastRunAt: new Date("2026-10-01T10:00:00Z") });
    await expect(getConversationTour(conversationId)).resolves.toMatchObject({ emailRemindersAvailable: false });
  });

  it("revalidates event, recipient, eligibility, revision and lease immediately before provider send", async () => {
    await mutateConversationTour(conversationId, proposal);
    const job = { id: "outbox-job", attempts: 1, tourScheduleId: id, tourRevision: 1, tourRecipientUserId: buyer, tourEvent: "PROPOSED", idempotencyKey: tourOutboxKey(id, 1, "PROPOSED", buyer) };
    await expect(prepareTourEmail(job)).resolves.toMatchObject({ conversationId, to: "recipient@example.test" });
    await expect(sendCurrentTourEmail(job, "worker")).resolves.toMatchObject({ provider: "resend" });
    expect(mocks.prisma.emailOutbox.findFirst).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ attempts: 1, workerId: "worker", status: "SENDING" }) }));
    expect(mocks.send).toHaveBeenCalledWith({ conversationId, to: "current-recipient@example.test", event: "PROPOSED" }, job.idempotencyKey);
    await expect(prepareTourEmail({ ...job, tourRevision: 2 })).resolves.toBeNull();
    mocks.prisma.emailOutbox.findFirst.mockResolvedValue(null);
    await expect(sendCurrentTourEmail(job, "lost-worker")).resolves.toBeNull();
    expect(mocks.send).toHaveBeenCalledTimes(1);
    mocks.delivery.mockRejectedValue(new MessagingError("NOT_FOUND", "Unavailable", 404));
    await expect(prepareTourEmail(job)).resolves.toBeNull();
  });

  it("reads the schedule and lease one at a time on the locked delivery connection", async () => {
    await mutateConversationTour(conversationId, proposal);
    const job = { id: "outbox-job", attempts: 1, tourScheduleId: id, tourRevision: 1, tourRecipientUserId: buyer, tourEvent: "PROPOSED", idempotencyKey: tourOutboxKey(id, 1, "PROPOSED", buyer) };
    let inFlight = 0;
    let maxInFlight = 0;
    const tracked = <T,>(read: () => Promise<T>) => async () => {
      inFlight += 1;
      maxInFlight = Math.max(maxInFlight, inFlight);
      // Timers are faked here; microtask turns are enough to expose a fan-out.
      for (let turn = 0; turn < 3; turn += 1) await Promise.resolve();
      inFlight -= 1;
      return read();
    };
    mocks.lockedDelivery.mockImplementation(async (_conversation, _recipient, operation) => {
      const findSchedule = tracked(async () => current);
      const findLease = tracked(async () => ({ id: "outbox-job" }));
      return operation({
        ...mocks.prisma,
        tourSchedule: { ...mocks.prisma.tourSchedule, findUnique: vi.fn(findSchedule) },
        emailOutbox: { ...mocks.prisma.emailOutbox, findFirst: vi.fn(findLease) },
      }, { email: "current-recipient@example.test" });
    });
    await expect(sendCurrentTourEmail(job, "worker")).resolves.toMatchObject({ provider: "resend" });
    expect(maxInFlight).toBe(1);
  });

  it("calls the provider only after the locked eligibility decision has committed", async () => {
    await mutateConversationTour(conversationId, proposal);
    const job = { id: "outbox-job", attempts: 1, tourScheduleId: id, tourRevision: 1, tourRecipientUserId: buyer, tourEvent: "PROPOSED", idempotencyKey: tourOutboxKey(id, 1, "PROPOSED", buyer) };
    let transactionOpen = false;
    mocks.lockedDelivery.mockImplementation(async (_conversation, _recipient, operation) => {
      transactionOpen = true;
      try {
        return await operation(mocks.prisma, { email: "current-recipient@example.test" });
      } finally {
        transactionOpen = false;
      }
    });
    mocks.send.mockImplementation(async () => {
      expect(transactionOpen).toBe(false);
      return { provider: "resend", queued: true };
    });
    await expect(sendCurrentTourEmail(job, "worker")).resolves.toMatchObject({ provider: "resend" });
    expect(mocks.send).toHaveBeenCalledOnce();
    expect(mocks.send).toHaveBeenCalledWith({ conversationId, to: "current-recipient@example.test", event: "PROPOSED" }, job.idempotencyKey);
  });

  it("surfaces a provider failure after commit so the outbox retries with the same key", async () => {
    await mutateConversationTour(conversationId, proposal);
    const job = { id: "outbox-job", attempts: 1, tourScheduleId: id, tourRevision: 1, tourRecipientUserId: buyer, tourEvent: "PROPOSED", idempotencyKey: tourOutboxKey(id, 1, "PROPOSED", buyer) };
    mocks.send.mockRejectedValueOnce(new Error("Provider unavailable."));
    await expect(sendCurrentTourEmail(job, "worker")).rejects.toThrow("Provider unavailable.");
    await expect(sendCurrentTourEmail(job, "worker")).resolves.toMatchObject({ provider: "resend" });
    expect(mocks.send.mock.calls.map(([, key]) => key)).toEqual([job.idempotencyKey, job.idempotencyKey]);
  });

  it("cancels a notification when rescheduling wins the lock before dispatch", async () => {
    await mutateConversationTour(conversationId, proposal);
    const job = { id: "outbox-job", attempts: 1, tourScheduleId: id, tourRevision: 1, tourRecipientUserId: buyer, tourEvent: "PROPOSED", idempotencyKey: tourOutboxKey(id, 1, "PROPOSED", buyer) };
    mocks.lockedDelivery.mockImplementation(async (_conversation, _recipient, operation) => {
      current = { ...current, revision: 2 };
      return operation(mocks.prisma, { email: "recipient@example.test" });
    });
    await expect(sendCurrentTourEmail(job, "worker")).resolves.toBeNull();
    expect(mocks.send).not.toHaveBeenCalled();
  });
});
