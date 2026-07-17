export type ConversationStatus = "AWAITING_BUYER" | "ACTIVE" | "READ_ONLY" | "BLOCKED";

export type MessageKind = "INVITE" | "GUIDED" | "FREE_TEXT" | "SYSTEM";

export type MessagingMessage = {
  id: string;
  kind: MessageKind;
  body: string;
  createdAt: string;
  isOwn: boolean;
  redacted: boolean;
  senderLabel: string;
};

export type MessagingPropertySnapshot = {
  imageIds: string[];
  identityCurrent: boolean;
  location?: string;
  ownershipStatus?: string;
  title: string;
};

export type ConversationSummary = {
  id: string;
  status: ConversationStatus;
  counterpartAvatarVariant: string | null;
  counterpartLabel: string;
  lastMessage: MessagingMessage | null;
  lastMessageAt: string;
  muted: boolean;
  propertyTitle: string;
  unreadCount: number;
};

export type MessagingListPageInfo = {
  hasMore: boolean;
  moderationRevision: string | null;
  nextCursor: string | null;
};

export type ConversationThread = {
  id: string;
  status: ConversationStatus;
  viewerRole: "BUYER" | "SELLER";
  counterpartLabel: string;
  propertySnapshot: MessagingPropertySnapshot;
  inviteStatus: string;
  canSend: boolean;
  muted: boolean;
  moderationRevision: string | null;
  safetyNotice: string;
  sellerFollowUpAvailableAt?: string;
  messages: MessagingMessage[];
  pageInfo: MessagePageInfo;
};

export type MessagePageInfo = {
  hasMore: boolean;
  nextCursor: string | null;
};

export type MessagingTemplateOption = {
  key: string;
  label: string;
  text: string;
  version: number;
};

export type AdminMessageReport = {
  id: string;
  category: string;
  status: "OPEN" | "IN_REVIEW" | "ACTIONED" | "DISMISSED";
  details?: string;
  inviteStatus?: string;
  message: MessagingMessage;
  propertyTitle: string;
  reporterLabel: string;
  reportedLabel: string;
  resolution?: string;
  severity?: string;
  surroundingMessages: MessagingMessage[];
  priorBlockCount?: number;
  priorReportCount?: number;
};

const GUIDED_MESSAGE_TEMPLATE_LABELS: Readonly<Record<string, string>> = {
  BUYER_INTERESTED_QUESTIONS: "Share interest",
  BUYER_MORE_DETAILS: "Request more details",
  BUYER_NOT_A_FIT: "Not a fit",
  BUYER_PROPERTY_CONDITION: "Ask about condition",
  BUYER_SCHEDULE_VIEWING: "Schedule a viewing",
  SELLER_MORE_DETAILS: "Offer more details",
  SELLER_NEXT_STEPS: "Discuss next steps",
  SELLER_PRIVATE_VIEWING: "Schedule a private viewing",
  SELLER_TIMING_AND_PLANS: "Ask about timing",
};

export function messagingTemplateLabel(key: string) {
  return GUIDED_MESSAGE_TEMPLATE_LABELS[key] ?? "Guided message";
}

export function adminReportStatusTone(status: AdminMessageReport["status"]) {
  if (status === "ACTIONED") return "active";
  if (status === "IN_REVIEW") return "info";
  if (status === "OPEN") return "warning";
  return "";
}

const messagingDateTimeFormatter = new Intl.DateTimeFormat("en", {
  dateStyle: "medium",
  timeStyle: "short",
});

export function formatMessagingDateTime(value: string) {
  if (!value) return "";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : messagingDateTimeFormatter.format(date);
}

export const MESSAGE_REPORT_CATEGORIES = [
  { label: "Harassment or threat", value: "HARASSMENT_OR_THREAT" },
  { label: "Discriminatory content", value: "DISCRIMINATORY_CONTENT" },
  { label: "Fraud or scam", value: "FRAUD_OR_SCAM" },
  { label: "Spam", value: "SPAM" },
  { label: "Request for sensitive information", value: "SENSITIVE_INFORMATION_REQUEST" },
  { label: "Off-platform payment request", value: "OFF_PLATFORM_PAYMENT_REQUEST" },
  { label: "Other", value: "OTHER" },
] as const;
