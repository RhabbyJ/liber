import { createHmac, timingSafeEqual } from "node:crypto";
import { MessagingError } from "./errors";

type MessageCursor = {
  conversationId: string;
  createdAt: string;
  id: string;
  version: 1;
};

type ConversationListCursor = {
  id: string;
  lastMessageAt: string;
  signature: string;
  viewerBinding: string;
  version: 1;
};

type AdminReportListCursor = {
  createdAt: string;
  id: string;
  signature: string;
  statusRank: number;
  version: 1;
};

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function encodeMessageCursor(cursor: Omit<MessageCursor, "version">) {
  return Buffer.from(JSON.stringify({ ...cursor, version: 1 }), "utf8").toString("base64url");
}

export function decodeMessageCursor(value: string, conversationId?: string): MessageCursor {
  try {
    const parsed: unknown = JSON.parse(Buffer.from(value, "base64url").toString("utf8"));
    if (!isMessageCursor(parsed) || (conversationId && parsed.conversationId !== conversationId)) {
      throw new Error("Invalid cursor shape.");
    }
    return parsed;
  } catch (error) {
    throw new MessagingError("INVALID_INPUT", "Invalid message cursor.", 400, { cause: error });
  }
}

export function encodeConversationListCursor(cursor: {
  id: string;
  lastMessageAt: string;
  userId: string;
}) {
  const payload = {
    id: cursor.id,
    lastMessageAt: cursor.lastMessageAt,
    version: 1,
    viewerBinding: conversationCursorViewerBinding(cursor.userId),
  } as const;
  return encodeCursor({
    ...payload,
    signature: cursorSignature("conversation", payload),
  });
}

export function decodeConversationListCursor(value: string, userId: string): ConversationListCursor {
  try {
    const parsed: unknown = JSON.parse(Buffer.from(value, "base64url").toString("utf8"));
    if (
      !isConversationListCursor(parsed)
      || !safeEqual(parsed.viewerBinding, conversationCursorViewerBinding(userId))
      || !safeEqual(parsed.signature, cursorSignature("conversation", {
        id: parsed.id,
        lastMessageAt: parsed.lastMessageAt,
        version: parsed.version,
        viewerBinding: parsed.viewerBinding,
      }))
    ) {
      throw new Error("Invalid conversation cursor shape.");
    }
    return parsed;
  } catch (error) {
    throw new MessagingError("INVALID_INPUT", "Invalid conversation cursor.", 400, { cause: error });
  }
}

export function encodeAdminReportListCursor(cursor: {
  createdAt: string;
  id: string;
  statusRank: number;
}) {
  const payload = { ...cursor, version: 1 } as const;
  return encodeCursor({ ...payload, signature: cursorSignature("admin-report", payload) });
}

export function decodeAdminReportListCursor(value: string): AdminReportListCursor {
  try {
    const parsed: unknown = JSON.parse(Buffer.from(value, "base64url").toString("utf8"));
    if (
      !isAdminReportListCursor(parsed)
      || !safeEqual(parsed.signature, cursorSignature("admin-report", {
        createdAt: parsed.createdAt,
        id: parsed.id,
        statusRank: parsed.statusRank,
        version: parsed.version,
      }))
    ) {
      throw new Error("Invalid report cursor shape.");
    }
    return parsed;
  } catch (error) {
    throw new MessagingError("INVALID_INPUT", "Invalid report cursor.", 400, { cause: error });
  }
}

function isMessageCursor(value: unknown): value is MessageCursor {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<MessageCursor>;
  return candidate.version === 1
    && typeof candidate.conversationId === "string"
    && UUID_PATTERN.test(candidate.conversationId)
    && typeof candidate.id === "string"
    && UUID_PATTERN.test(candidate.id)
    && typeof candidate.createdAt === "string"
    && Number.isFinite(new Date(candidate.createdAt).getTime())
    && new Date(candidate.createdAt).toISOString() === candidate.createdAt;
}

function isConversationListCursor(value: unknown): value is ConversationListCursor {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<ConversationListCursor>;
  return candidate.version === 1
    && typeof candidate.id === "string"
    && UUID_PATTERN.test(candidate.id)
    && typeof candidate.viewerBinding === "string"
    && /^[A-Za-z0-9_-]{43}$/.test(candidate.viewerBinding)
    && typeof candidate.signature === "string"
    && /^[A-Za-z0-9_-]{43}$/.test(candidate.signature)
    && typeof candidate.lastMessageAt === "string"
    && Number.isFinite(new Date(candidate.lastMessageAt).getTime())
    && new Date(candidate.lastMessageAt).toISOString() === candidate.lastMessageAt;
}

function isAdminReportListCursor(value: unknown): value is AdminReportListCursor {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<AdminReportListCursor>;
  return candidate.version === 1
    && typeof candidate.id === "string"
    && UUID_PATTERN.test(candidate.id)
    && typeof candidate.createdAt === "string"
    && Number.isFinite(new Date(candidate.createdAt).getTime())
    && new Date(candidate.createdAt).toISOString() === candidate.createdAt
    && Number.isInteger(candidate.statusRank)
    && Number(candidate.statusRank) >= 0
    && Number(candidate.statusRank) <= 2
    && typeof candidate.signature === "string"
    && /^[A-Za-z0-9_-]{43}$/.test(candidate.signature);
}

function conversationCursorViewerBinding(userId: string) {
  return createHmac("sha256", cursorSecret()).update(`messaging-inbox:${userId}`).digest("base64url");
}

function cursorSignature(audience: string, payload: object) {
  return createHmac("sha256", cursorSecret())
    .update(`${audience}:${JSON.stringify(payload)}`)
    .digest("base64url");
}

function cursorSecret() {
  const secret = process.env.AUTH_RATE_LIMIT_PEPPER
    || (process.env.NODE_ENV === "production" ? null : "liber-local-messaging-cursor-v1");
  if (!secret || (process.env.NODE_ENV === "production" && secret.length < 32)) {
    throw new MessagingError("UNAVAILABLE", "Messaging is unavailable.", 503);
  }
  return secret;
}

function encodeCursor(value: object) {
  return Buffer.from(JSON.stringify(value), "utf8").toString("base64url");
}

function safeEqual(first: string, second: string) {
  const firstBuffer = Buffer.from(first);
  const secondBuffer = Buffer.from(second);
  return firstBuffer.length === secondBuffer.length && timingSafeEqual(firstBuffer, secondBuffer);
}
