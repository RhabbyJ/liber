import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const sellerId = "019f62c5-1c07-4a62-9f9a-8302778aa011";
const buyerId = "019f62c5-1c07-4a62-9f9a-8302778aa012";
const conversationId = "019f62c5-1c07-4a62-9f9a-8302778aa013";
const clientMessageId = "019f62c5-1c07-4a62-9f9a-8302778aa014";
const messageId = "019f62c5-1c07-4a62-9f9a-8302778aa015";

const mocks = vi.hoisted(() => ({
  getSessionUser: vi.fn(),
  prisma: {
    $executeRaw: vi.fn(),
    $queryRaw: vi.fn(),
    $transaction: vi.fn(),
    adminAuditLog: { create: vi.fn() },
    emailOutbox: { create: vi.fn(), updateMany: vi.fn() },
  },
}));

vi.mock("@liber/db", () => ({
  Prisma: {
    empty: {},
    join: (values: unknown[]) => values,
    raw: (value: string) => value,
    sql: (strings: TemplateStringsArray, ...values: unknown[]) => ({ strings, values }),
  },
  prisma: mocks.prisma,
}));

vi.mock("../session", () => ({ getSessionUser: mocks.getSessionUser }));
vi.mock("../rate-limit", () => ({
  checkRateLimit: vi.fn().mockResolvedValue({ allowed: true, retryAfterSeconds: 0 }),
}));

import { blockConversationUser, listConversations, sendConversationMessage } from "./service";

describe("messaging service query shape", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv("LIBER_MESSAGING_V1_ENABLED", "true");
    vi.stubEnv("LIBER_MESSAGING_V1_COHORT_USER_IDS", `${sellerId},${buyerId}`);
    mocks.getSessionUser.mockResolvedValue({ id: sellerId, roles: ["SELLER"] });
    mocks.prisma.$transaction.mockImplementation(
      async (operation: (tx: typeof mocks.prisma) => unknown) => operation(mocks.prisma),
    );
  });

  afterEach(() => vi.unstubAllEnvs());

  it("loads a conversation list in two set-based queries using the DB-backed session snapshot", async () => {
    mocks.prisma.$queryRaw
      .mockResolvedValueOnce([conversationAccessRow()])
      .mockResolvedValueOnce([conversationSummaryRow()]);

    await expect(listConversations()).resolves.toMatchObject({
      items: [{ id: conversationId, lastMessage: null, unreadCount: 0 }],
      pageInfo: { moderationRevision: "inbox-revision-1" },
    });
    expect(mocks.prisma.$queryRaw).toHaveBeenCalledTimes(2);
  });

  it("records zero newly closed conversations when a block is repeated", async () => {
    const blockedAccess = {
      ...conversationAccessRow(),
      closed_reason: "USER_BLOCKED",
      conversation_status: "BLOCKED",
      pair_blocked: true,
    };
    mocks.prisma.$queryRaw
      .mockResolvedValueOnce([blockedAccess])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([blockedAccess])
      .mockResolvedValueOnce([{ count: 0 }]);
    mocks.prisma.$executeRaw.mockResolvedValue(0);
    mocks.prisma.adminAuditLog.create.mockResolvedValue({ id: "audit-1" });

    await expect(blockConversationUser({ conversationId })).resolves.toEqual({ data: { blocked: true } });

    expect(mocks.prisma.adminAuditLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ metadata: { conversationsClosed: 0 } }),
    });
    const countQuery = mocks.prisma.$queryRaw.mock.calls[3]?.[0] as unknown as string[];
    expect(countQuery.join(" ")).toContain("conversation.status <> 'BLOCKED'");
    expect(mocks.prisma.$queryRaw.mock.invocationCallOrder[3])
      .toBeLessThan(mocks.prisma.$executeRaw.mock.invocationCallOrder[0]);
  });

  it("queues unread email through Prisma after the buyer's first reply", async () => {
    const access = {
      ...conversationAccessRow(),
      conversation_status: "AWAITING_BUYER",
      invite_expires_at: new Date("2099-07-21T12:00:00.000Z"),
      invite_status: "VIEWED",
      other_user_id: sellerId,
      participant_role: "BUYER",
    };
    const createdAt = new Date("2026-07-16T06:00:00.000Z");
    const message = {
      body: "I am interested.",
      client_message_id: clientMessageId,
      conversation_id: conversationId,
      created_at: createdAt,
      id: messageId,
      kind: "FREE_TEXT",
      moderation_status: "ALLOWED",
      sender_user_id: buyerId,
      template_key: null,
      template_version: null,
    };
    mocks.getSessionUser.mockResolvedValue({ id: buyerId, roles: ["BUYER"] });
    mocks.prisma.$queryRaw
      .mockResolvedValueOnce([access])
      .mockResolvedValueOnce([{ locked: true }])
      .mockResolvedValueOnce([{ id: access.invite_id }])
      .mockResolvedValueOnce([{ id: conversationId }])
      .mockResolvedValueOnce([access])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ blocked: false }])
      .mockResolvedValueOnce([{ count: 0 }])
      .mockResolvedValueOnce([{ locked: true }])
      .mockResolvedValueOnce([{ count: 0 }])
      .mockResolvedValueOnce([{ count: 0 }])
      .mockResolvedValueOnce([message])
      .mockResolvedValueOnce([{ created_at: createdAt, last_read_at: null, muted_at: null }])
      .mockResolvedValueOnce([]);
    mocks.prisma.emailOutbox.create.mockResolvedValue({ id: "outbox-1" });
    mocks.prisma.adminAuditLog.create.mockResolvedValue({ id: "audit-1" });

    await expect(sendConversationMessage({
      body: "I am interested.",
      clientMessageId,
      conversationId,
      kind: "FREE_TEXT",
    })).resolves.toMatchObject({
      data: { body: "I am interested.", id: messageId, sender: "YOU" },
      idempotent: false,
    });

    expect(mocks.prisma.emailOutbox.create).toHaveBeenCalledWith({
      data: {
        idempotencyKey: `message-unread:${conversationId}:${sellerId}:${messageId}`,
        messageConversationId: conversationId,
        messageRecipientUserId: sellerId,
        nextAttemptAt: expect.any(Date),
        payload: {},
        status: "PENDING",
        subject: "You have an unread Liber message",
        templateName: "message-unread",
        to: "seller@example.test",
        type: "MESSAGE_UNREAD",
      },
    });
    const insertQuery = mocks.prisma.$queryRaw.mock.calls.find((call) => (
      Array.isArray(call[0]) && call[0].join(" ").includes('INSERT INTO public."Message"')
    ));
    expect(insertQuery?.[0].join(" ")).toContain('INSERT INTO public."Message" AS message');
  });
});

