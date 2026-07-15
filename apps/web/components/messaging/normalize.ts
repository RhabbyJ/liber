import type {
  AdminMessageReport,
  MessagingListPageInfo,
  ConversationStatus,
  ConversationSummary,
  ConversationThread,
  MessageKind,
  MessagePageInfo,
  MessagingMessage,
  MessagingPropertySnapshot,
} from "./types";

type UnknownRecord = Record<string, unknown>;

const conversationStatuses = new Set<ConversationStatus>([
  "AWAITING_BUYER",
  "ACTIVE",
  "READ_ONLY",
  "BLOCKED",
]);
const messageKinds = new Set<MessageKind>(["INVITE", "GUIDED", "FREE_TEXT", "SYSTEM"]);
const messageSenders = new Set(["COUNTERPARTY", "SYSTEM", "YOU"]);

export function normalizeConversationSummaries(value: unknown): ConversationSummary[] {
  const items = Array.isArray(value) ? value : arrayValue(recordValue(value), "items");
  return items.map(normalizeConversationSummary).filter((item): item is ConversationSummary => Boolean(item));
}

export function normalizeListPageInfo(value: unknown): MessagingListPageInfo {
  const payload = recordValue(value);
  const pageInfo = recordValue(payload?.pageInfo);
  return {
    hasMore: booleanValue(pageInfo?.hasMore),
    moderationRevision: optionalText(pageInfo?.moderationRevision) ?? null,
    nextCursor: optionalText(pageInfo?.nextCursor) ?? null,
  };
}

export function mergeConversationSummaries(
  current: ConversationSummary[],
  incoming: ConversationSummary[],
) {
  const merged = [...current];
  const indexById = new Map(current.map((conversation, index) => [conversation.id, index] as const));
  for (const conversation of incoming) {
    const existingIndex = indexById.get(conversation.id);
    if (existingIndex === undefined) {
      indexById.set(conversation.id, merged.length);
      merged.push(conversation);
    } else {
      merged[existingIndex] = conversation;
    }
  }
  return merged.sort((first, second) => {
    const dateOrder = second.lastMessageAt.localeCompare(first.lastMessageAt);
    return dateOrder === 0 ? second.id.localeCompare(first.id) : dateOrder;
  });
}

export function conversationPageSignature(
  conversations: ConversationSummary[],
  pageInfo: MessagingListPageInfo,
) {
  return JSON.stringify({
    conversations: conversations.map((conversation) => ({
      counterpartLabel: conversation.counterpartLabel,
      id: conversation.id,
      lastMessage: conversation.lastMessage,
      lastMessageAt: conversation.lastMessageAt,
      muted: conversation.muted,
      propertyTitle: conversation.propertyTitle,
      status: conversation.status,
      unreadCount: conversation.unreadCount,
    })),
    pageInfo,
  });
}

export function normalizedMessageLength(value: string) {
  return Array.from(value.replace(/\r\n?/g, "\n").normalize("NFC").trim()).length;
}

export function normalizeConversationThread(value: unknown): ConversationThread | null {
  const source = recordValue(value);
  if (!source) return null;
  const id = textValue(source.id);
  const viewerRole = enumValue(source.participantRole);
  const safetyNotice = textValue(source.safetyNotice);
  if (!id || (viewerRole !== "BUYER" && viewerRole !== "SELLER") || !safetyNotice) return null;

  const counterpartLabel = viewerRole === "BUYER"
    ? "Property seller"
    : textValue(source.counterpartyLabel) || "Buyer";
  const messages = arrayValue(source, "items")
    .map((item) => normalizeMessage(item, counterpartLabel))
    .filter((item): item is MessagingMessage => Boolean(item));
  const pageInfo = normalizePageInfo(recordValue(source.pageInfo));
  const propertySnapshot = normalizePropertySnapshot(source.property, source.imageIds);

  return {
    id,
    status: normalizeConversationStatus(source.status),
    viewerRole,
    counterpartLabel,
    propertySnapshot,
    inviteStatus: textValue(recordValue(source.invite)?.status) || "Invite",
    canSend: booleanValue(source.canSend),
    muted: booleanValue(source.muted),
    moderationRevision: optionalDate(source.moderationRevision) ?? null,
    safetyNotice,
    sellerFollowUpAvailableAt: optionalDate(source.sellerFollowUpAvailableAt),
    messages: sortMessages(messages),
    pageInfo,
  };
}

