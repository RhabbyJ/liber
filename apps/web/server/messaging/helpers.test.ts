import { afterEach, describe, expect, it, vi } from "vitest";
import { normalizeMessageBody, visibleMessageBody } from "./content";
import {
  decodeAdminReportListCursor,
  decodeConversationListCursor,
  decodeMessageCursor,
  encodeAdminReportListCursor,
  encodeConversationListCursor,
  encodeMessageCursor,
} from "./cursor";
import {
  messagingV1ConversationScopeForUser,
  messagingV1EnabledForPair,
  messagingV1NavigationEnabledForUser,
} from "./feature";
import {
  assertConversationCanSend,
  PUBLIC_BLOCKED_CONVERSATION_STATE,
  SELLER_FOLLOW_UP_COOLDOWN_MS,
} from "./policy";
import { resolveMessagingTemplate } from "./templates";

const sellerId = "019f62c5-1c07-4a62-9f9a-8302778aa011";
const buyerId = "019f62c5-1c07-4a62-9f9a-8302778aa012";
const conversationId = "019f62c5-1c07-4a62-9f9a-8302778aa013";
const messageId = "019f62c5-1c07-4a62-9f9a-8302778aa014";

afterEach(() => vi.unstubAllEnvs());

describe("messaging rollout", () => {
  it("fails closed and requires both participants for pair access", () => {
    vi.stubEnv("LIBER_MESSAGING_V1_ENABLED", "true");
    vi.stubEnv("LIBER_MESSAGING_V1_COHORT_USER_IDS", sellerId);
    expect(messagingV1NavigationEnabledForUser(sellerId)).toBe(true);
    expect(messagingV1EnabledForPair(sellerId, buyerId)).toBe(false);
    expect(messagingV1ConversationScopeForUser(sellerId)?.counterpartyUserIds).toEqual([]);

    vi.stubEnv("LIBER_MESSAGING_V1_COHORT_USER_IDS", `${sellerId},${buyerId}`);
    expect(messagingV1EnabledForPair(sellerId, buyerId)).toBe(true);
    expect(messagingV1ConversationScopeForUser(sellerId)?.counterpartyUserIds).toEqual([buyerId]);

    vi.stubEnv("LIBER_MESSAGING_V1_ENABLED", "false");
    expect(messagingV1NavigationEnabledForUser(sellerId)).toBe(false);
  });

  it("allows the explicit wildcard cohort", () => {
    vi.stubEnv("LIBER_MESSAGING_V1_ENABLED", "true");
    vi.stubEnv("LIBER_MESSAGING_V1_COHORT_USER_IDS", "*");
    expect(messagingV1EnabledForPair(sellerId, buyerId)).toBe(true);
    expect(messagingV1ConversationScopeForUser(sellerId)?.counterpartyUserIds).toBeNull();
  });

  it("fails closed on wildcard rollout in production", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("LIBER_MESSAGING_V1_ENABLED", "true");
    vi.stubEnv("LIBER_MESSAGING_V1_COHORT_USER_IDS", "*");
    expect(messagingV1NavigationEnabledForUser(sellerId)).toBe(false);
    expect(messagingV1EnabledForPair(sellerId, buyerId)).toBe(false);
  });

  it("fails closed on a mixed invalid production cohort", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("LIBER_MESSAGING_V1_ENABLED", "true");
    vi.stubEnv("LIBER_MESSAGING_V1_COHORT_USER_IDS", `${sellerId},not-a-user-id`);
    expect(messagingV1NavigationEnabledForUser(sellerId)).toBe(false);
  });

  it("normalizes UUID casing in a configured cohort", () => {
    vi.stubEnv("LIBER_MESSAGING_V1_ENABLED", "true");
    vi.stubEnv("LIBER_MESSAGING_V1_COHORT_USER_IDS", `${sellerId.toUpperCase()},${buyerId.toUpperCase()}`);
    expect(messagingV1NavigationEnabledForUser(sellerId)).toBe(true);
    expect(messagingV1EnabledForPair(sellerId, buyerId)).toBe(true);
    expect(messagingV1ConversationScopeForUser(sellerId)?.counterpartyUserIds).toEqual([buyerId]);
  });
});

describe("messaging text and templates", () => {
  it("normalizes plain text and rejects database-invalid Unicode", () => {
    expect(normalizeMessageBody("  Cafe\u0301\r\nhello  ")).toBe("Caf\u00e9\nhello");
    expect(() => normalizeMessageBody("hello\u0000world")).toThrow("invalid text");
    expect(() => normalizeMessageBody("broken\ud800")).toThrow("invalid text");
  });

  it("resolves only server-owned role, use, and version combinations", () => {
    expect(resolveMessagingTemplate({
      key: "SELLER_PRIVATE_VIEWING",
      role: "SELLER",
      use: "OPENING",
      version: 1,
    }).text).toContain("private viewing");
    expect(() => resolveMessagingTemplate({
      key: "SELLER_PRIVATE_VIEWING",
      role: "BUYER",
      use: "QUICK_REPLY",
      version: 1,
    })).toThrow("unavailable");
    expect(() => resolveMessagingTemplate({
      key: "BUYER_MORE_DETAILS",
      role: "BUYER",
      use: "QUICK_REPLY",
      version: 2,
    })).toThrow("unavailable");
  });
});

