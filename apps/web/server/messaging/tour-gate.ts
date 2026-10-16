// Tour scheduling eligibility: the same membership, lock order and current-state
// checks as messages, exposed to `tours.ts` without the message send path.
import { prisma } from "@liber/db";
import { checkRateLimit } from "../rate-limit";
import {
  effectiveConversationState,
  requireConversationAccess,
  requireMessagingUser,
  type ConversationAccessRow,
} from "./access";
import { MessagingError, messagingUnavailable } from "./errors";
import { lockConversation, lockInvite, lockPair, type TransactionClient } from "./locks";

// The delivery recheck makes no external calls; this leaves room to wait behind
// one default-timeout (5 s) transaction that holds the pair lock.
export const SCHEDULE_DELIVERY_TRANSACTION_TIMEOUT_MS = 10_000;

export async function getConversationScheduleContext(conversationId: string) {
  const user = await requireMessagingUser();
  const access = await requireConversationAccess(prisma, conversationId, user.id);
  return scheduleContext(access, user.id);
}

export async function withConversationScheduleMutation<T>(
  conversationId: string,
  operation: (tx: TransactionClient, context: ReturnType<typeof scheduleContext>) => Promise<T>,
) {
  const user = await requireMessagingUser();
  const limit = await checkRateLimit(`tour-schedule:${user.id}`, 20, 60_000);
  if (!limit.allowed) throw new MessagingError("RATE_LIMITED", "Try again later.", 429);
  return prisma.$transaction(async (tx) => {
    const initial = await requireConversationAccess(tx, conversationId, user.id);
    await lockPair(tx, initial.seller_user_id, initial.buyer_user_id);
    await lockInvite(tx, initial.invite_id);
    await lockConversation(tx, conversationId);
    const access = await requireConversationAccess(tx, conversationId, user.id);
    const context = scheduleContext(access, user.id);
    if (!context.canSchedule) throw messagingUnavailable();
    return operation(tx, context);
  });
}

export async function getConversationScheduleDeliveryContext(conversationId: string, userId: string) {
  const access = await requireConversationAccess(prisma, conversationId, userId);
  return scheduleDeliveryContext(access, userId);
}

/**
 * Rechecks delivery eligibility under the schedule lock order. `operation` must
 * only read or write the database: callers make external (provider) calls after
 * this transaction commits so locks and the pooled connection are never held
 * across HTTP.
 */
export async function withConversationScheduleDelivery<T>(
  conversationId: string,
  userId: string,
  operation: (tx: TransactionClient, recipient: { email: string }) => Promise<T>,
) {
  return prisma.$transaction(async (tx) => {
    const initial = await requireConversationAccess(tx, conversationId, userId);
    await lockPair(tx, initial.seller_user_id, initial.buyer_user_id);
    await lockInvite(tx, initial.invite_id);
    await lockConversation(tx, conversationId);
    const access = await requireConversationAccess(tx, conversationId, userId);
    const recipient = scheduleDeliveryContext(access, userId);
    return recipient ? operation(tx, recipient) : null;
  }, { timeout: SCHEDULE_DELIVERY_TRANSACTION_TIMEOUT_MS });
}

function scheduleDeliveryContext(access: ConversationAccessRow, userId: string) {
  if (!scheduleContext(access, userId).canSchedule || access.muted_at || access.property_test_approved) return null;
  return {
    email: access.participant_role === "BUYER" ? access.buyer_email : access.seller_email,
  };
}

function scheduleContext(access: ConversationAccessRow, userId: string) {
  const canSchedule = access.conversation_status === "ACTIVE" && access.invite_status === "ACCEPTED"
    && effectiveConversationState(access).status === "ACTIVE";
  return {
    userId,
    otherUserId: access.other_user_id,
    canSchedule,
    canReceiveTourEmail: canSchedule && !access.muted_at && !access.property_test_approved,
  };
}
