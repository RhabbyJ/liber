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

import { blockConversationUser, getConversationThread, getConversationScheduleContext, getConversationScheduleDeliveryContext, withConversationScheduleMutation, withConversationScheduleDelivery, listConversations, sendConversationMessage } from "./service";
import { normalizeConversationThread } from "../../components/messaging/normalize";

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

  it("requires a server session and authoritative membership for tour reads", async () => {
    mocks.getSessionUser.mockResolvedValue(null);
    await expect(getConversationScheduleContext(conversationId)).rejects.toMatchObject({ status: 401 });
    expect(mocks.prisma.$queryRaw).not.toHaveBeenCalled();
    mocks.getSessionUser.mockResolvedValue({ id: sellerId, roles: ["SELLER"] });
    mocks.prisma.$queryRaw.mockResolvedValueOnce([]);
    await expect(getConversationScheduleContext(conversationId)).rejects.toMatchObject({ status: 404 });
  });

  it("locks and rechecks every scheduling eligibility boundary before a tour write", async () => {
    const operation = vi.fn();
    for (const override of [
      { pair_blocked: true }, { property_identity_current: false }, { property_approved: false },
      { seller_access_approved: false }, { buyer_profile_active: false }, { buyer_user_active: false },
      { seller_user_active: false }, { conversation_status: "READ_ONLY" },
      { conversation_status: "AWAITING_BUYER", invite_status: "SENT" },
    ]) {
      mocks.prisma.$queryRaw
        .mockResolvedValueOnce([conversationAccessRow()])
        .mockResolvedValueOnce([{ locked: true }])
        .mockResolvedValueOnce([{ id: "invite-1" }])
        .mockResolvedValueOnce([{ id: conversationId }])
        .mockResolvedValueOnce([{ ...conversationAccessRow(), ...override }]);
      await expect(withConversationScheduleMutation(conversationId, operation)).rejects.toMatchObject({ name: "MessagingError" });
    }
    expect(operation).not.toHaveBeenCalled();
  });

  it("suppresses delivery to muted or synthetic participants and allows normal eligible delivery", async () => {
    for (const override of [{ muted_at: new Date() }, { property_test_approved: true }]) {
      mocks.prisma.$queryRaw.mockResolvedValueOnce([{ ...conversationAccessRow(), ...override }]);
      await expect(getConversationScheduleDeliveryContext(conversationId, sellerId)).resolves.toBeNull();
    }
    mocks.prisma.$queryRaw.mockResolvedValueOnce([conversationAccessRow()]);
    await expect(getConversationScheduleDeliveryContext(conversationId, sellerId)).resolves.toEqual({ email: "seller@example.test" });
  });

  it("serializes final notification delivery with schedule changes and gives the provider a bounded transaction", async () => {
    mocks.prisma.$queryRaw
      .mockResolvedValueOnce([conversationAccessRow()])
      .mockResolvedValueOnce([{ locked: true }])
      .mockResolvedValueOnce([{ id: "invite-1" }])
      .mockResolvedValueOnce([{ id: conversationId }])
      .mockResolvedValueOnce([conversationAccessRow()]);
    const send = vi.fn().mockResolvedValue("sent");
    await expect(withConversationScheduleDelivery(conversationId, sellerId, send)).resolves.toBe("sent");
    expect(send).toHaveBeenCalledWith(mocks.prisma, { email: "seller@example.test" });
    expect(mocks.prisma.$transaction).toHaveBeenCalledWith(expect.any(Function), { timeout: 30_000 });
  });

  it("loads a conversation list in two set-based queries using the DB-backed session snapshot", async () => {
    mocks.prisma.$queryRaw
      .mockResolvedValueOnce([conversationAccessRow()])
      .mockResolvedValueOnce([conversationSummaryRow()]);

    await expect(listConversations()).resolves.toMatchObject({
      items: [{
        counterpartyAvatarVariant: "avatarka:animals:3",
        id: conversationId,
        lastMessage: null,
        unreadCount: 0,
      }],
      pageInfo: { moderationRevision: "inbox-revision-1" },
    });
    expect(mocks.prisma.$queryRaw).toHaveBeenCalledTimes(2);
    const accessQuery = queryStrings(mocks.prisma.$queryRaw.mock.calls[0]?.[0]);
    expect(accessQuery).toContain('other_user."avatarVariant" AS other_avatar_variant');
    expect(accessQuery).toContain('other_user.name AS other_name');
  });

  it("serializes only the seller's limited identity and initials color to a buyer", async () => {
    mocks.getSessionUser.mockResolvedValue({ id: buyerId, roles: ["BUYER"] });
    mocks.prisma.$queryRaw
      .mockResolvedValueOnce([{
        ...conversationAccessRow(),
        other_avatar_variant: "avatarka:animals:9",
        other_name: "Julie PrivateSurname",
        other_user_id: sellerId,
        participant_role: "BUYER",
      }])
      .mockResolvedValueOnce([conversationSummaryRow()]);

    const result = await listConversations();
    expect(JSON.stringify(result)).not.toContain("PrivateSurname");
    expect(result).toMatchObject({
      items: [{
        counterpartyAvatarVariant: "avatarka:animals:9",
        counterpartyLabel: expect.stringMatching(/^Julie P\. #[0-9A-F]{12}$/),
        id: conversationId,
      }],
    });
  });

  it.each([null, new Date("invalid"), new Date("2020-01-01T00:00:00.000Z")])("keeps an invalid or expired invitation read-only and denies buyer property images (%s)", async (deadline) => {
    mocks.getSessionUser.mockResolvedValue({ id: buyerId, roles: ["BUYER"] });
    mocks.prisma.$queryRaw
      .mockResolvedValueOnce([{
        ...conversationAccessRow(),
        conversation_status: "AWAITING_BUYER",
        invite_expires_at: deadline,
        invite_status: "SENT",
        other_user_id: sellerId,
        participant_role: "BUYER",
      }])
      .mockResolvedValueOnce([conversationSummaryRow()])
      .mockResolvedValueOnce([]);
    await expect(getConversationThread(conversationId)).resolves.toMatchObject({
      canSend: false, status: "READ_ONLY", imageIds: [],
    });
    expect(mocks.prisma.$queryRaw).toHaveBeenCalledTimes(3);
  });

  it("keeps accepted conversation access independent of the old invitation deadline", async () => {
    mocks.getSessionUser.mockResolvedValue({ id: buyerId, roles: ["BUYER"] });
    mocks.prisma.$queryRaw
      .mockResolvedValueOnce([{
        ...conversationAccessRow(),
        invite_expires_at: null,
        other_user_id: sellerId,
        participant_role: "BUYER",
      }])
      .mockResolvedValueOnce([conversationSummaryRow()])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ id: "authorized-image" }]);
    await expect(getConversationThread(conversationId)).resolves.toMatchObject({
      canSend: true, status: "ACTIVE", imageIds: ["authorized-image"],
    });
  });

  it("labels an invite-time synthetic approval truthfully without rewriting the immutable snapshot", async () => {
    mocks.prisma.$queryRaw
      .mockResolvedValueOnce([{ ...conversationAccessRow(), property_test_approved: true }])
      .mockResolvedValueOnce([conversationSummaryRow()]);
    const result = await listConversations();
    expect(result.items[0]?.property.ownershipStatus).toBe("Test approval — ownership not verified");
    const query = queryStrings(mocks.prisma.$queryRaw.mock.calls[0]?.[0]);
    expect(query).toContain('audit."targetId" = invite.id');
    expect(query).toContain("audit.metadata->>'syntheticPropertyApproval' = 'true'");
    expect(mocks.prisma.$executeRaw).not.toHaveBeenCalled();
  });

  it("preserves the synthetic label through the full thread response and browser normalization", async () => {
    mocks.prisma.$queryRaw
      .mockResolvedValueOnce([{ ...conversationAccessRow(), property_test_approved: true }])
      .mockResolvedValueOnce([conversationSummaryRow()])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([]);
    const result = await getConversationThread(conversationId);
    expect(result.property.ownershipStatus).toBe("Test approval — ownership not verified");
    expect(normalizeConversationThread(result)?.propertySnapshot.ownershipStatus).toBe("Test approval — ownership not verified");
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

  it("preserves effective LOI expiry while blocking and still removes private drafts", async () => {
    const blockedAccess = {
      ...conversationAccessRow(),
      closed_reason: "USER_BLOCKED",
      conversation_status: "BLOCKED",
      pair_blocked: true,
    };
    mocks.prisma.$queryRaw
      .mockResolvedValueOnce([conversationAccessRow()])
      .mockResolvedValueOnce([{ locked: true }])
      .mockResolvedValueOnce([blockedAccess])
      .mockResolvedValueOnce([{ count: 1 }]);
    mocks.prisma.$executeRaw.mockResolvedValue(0);
    mocks.prisma.emailOutbox.updateMany.mockResolvedValue({ count: 1 });
    mocks.prisma.adminAuditLog.create.mockResolvedValue({ id: "audit-1" });

    await blockConversationUser({ conversationId });

    const freezeQuery = queryStrings(mocks.prisma.$executeRaw.mock.calls[1]?.[0]);
    expect(freezeQuery).toContain('current_revision."responseDeadline" <= statement_timestamp()');
    expect(freezeQuery).toContain("AND NOT EXISTS");
    const draftCleanupQuery = queryStrings(mocks.prisma.$executeRaw.mock.calls[2]?.[0]);
    expect(draftCleanupQuery).toContain('current_revision."responseDeadline" <= statement_timestamp()');
    expect(mocks.prisma.emailOutbox.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ status: "CANCELLED" }),
    }));
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
      select: { id: true },
    });
    const insertQuery = mocks.prisma.$queryRaw.mock.calls.find((call) => (
      queryStrings(call[0]).includes('INSERT INTO public."Message"')
    ));
    expect(insertQuery).toHaveLength(1);
    expect(queryStrings(insertQuery?.[0])).toContain('INSERT INTO public."Message" AS message');
    expect(queryFragments(insertQuery?.[0])).toContain("message.id");
  });

  it("returns an existing message for an idempotent retry without duplicate side effects", async () => {
    const access = {
      ...conversationAccessRow(),
      other_user_id: sellerId,
      participant_role: "BUYER",
    };
    const message = {
      body: "Please send more property details.",
      client_message_id: clientMessageId,
      conversation_id: conversationId,
      created_at: new Date("2026-07-16T06:00:00.000Z"),
      id: messageId,
      kind: "GUIDED",
      moderation_status: "ALLOWED",
      sender_user_id: buyerId,
      template_key: "BUYER_MORE_DETAILS",
      template_version: 1,
    };
    mocks.getSessionUser.mockResolvedValue({ id: buyerId, roles: ["BUYER"] });
    mocks.prisma.$queryRaw
      .mockResolvedValueOnce([access])
      .mockResolvedValueOnce([{ locked: true }])
      .mockResolvedValueOnce([{ id: access.invite_id }])
      .mockResolvedValueOnce([{ id: conversationId }])
      .mockResolvedValueOnce([access])
      .mockResolvedValueOnce([message]);

    await expect(sendConversationMessage({
      clientMessageId,
      conversationId,
      kind: "GUIDED",
      templateKey: "BUYER_MORE_DETAILS",
      templateVersion: 1,
    })).resolves.toMatchObject({
      data: { body: message.body, id: messageId, sender: "YOU" },
      idempotent: true,
    });

    expect(mocks.prisma.emailOutbox.create).not.toHaveBeenCalled();
    expect(mocks.prisma.adminAuditLog.create).not.toHaveBeenCalled();
    const retryQuery = mocks.prisma.$queryRaw.mock.calls[5];
    expect(retryQuery).toHaveLength(1);
    expect(queryStrings(retryQuery?.[0])).toContain('FROM public."Message" message');
    expect(queryFragments(retryQuery?.[0])).toContain("message.id");
  });
});

function queryStrings(query: unknown) {
  if (Array.isArray(query)) return query.join(" ");
  if (query && typeof query === "object" && "strings" in query && Array.isArray(query.strings)) {
    return query.strings.join(" ");
  }
  return "";
}

function queryFragments(query: unknown): string {
  if (!query || typeof query !== "object" || !("values" in query) || !Array.isArray(query.values)) return "";
  return query.values.map((value) => `${queryStrings(value)} ${queryFragments(value)}`).join(" ");
}

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
    invite_status: "ACCEPTED",
    inbox_moderation_revision: "inbox-revision-1",
    last_message_at: now,
    last_read_message_id: null,
    last_read_at: null,
    muted_at: null,
    other_avatar_variant: "avatarka:animals:3",
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
