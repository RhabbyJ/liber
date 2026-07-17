import { describe, expect, it } from "vitest";
import {
  applySentMessageResponse,
  conversationPageSignature,
  mergeCanonicalConversationState,
  mergeConversationSummaries,
  messagePageMetadata,
  normalizeAdminMessageReports,
  normalizeListPageInfo,
  normalizeConversationSummaries,
  normalizeConversationThread,
  normalizedMessageLength,
  normalizeMessagePage,
} from "./normalize";

const safetyNotice = "Safety notice";

describe("messaging DTO normalization", () => {
  it("counts normalized Unicode code points like the server message boundary", () => {
    expect(normalizedMessageLength(`  ${"😀".repeat(2_000)}  `)).toBe(2_000);
    expect(normalizedMessageLength("e\u0301")).toBe(1);
    expect(normalizedMessageLength("line one\r\nline two")).toBe(17);
  });

  it("keeps the seller generic in buyer-facing summaries", () => {
    const [summary] = normalizeConversationSummaries({
      items: [{
        counterpartyAvatarVariant: "avatarka:animals:3",
        counterpartyLabel: "Seller account name",
        id: "conversation-1",
        lastMessage: null,
        muted: false,
        participantRole: "BUYER",
        property: { title: "Valley property" },
        status: "AWAITING_BUYER",
        unreadCount: 1,
      }],
    });

    expect(summary.counterpartLabel).toBe("Property seller");
    expect(summary.counterpartAvatarVariant).toBeNull();
    expect(summary.propertyTitle).toBe("Valley property");
  });

  it("keeps the authorized buyer avatar in seller-facing summaries", () => {
    const [summary] = normalizeConversationSummaries({
      items: [{
        counterpartyAvatarVariant: "avatarka:animals:3",
        counterpartyLabel: "Buyer Pine",
        id: "conversation-1",
        lastMessage: null,
        muted: false,
        participantRole: "SELLER",
        property: { title: "Valley property" },
        status: "ACTIVE",
        unreadCount: 0,
      }],
    });

    expect(summary.counterpartAvatarVariant).toBe("avatarka:animals:3");
  });

  it("normalizes list cursors and deduplicates overlapping inbox pages", () => {
    const [first] = normalizeConversationSummaries({ items: [{
      counterpartyLabel: "Buyer Pine",
      id: "conversation-1",
      lastMessage: null,
      lastMessageAt: "2026-07-14T13:00:00.000Z",
      muted: false,
      participantRole: "SELLER",
      property: { title: "First property" },
      status: "ACTIVE",
      unreadCount: 0,
    }] });
    const [updated, second] = normalizeConversationSummaries({ items: [{
      counterpartyLabel: "Buyer Pine",
      id: "conversation-1",
      lastMessage: null,
      lastMessageAt: "2026-07-14T13:00:00.000Z",
      muted: true,
      participantRole: "SELLER",
      property: { title: "First property" },
      status: "ACTIVE",
      unreadCount: 0,
    }, {
      counterpartyLabel: "Buyer Cedar",
      id: "conversation-2",
      lastMessage: null,
      lastMessageAt: "2026-07-14T12:00:00.000Z",
      muted: false,
      participantRole: "SELLER",
      property: { title: "Second property" },
      status: "READ_ONLY",
      unreadCount: 0,
    }] });

    expect(mergeConversationSummaries([first], [updated, second])).toEqual([updated, second]);
    expect(normalizeListPageInfo({ items: [], pageInfo: {
      hasMore: true,
      moderationRevision: "revision-1",
      nextCursor: "opaque",
    } }))
      .toEqual({ hasMore: true, moderationRevision: "revision-1", nextCursor: "opaque" });
    expect(normalizeListPageInfo({ pageInfo: { hasMore: true } }))
      .toEqual({ hasMore: true, moderationRevision: null, nextCursor: null });
  });

  it("reorders refreshed inbox items by the canonical message key", () => {
    const older = normalizeConversationSummaries({ items: [{
      id: "conversation-1",
      lastMessageAt: "2026-07-14T12:00:00.000Z",
      muted: false,
      participantRole: "BUYER",
      property: { title: "First property" },
      status: "ACTIVE",
      unreadCount: 0,
    }] })[0];
    const newer = normalizeConversationSummaries({ items: [{
      id: "conversation-2",
      lastMessageAt: "2026-07-14T13:00:00.000Z",
      muted: false,
      participantRole: "SELLER",
      property: { title: "Second property" },
      status: "ACTIVE",
      unreadCount: 1,
    }] })[0];

    expect(mergeConversationSummaries([older], [newer]).map((item) => item.id))
      .toEqual(["conversation-2", "conversation-1"]);
  });

  it("detects canonical first-page changes without including loaded history", () => {
    const [first, second] = normalizeConversationSummaries({ items: [{
      id: "conversation-1",
      lastMessageAt: "2026-07-14T13:00:00.000Z",
      muted: false,
      participantRole: "BUYER",
      property: { title: "First property" },
      status: "ACTIVE",
      unreadCount: 0,
    }, {
      id: "conversation-2",
      lastMessageAt: "2026-07-14T12:00:00.000Z",
      muted: false,
      participantRole: "BUYER",
      property: { title: "Second property" },
      status: "ACTIVE",
      unreadCount: 0,
    }] });

    const pageInfo = { hasMore: true, moderationRevision: "revision-1", nextCursor: "first-cursor" };
    expect(conversationPageSignature([first], pageInfo))
      .toBe(conversationPageSignature([{ ...first }], { ...pageInfo }));
    expect(conversationPageSignature([first], pageInfo))
      .not.toBe(conversationPageSignature([{ ...first, unreadCount: 1 }], pageInfo));
    expect(conversationPageSignature([first], pageInfo))
      .not.toBe(conversationPageSignature([first, second], pageInfo));
    expect(conversationPageSignature([first], pageInfo))
      .not.toBe(conversationPageSignature([first], {
        hasMore: true,
        moderationRevision: "revision-1",
        nextCursor: "rotated-cursor",
      }));
    expect(conversationPageSignature([first], pageInfo))
      .not.toBe(conversationPageSignature([first], {
        ...pageInfo,
        moderationRevision: "revision-from-redaction-outside-first-page",
      }));
  });

  it("fails closed on private images when the property identity is no longer current", () => {
    const thread = normalizeConversationThread({
      canSend: true,
      counterpartyLabel: "Buyer Pine",
      id: "conversation-1",
      imageIds: ["image-1"],
      invite: { id: "invite-1", status: "Accepted" },
      muted: false,
      participantRole: "SELLER",
      property: {
        identityCurrent: false,
        location: "Van Nuys, CA",
        ownershipStatus: "Ownership verified",
        title: "Valley property",
      },
      safetyNotice,
      status: "ACTIVE",
    });

    expect(thread).toMatchObject({
      canSend: true,
      counterpartLabel: "Buyer Pine",
      inviteStatus: "Accepted",
      propertySnapshot: { identityCurrent: false, imageIds: [] },
      safetyNotice: "Safety notice",
    });
  });

  it("preserves message text as inert plain text and merges catch-up pages", () => {
    const initial = normalizeConversationThread({
      canSend: true,
      counterpartyLabel: "Buyer Pine",
      id: "conversation-1",
      invite: { status: "Accepted" },
      items: [{
        body: "First message",
        createdAt: "2026-07-14T10:00:00.000Z",
        id: "message-1",
        kind: "FREE_TEXT",
        sender: "YOU",
      }],
      participantRole: "SELLER",
      property: { title: "Valley property" },
      safetyNotice,
      status: "ACTIVE",
    });
    expect(initial).not.toBeNull();

    const updated = normalizeMessagePage({
      items: [{
          body: '<a href="https://example.com">not a rendered link</a>',
          createdAt: "2026-07-14T10:01:00.000Z",
          id: "message-2",
          kind: "FREE_TEXT",
          sender: "COUNTERPARTY",
      }],
      pageInfo: { hasMore: false, newestMessageId: "message-2", nextCursor: null },
    }, initial!);

    expect(updated.messages.map((message) => message.id)).toEqual(["message-1", "message-2"]);
    expect(updated.messages[1].body).toBe('<a href="https://example.com">not a rendered link</a>');
    expect(messagePageMetadata({ items: updated.messages.slice(1), pageInfo: { hasMore: false } }))
      .toEqual({ hasMore: false, newestMessageId: "message-2" });
  });

  it("renders a successful send response immediately and preserves it across a stale refresh", () => {
    const current = normalizeConversationThread({
      canSend: true,
      id: "conversation-1",
      invite: { status: "Sent" },
      items: [{
        body: "Opening",
        createdAt: "2026-07-14T10:00:00.000Z",
        id: "message-1",
        kind: "INVITE",
        sender: "COUNTERPARTY",
      }],
      participantRole: "BUYER",
      property: { identityCurrent: true, title: "Valley property" },
      safetyNotice,
      status: "AWAITING_BUYER",
    });
    expect(current).not.toBeNull();

    const applied = applySentMessageResponse({
      data: {
        body: "Buyer reply",
        createdAt: "2026-07-14T10:01:00.000Z",
        id: "message-2",
        kind: "FREE_TEXT",
        sender: "YOU",
      },
      idempotent: false,
    }, current!);

    expect(applied?.message).toMatchObject({ body: "Buyer reply", id: "message-2", isOwn: true });
    expect(applied?.thread.messages.map((message) => message.id)).toEqual(["message-1", "message-2"]);
    expect(mergeCanonicalConversationState(applied!.thread, current!).messages.map((message) => message.id))
      .toEqual(["message-1", "message-2"]);
    expect(applySentMessageResponse({ data: { id: "invalid", kind: "SYSTEM", sender: "YOU" } }, current!))
      .toBeNull();
    for (const data of [
      { createdAt: "2026-07-14T10:01:00.000Z", id: "missing-body", kind: "FREE_TEXT", sender: "YOU" },
      { body: "   ", createdAt: "2026-07-14T10:01:00.000Z", id: "blank-body", kind: "FREE_TEXT", sender: "YOU" },
      { body: "Missing timestamp", id: "missing-created-at", kind: "FREE_TEXT", sender: "YOU" },
      { body: "Invalid timestamp", createdAt: "not-a-date", id: "invalid-created-at", kind: "FREE_TEXT", sender: "YOU" },
      { createdAt: "2026-07-14T10:01:00.000Z", id: "guided-missing-body", kind: "GUIDED", sender: "YOU" },
    ]) {
      expect(applySentMessageResponse({ data }, current!)).toBeNull();
    }
  });

  it("replaces redacted content with the reviewed-removal notice", () => {
    const thread = normalizeConversationThread({
      canSend: false,
      counterpartyLabel: "Buyer Pine",
      id: "conversation-1",
      invite: { status: "Accepted" },
      items: [{
        body: "This message was removed by Liber.",
        createdAt: "2026-07-14T10:00:00.000Z",
        id: "message-1",
        kind: "FREE_TEXT",
        moderationStatus: "REDACTED",
        sender: "COUNTERPARTY",
      }],
      participantRole: "SELLER",
      property: { title: "Valley property" },
      safetyNotice,
      status: "READ_ONLY",
    });

    expect(thread?.messages[0]).toMatchObject({
      body: "This message was removed by Liber.",
      redacted: true,
    });
  });

  it("refreshes canonical lifecycle state while preserving merged history and the older-page cursor", () => {
    const current = normalizeConversationThread({
      canSend: false,
      id: "conversation-1",
      items: [{
        body: "Opening",
        createdAt: "2026-07-14T10:00:00.000Z",
        id: "message-1",
        kind: "INVITE",
        sender: "COUNTERPARTY",
      }],
      pageInfo: { hasMore: true, nextCursor: "older-cursor" },
      participantRole: "SELLER",
      property: { title: "Valley property" },
      safetyNotice,
      status: "AWAITING_BUYER",
    });
    const canonical = normalizeConversationThread({
      canSend: true,
      id: "conversation-1",
      items: [{
        body: "Buyer replied",
        createdAt: "2026-07-14T10:01:00.000Z",
        id: "message-2",
        kind: "FREE_TEXT",
        sender: "COUNTERPARTY",
      }],
      pageInfo: { hasMore: true, nextCursor: "canonical-cursor" },
      participantRole: "SELLER",
      property: { title: "Valley property" },
      safetyNotice,
      status: "ACTIVE",
    });

    expect(current).not.toBeNull();
    expect(canonical).not.toBeNull();
    expect(mergeCanonicalConversationState(current!, canonical!)).toMatchObject({
      canSend: true,
      pageInfo: { nextCursor: "older-cursor" },
      status: "ACTIVE",
    });
    expect(mergeCanonicalConversationState(current!, canonical!).messages.map((message) => message.id))
      .toEqual(["message-1", "message-2"]);
  });

  it("adapts report evidence and honors server-provided neutral context labels", () => {
    const [report] = normalizeAdminMessageReports({
      items: [{
        category: "SPAM",
        createdAt: "2026-07-14T10:00:00.000Z",
        message: {
          body: "Reported body",
          createdAt: "2026-07-14T10:00:00.000Z",
          id: "message-1",
          kind: "FREE_TEXT",
          sender: "COUNTERPARTY",
          senderLabel: "Reported participant",
        },
        surroundingMessages: [{
          body: "Nearby body",
          createdAt: "2026-07-14T09:59:00.000Z",
          id: "message-context",
          kind: "FREE_TEXT",
          sender: "COUNTERPARTY",
          senderLabel: "Reporting participant",
        }],
        id: "report-1",
        reportedLabel: "Reported participant",
        resolution: "Warned the reported participant.",
        status: "ACTIONED",
      }],
    });

    expect(report.message.body).toBe("Reported body");
    expect(report.resolution).toBe("Warned the reported participant.");
    expect(report.surroundingMessages[0].senderLabel).toBe("Reporting participant");
  });

  it("rejects malformed thread identities instead of guessing a participant role", () => {
    expect(normalizeConversationThread({
      id: "conversation-1",
      participantRole: "ADMIN",
      safetyNotice,
    })).toBeNull();
    expect(normalizeConversationThread({
      id: "conversation-1",
      participantRole: "BUYER",
    })).toBeNull();
  });

  it("drops malformed message kinds and senders instead of misattributing them", () => {
    const thread = normalizeConversationThread({
      id: "conversation-1",
      items: [{
        body: "Should not render",
        createdAt: "2026-07-14T10:00:00.000Z",
        id: "message-1",
        kind: "UNKNOWN",
        sender: "ADMIN",
      }],
      participantRole: "BUYER",
      property: { identityCurrent: true, title: "Valley property" },
      safetyNotice,
      status: "ACTIVE",
    });

    expect(thread?.messages).toEqual([]);
  });

  it("does not merge a response for a different conversation and preserves unchanged objects", () => {
    const current = normalizeConversationThread({
      canSend: true,
      id: "conversation-1",
      items: [{
        body: "Opening",
        createdAt: "2026-07-14T10:00:00.000Z",
        id: "message-1",
        kind: "INVITE",
        sender: "COUNTERPARTY",
      }],
      participantRole: "BUYER",
      property: { identityCurrent: true, title: "Valley property" },
      safetyNotice,
      status: "ACTIVE",
    });
    const canonical = normalizeConversationThread({
      canSend: true,
      id: "conversation-1",
      items: [{
        body: "Opening",
        createdAt: "2026-07-14T10:00:00.000Z",
        id: "message-1",
        kind: "INVITE",
        sender: "COUNTERPARTY",
      }],
      participantRole: "BUYER",
      property: { identityCurrent: true, title: "Valley property" },
      safetyNotice,
      status: "ACTIVE",
    });
    const other = { ...canonical!, id: "conversation-2" };

    expect(current).not.toBeNull();
    expect(canonical).not.toBeNull();
    const merged = mergeCanonicalConversationState(current!, canonical!);
    expect(merged.messages[0]).toBe(current!.messages[0]);
    expect(merged.propertySnapshot).toBe(current!.propertySnapshot);
    expect(mergeCanonicalConversationState(current!, other)).toBe(current);
  });
});