function conversationAccessRow() {
  const now = new Date("2026-07-14T12:00:00.000Z");
  return {
    buyer_display_name: "Maple Haven",
    buyer_profile_active: true,
    buyer_user_active: true,
    buyer_user_id: buyerId,
    buyer_email: "buyer@example.test",
    closed_reason: null,
    conversation_id: conversationId,
    conversation_status: "ACTIVE",
    invite_expires_at: null,
    invite_id: "invite-1",
    invite_property_identity_version: 1,
    invite_sent_at: now,
    invite_status: "ACCEPTED",
    inbox_moderation_revision: "inbox-revision-1",
    last_message_at: now,
    last_read_message_id: null,
    last_read_at: null,
    muted_at: null,
    other_user_id: buyerId,
    participant_count: 2,
    participant_created_at: now,
    participant_role: "SELLER",
    pair_blocked: false,
    property_approved: true,
    property_identity_current: true,
    property_identity_version: 1,
    property_snapshot: { location: "Los Angeles, CA", title: "Private property" },
    seller_access_approved: true,
    seller_email: "seller@example.test",
    seller_user_active: true,
    seller_user_id: sellerId,
  };
}

function conversationSummaryRow() {
  return {
    body: null,
    client_message_id: null,
    conversation_id: null,
    created_at: null,
    id: null,
    kind: null,
    moderation_status: null,
    sender_user_id: null,
    summary_conversation_id: conversationId,
    template_key: null,
    template_version: null,
    unread_count: 0,
  };
}