export function normalizeMessagePage(value: unknown, current: ConversationThread): ConversationThread {
  const payload = recordValue(value);
  if (!payload) return current;
  const incoming = arrayValue(payload, "items")
    .map((item) => normalizeMessage(item, current.counterpartLabel))
    .filter((item): item is MessagingMessage => Boolean(item));
  return {
    ...current,
    messages: mergeMessages(current.messages, incoming),
    pageInfo: normalizePageInfo(recordValue(payload.pageInfo)),
  };
}

export function messagePageMetadata(value: unknown) {
  const payload = recordValue(value);
  const pageInfo = recordValue(payload?.pageInfo);
  const items = arrayValue(payload, "items");
  const newestItem = recordValue(items.at(-1));
  return {
    hasMore: booleanValue(pageInfo?.hasMore),
    newestMessageId: optionalText(pageInfo?.newestMessageId, newestItem?.id) ?? null,
  };
}

export function mergeMessages(
  current: MessagingMessage[],
  incoming: MessagingMessage[],
): MessagingMessage[] {
  const byId = new Map(current.map((message) => [message.id, message]));
  for (const message of incoming) {
    const existing = byId.get(message.id);
    byId.set(message.id, existing && messagesEqual(existing, message) ? existing : message);
  }
  return sortMessages([...byId.values()]);
}

export function mergeCanonicalConversationState(
  current: ConversationThread,
  canonical: ConversationThread,
): ConversationThread {
  if (current.id !== canonical.id) return current;
  const messages = mergeMessages(current.messages, canonical.messages);
  return {
    ...canonical,
    messages,
    pageInfo: current.pageInfo,
    propertySnapshot: propertySnapshotsEqual(current.propertySnapshot, canonical.propertySnapshot)
      ? current.propertySnapshot
      : canonical.propertySnapshot,
  };
}

export function normalizeAdminMessageReports(value: unknown): AdminMessageReport[] {
  const items = Array.isArray(value) ? value : arrayValue(recordValue(value), "items");
  return items.map(normalizeAdminMessageReport)
    .filter((item): item is AdminMessageReport => Boolean(item));
}

function normalizeConversationSummary(value: unknown): ConversationSummary | null {
  const source = recordValue(value);
  if (!source) return null;
  const id = textValue(source.id);
  const role = enumValue(source.participantRole);
  if (!id || (role !== "BUYER" && role !== "SELLER")) return null;
  const counterpartLabel = role === "BUYER"
    ? "Property seller"
    : textValue(source.counterpartyLabel) || "Buyer";
  const property = recordValue(source.property);
  const lastMessage = normalizeMessage(source.lastMessage, counterpartLabel);

  return {
    id,
    status: normalizeConversationStatus(source.status),
    counterpartLabel,
    lastMessage,
    lastMessageAt: optionalDate(source.lastMessageAt) ?? lastMessage?.createdAt ?? "",
    muted: booleanValue(source.muted),
    propertyTitle: textValue(property?.title) || "Private property",
    unreadCount: integerValue(source.unreadCount),
  };
}

function normalizeMessage(value: unknown, counterpartLabel: string, allowExplicitSenderLabel = false): MessagingMessage | null {
  const source = recordValue(value);
  if (!source) return null;
  const id = textValue(source.id);
  if (!id) return null;
  const kind = enumValue(source.kind) as MessageKind;
  const sender = enumValue(source.sender);
  if (!messageKinds.has(kind) || !messageSenders.has(sender)) return null;
  const isOwn = sender === "YOU";
  const redacted = booleanValue(source.redacted) || enumValue(source.moderationStatus) === "REDACTED";
  const body = textValue(source.body);
  const senderLabel = kind === "SYSTEM" || sender === "SYSTEM"
    ? "Liber"
    : isOwn
      ? "You"
      : allowExplicitSenderLabel
        ? textValue(source.senderLabel) || counterpartLabel
        : counterpartLabel;

  return {
    id,
    kind,
    body,
    createdAt: optionalDate(source.createdAt) ?? "",
    isOwn,
    redacted,
    senderLabel,
  };
}