describe("messaging lifecycle policy", () => {
  const sentAt = new Date("2026-01-01T00:00:00.000Z");
  const baseState = {
    buyerProfileActive: true,
    buyerUserActive: true,
    conversationStatus: "AWAITING_BUYER" as const,
    hasBlock: false,
    inviteExpiresAt: null,
    inviteSentAt: sentAt,
    inviteStatus: "SENT" as const,
    propertyApproved: true,
    propertyIdentityCurrent: true,
    sellerAccessApproved: true,
    sellerFollowUpCount: 0,
    sellerUserActive: true,
  };

  it("uses the legacy 30-day expiry fallback instead of treating null as infinite", () => {
    expect(() => assertConversationCanSend({
      kind: "FREE_TEXT",
      now: new Date("2026-02-01T00:00:00.000Z"),
      participantRole: "BUYER",
      state: baseState,
    })).toThrow("unavailable");
  });

  it("serializes blocks as a generic unavailable read-only state", () => {
    expect(PUBLIC_BLOCKED_CONVERSATION_STATE).toEqual({
      closedReason: "CONVERSATION_UNAVAILABLE",
      inviteStatus: "Unavailable",
      status: "READ_ONLY",
    });
    expect(JSON.stringify(PUBLIC_BLOCKED_CONVERSATION_STATE)).not.toContain("BLOCKED");
    expect(JSON.stringify(PUBLIC_BLOCKED_CONVERSATION_STATE)).not.toContain("USER_BLOCKED");
  });

  it("keeps accepted conversations active and permits one exact seller follow-up", () => {
    expect(() => assertConversationCanSend({
      kind: "FREE_TEXT",
      now: new Date("2027-01-01T00:00:00.000Z"),
      participantRole: "BUYER",
      state: { ...baseState, conversationStatus: "ACTIVE", inviteStatus: "ACCEPTED" },
    })).not.toThrow();

    expect(() => assertConversationCanSend({
      kind: "GUIDED",
      now: new Date(sentAt.getTime() + SELLER_FOLLOW_UP_COOLDOWN_MS),
      participantRole: "SELLER",
      state: baseState,
      templateUse: "SELLER_FOLLOW_UP",
    })).not.toThrow();
    expect(() => assertConversationCanSend({
      kind: "GUIDED",
      now: new Date(sentAt.getTime() + SELLER_FOLLOW_UP_COOLDOWN_MS),
      participantRole: "SELLER",
      state: { ...baseState, sellerFollowUpCount: 1 },
      templateUse: "SELLER_FOLLOW_UP",
    })).toThrow("must respond");
  });
});

describe("message cursors", () => {
  it("binds cursors to a conversation and rejects malformed UUIDs", () => {
    const cursor = encodeMessageCursor({
      conversationId,
      createdAt: "2026-07-14T12:00:00.000Z",
      id: messageId,
    });
    expect(decodeMessageCursor(cursor, conversationId).id).toBe(messageId);
    expect(() => decodeMessageCursor(cursor, buyerId)).toThrow("Invalid message cursor");

    const malformed = Buffer.from(JSON.stringify({
      conversationId,
      createdAt: "2026-07-14T12:00:00.000Z",
      id: "not-a-uuid",
      version: 1,
    })).toString("base64url");
    expect(() => decodeMessageCursor(malformed, conversationId)).toThrow("Invalid message cursor");
  });

  it("binds inbox cursors to the authenticated viewer", () => {
    const cursor = encodeConversationListCursor({
      id: conversationId,
      lastMessageAt: "2026-07-14T12:00:00.000Z",
      userId: sellerId,
    });
    expect(decodeConversationListCursor(cursor, sellerId).id).toBe(conversationId);
    expect(() => decodeConversationListCursor(cursor, buyerId)).toThrow("Invalid conversation cursor");
    expect(Buffer.from(cursor, "base64url").toString("utf8")).not.toContain(sellerId);
  });

  it("signs admin report cursors so pagination boundaries cannot be forged", () => {
    const cursor = encodeAdminReportListCursor({
      createdAt: "2026-07-14T12:00:00.000Z",
      id: messageId,
      statusRank: 0,
    });
    expect(decodeAdminReportListCursor(cursor).statusRank).toBe(0);

    const payload = JSON.parse(Buffer.from(cursor, "base64url").toString("utf8"));
    payload.statusRank = 2;
    const tampered = Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
    expect(() => decodeAdminReportListCursor(tampered)).toThrow("Invalid report cursor");
  });

  it("fails closed with a weak production signing secret", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("AUTH_RATE_LIMIT_PEPPER", "too-short");

    expect(() => encodeConversationListCursor({
      id: conversationId,
      lastMessageAt: "2026-07-14T12:00:00.000Z",
      userId: sellerId,
    })).toThrow("Messaging is unavailable");
  });
});

describe("moderated message display", () => {
  it("uses one canonical removal notice across projections", () => {
    expect(visibleMessageBody("Original evidence", "REDACTED"))
      .toBe("This message was removed by Liber.");
    expect(visibleMessageBody("Visible message", "ALLOWED")).toBe("Visible message");
  });
});
