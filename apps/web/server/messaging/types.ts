export type ConversationStatusValue = "ACTIVE" | "AWAITING_BUYER" | "BLOCKED" | "READ_ONLY";
export type ConversationParticipantRoleValue = "BUYER" | "SELLER";
type MessageKindValue = "FREE_TEXT" | "GUIDED" | "INVITE" | "SYSTEM";
type MessageModerationStatusValue = "ALLOWED" | "FLAGGED" | "REDACTED";

export type PropertySnapshotDTO = {
  identityVersion: number | null;
  location: string;
  ownershipStatus: string;
  title: string;
};

export type ConversationMessageDTO = {
  body: string;
  createdAt: string;
  id: string;
  kind: MessageKindValue;
  moderationStatus: MessageModerationStatusValue;
  sender: "COUNTERPARTY" | "SYSTEM" | "YOU";
  templateKey: string | null;
  templateVersion: number | null;
};

export type ConversationSummaryDTO = {
  closedReason: string | null;
  counterpartyLabel: string;
  id: string;
  invite: {
    id: string;
    status: string;
  };
  lastMessage: ConversationMessageDTO | null;
  lastMessageAt: string;
  muted: boolean;
  participantRole: ConversationParticipantRoleValue;
  property: PropertySnapshotDTO & {
    identityCurrent: boolean;
  };
  status: ConversationStatusValue;
  unreadCount: number;
};

export type ConversationThreadDTO = ConversationSummaryDTO & {
  canSend: boolean;
  imageIds: string[];
  moderationRevision: string | null;
  safetyNotice: string;
  sellerFollowUpAvailableAt: string | null;
  items: ConversationMessageDTO[];
  pageInfo: MessagePageInfo;
};

type MessagePageInfo = {
  hasMore: boolean;
  newestMessageId: string | null;
  nextCursor: string | null;
};

export type ConversationMessagePage = {
  items: ConversationMessageDTO[];
  pageInfo: MessagePageInfo;
};

export type SendConversationMessageInput = {
  body?: string;
  clientMessageId: string;
  conversationId: string;
  kind: "FREE_TEXT" | "GUIDED";
  templateKey?: string;
  templateVersion?: number;
};

export type MessageReportInput = {
  block?: boolean;
  category: string;
  details?: string;
  messageId: string;
};

export type ResolveMessageReportInput = {
  redactMessage?: boolean;
  reportId: string;
  resolution?: string;
  status: "ACTIONED" | "DISMISSED" | "IN_REVIEW";
};