function normalizeAdminMessageReport(value: unknown): AdminMessageReport | null {
  const source = recordValue(value);
  if (!source) return null;
  const id = textValue(source.id);
  if (!id) return null;
  const reportedLabel = textValue(source.reportedLabel) || "Reported user";
  const message = normalizeMessage(source.message, reportedLabel, true);
  if (!message) return null;
  const status = enumValue(source.status);

  return {
    id,
    category: textValue(source.category) || "OTHER",
    status: status === "IN_REVIEW" || status === "ACTIONED" || status === "DISMISSED" ? status : "OPEN",
    details: optionalText(source.details),
    inviteStatus: optionalText(recordValue(source.invite)?.status),
    message,
    propertyTitle: textValue(source.propertyTitle, recordValue(source.property)?.title) || "Private property",
    reporterLabel: textValue(source.reporterLabel) || "Participant",
    reportedLabel,
    resolution: optionalText(source.resolution),
    severity: optionalText(source.severity),
    surroundingMessages: arrayValue(source, "surroundingMessages")
      .map((item) => normalizeMessage(item, reportedLabel, true))
      .filter((item): item is MessagingMessage => Boolean(item)),
    priorBlockCount: optionalNonNegativeInteger(source.priorBlockCount),
    priorReportCount: optionalNonNegativeInteger(source.priorReportCount),
  };
}

function normalizePropertySnapshot(value: unknown, topLevelImageIds?: unknown): MessagingPropertySnapshot {
  const source = recordValue(value);
  const identityCurrent = source?.identityCurrent === true;
  return {
    imageIds: identityCurrent
      ? (Array.isArray(topLevelImageIds) ? topLevelImageIds : arrayValue(source, "imageIds"))
          .filter((item): item is string => typeof item === "string")
      : [],
    identityCurrent,
    location: source ? optionalText(source.location) : undefined,
    ownershipStatus: source ? optionalText(source.ownershipStatus) : undefined,
    title: source ? textValue(source.title) || "Private property" : "Private property",
  };
}

function normalizePageInfo(value: UnknownRecord | null): MessagePageInfo {
  return {
    hasMore: booleanValue(value?.hasMore),
    nextCursor: optionalText(value?.nextCursor) ?? null,
  };
}

function normalizeConversationStatus(value: unknown): ConversationStatus {
  const normalized = enumValue(value) as ConversationStatus;
  return conversationStatuses.has(normalized) ? normalized : "READ_ONLY";
}

function messagesEqual(first: MessagingMessage, second: MessagingMessage) {
  return first.body === second.body
    && first.createdAt === second.createdAt
    && first.isOwn === second.isOwn
    && first.kind === second.kind
    && first.redacted === second.redacted
    && first.senderLabel === second.senderLabel;
}

function propertySnapshotsEqual(first: MessagingPropertySnapshot, second: MessagingPropertySnapshot) {
  return first.identityCurrent === second.identityCurrent
    && first.location === second.location
    && first.ownershipStatus === second.ownershipStatus
    && first.title === second.title
    && first.imageIds.length === second.imageIds.length
    && first.imageIds.every((id, index) => id === second.imageIds[index]);
}

function sortMessages(messages: MessagingMessage[]) {
  return messages.sort((first, second) => {
    const dateOrder = first.createdAt.localeCompare(second.createdAt);
    return dateOrder === 0 ? first.id.localeCompare(second.id) : dateOrder;
  });
}

function recordValue(value: unknown): UnknownRecord | null {
  return value && typeof value === "object" && !Array.isArray(value) ? value as UnknownRecord : null;
}

function arrayValue(source: UnknownRecord | null, key: string): unknown[] {
  return source && Array.isArray(source[key]) ? source[key] as unknown[] : [];
}

function textValue(...values: unknown[]) {
  return values.find((value): value is string => typeof value === "string" && value.length > 0) ?? "";
}

function optionalText(...values: unknown[]) {
  return textValue(...values) || undefined;
}

function enumValue(value: unknown) {
  return textValue(value).trim().toUpperCase();
}

function booleanValue(value: unknown) {
  return typeof value === "boolean" ? value : false;
}

function integerValue(value: unknown) {
  return typeof value === "number" && Number.isInteger(value) && value > 0 ? value : 0;
}

function optionalNonNegativeInteger(value: unknown) {
  return typeof value === "number" && Number.isInteger(value) && value >= 0 ? value : undefined;
}

function optionalDate(...values: unknown[]) {
  const value = values.find((candidate) => (typeof candidate === "string" && candidate.length > 0) || candidate instanceof Date);
  if (typeof value === "string") return value;
  if (value instanceof Date) return value.toISOString();
  return undefined;
}
