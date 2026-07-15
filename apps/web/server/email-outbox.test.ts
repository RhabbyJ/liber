import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  prisma: {
    $queryRaw: vi.fn(),
    emailOutbox: { updateMany: vi.fn() },
    workerHeartbeat: { upsert: vi.fn() },
  },
  sendInvite: vi.fn(),
  sendUnread: vi.fn(),
}));

vi.mock("@liber/db", () => ({ prisma: mocks.prisma }));
vi.mock("./email", () => ({
  sendInviteEmail: mocks.sendInvite,
  sendUnreadMessageEmail: mocks.sendUnread,
}));

import { processEmailOutbox } from "./email-outbox";

const conversationId = "019f62c5-1c07-4a62-9f9a-8302778aa011";
const recipientUserId = "019f62c5-1c07-4a62-9f9a-8302778aa012";
const sellerUserId = "019f62c5-1c07-4a62-9f9a-8302778aa013";

describe("email outbox messaging dispatch", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv("LIBER_MESSAGING_V1_ENABLED", "true");
    vi.stubEnv("LIBER_MESSAGING_V1_COHORT_USER_IDS", "*");
    mocks.prisma.emailOutbox.updateMany.mockResolvedValue({ count: 1 });
    mocks.prisma.workerHeartbeat.upsert.mockResolvedValue({});
    mocks.sendUnread.mockResolvedValue({ id: "email-id", provider: "resend", queued: true });
    mocks.sendInvite.mockResolvedValue({ id: "invite-email-id", provider: "resend", queued: true });
  });

  afterEach(() => vi.unstubAllEnvs());

  it("dispatches MESSAGE_UNREAD with identifiers only after revalidation", async () => {
    mocks.prisma.$queryRaw
      .mockResolvedValueOnce([unreadJob()])
      .mockResolvedValueOnce([{
        buyer_user_id: recipientUserId,
        deliverable: true,
        recipient_email: "current-recipient@example.test",
        seller_user_id: sellerUserId,
      }]);

    await expect(processEmailOutbox(1, "worker-1")).resolves.toEqual({
      cancelled: 0,
      failed: 0,
      processed: 1,
      sent: 1,
    });
    expect(mocks.sendUnread).toHaveBeenCalledWith({
      conversationId,
      to: "current-recipient@example.test",
    }, "message-unread/idempotency");
    expect(mocks.sendInvite).not.toHaveBeenCalled();
    expect(JSON.stringify(mocks.sendUnread.mock.calls)).not.toContain("private message body");
  });

  it("cancels an unread job when the recipient or conversation is no longer eligible", async () => {
    mocks.prisma.$queryRaw
      .mockResolvedValueOnce([unreadJob()])
      .mockResolvedValueOnce([{
        buyer_user_id: recipientUserId,
        deliverable: false,
        recipient_email: "current-recipient@example.test",
        seller_user_id: sellerUserId,
      }]);

    await expect(processEmailOutbox(1, "worker-2")).resolves.toEqual({
      cancelled: 1,
      failed: 0,
      processed: 1,
      sent: 0,
    });
    expect(mocks.sendUnread).not.toHaveBeenCalled();
    expect(mocks.prisma.emailOutbox.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ status: "CANCELLED" }),
    }));
  });

  it("uses the invite recipient's current account email instead of the queued address", async () => {
    mocks.prisma.$queryRaw
      .mockResolvedValueOnce([{
        attempts: 1,
        id: "invite-outbox-job",
        idempotencyKey: "invite/idempotency",
        inviteId: "invite-1",
        messageConversationId: null,
        messageRecipientUserId: null,
        payload: { message: "legacy private invite body" },
        to: "stale@example.test",
        type: "INVITE",
      }])
      .mockResolvedValueOnce([{
        current_email: "current-buyer@example.test",
        deliverable: true,
      }]);

    await expect(processEmailOutbox(1, "worker-3")).resolves.toMatchObject({ sent: 1 });
    expect(mocks.sendInvite).toHaveBeenCalledWith(
      { to: "current-buyer@example.test" },
      "invite/idempotency",
    );
    expect(JSON.stringify(mocks.sendInvite.mock.calls)).not.toContain("legacy private invite body");
  });
});

function unreadJob() {
  return {
    attempts: 1,
    id: "outbox-job",
    idempotencyKey: "message-unread/idempotency",
    inviteId: null,
    messageConversationId: conversationId,
    messageRecipientUserId: recipientUserId,
    payload: { body: "private message body", conversationId },
    to: "recipient@example.test",
    type: "MESSAGE_UNREAD",
  };
}
