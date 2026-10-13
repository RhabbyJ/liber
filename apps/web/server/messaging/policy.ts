import { MessagingError, messagingUnavailable } from "./errors";
import type { MessagingParticipantRole } from "./templates";

export const MESSAGE_ATTEMPT_LIMIT_PER_MINUTE = 20;
export const MESSAGE_CONVERSATION_LIMIT_PER_HOUR = 120;
export const MESSAGE_USER_LIMIT_PER_24_HOURS = 500;
export const UNREAD_MESSAGE_EMAIL_DELAY_MS = 10 * 60_000;
export const PUBLIC_BLOCKED_CONVERSATION_STATE = {
  closedReason: "CONVERSATION_UNAVAILABLE",
  inviteStatus: "Unavailable",
  status: "READ_ONLY",
} as const;

export type ConversationSendState = {
  buyerProfileActive: boolean;
  buyerUserActive: boolean;
  conversationStatus: "ACTIVE" | "AWAITING_BUYER" | "BLOCKED" | "READ_ONLY";
  hasBlock: boolean;
  inviteExpiresAt: Date | null;
  inviteStatus: "ACCEPTED" | "DECLINED" | "EXPIRED" | "SENT" | "VIEWED" | "WITHDRAWN";
  propertyApproved: boolean;
  propertyIdentityCurrent: boolean;
  sellerAccessApproved: boolean;
  sellerUserActive: boolean;
};

export function assertConversationCanSend(args: {
  kind: "FREE_TEXT" | "GUIDED";
  now?: Date;
  participantRole: MessagingParticipantRole;
  state: ConversationSendState;
  templateUse?: "OPENING" | "QUICK_REPLY" | "SELLER_FOLLOW_UP";
}) {
  const now = args.now ?? new Date();
  const { state } = args;

  if (
    state.hasBlock
    || state.conversationStatus === "BLOCKED"
    || state.conversationStatus === "READ_ONLY"
    || !state.buyerUserActive
    || !state.sellerUserActive
    || !state.buyerProfileActive
    || !state.sellerAccessApproved
    || !state.propertyApproved
    || !state.propertyIdentityCurrent
  ) {
    throw messagingUnavailable();
  }

  if (["DECLINED", "EXPIRED", "WITHDRAWN"].includes(state.inviteStatus)) {
    throw messagingUnavailable();
  }

  if (state.inviteStatus !== "ACCEPTED" && !inviteDeadlineIsCurrent(state.inviteExpiresAt, now)) {
    throw messagingUnavailable();
  }

  if (state.conversationStatus === "ACTIVE" || state.inviteStatus === "ACCEPTED") return;

  if (args.participantRole === "BUYER") return;

  throw new MessagingError(
    "CONFLICT",
    "The buyer must respond before additional messages are available.",
    409,
  );
}

export function inviteDeadlineIsCurrent(deadline: Date | null, now = new Date()) {
  return deadline instanceof Date && Number.isFinite(deadline.getTime()) && deadline.getTime() > now.getTime();
}
