// Content-free unread-message email jobs: queued on send, cancelled on read or mute.
import { Prisma, prisma } from "@liber/db";
import type { ConversationAccessRow } from "./access";
import type { TransactionClient } from "./locks";
import { UNREAD_MESSAGE_EMAIL_DELAY_MS } from "./policy";

export async function queueUnreadMessageEmail(
  tx: TransactionClient,
  access: ConversationAccessRow,
  senderUserId: string,
  messageId: string,
  now: Date,
) {
  const recipientUserId = senderUserId === access.seller_user_id ? access.buyer_user_id : access.seller_user_id;
  const recipientEmail = senderUserId === access.seller_user_id ? access.buyer_email : access.seller_email;
  const [recipient] = await tx.$queryRaw<Array<{ created_at: Date; last_read_at: Date | null; muted_at: Date | null }>>`
    SELECT "createdAt" AS created_at, "lastReadAt" AS last_read_at, "mutedAt" AS muted_at
    FROM public."ConversationParticipant"
    WHERE "conversationId" = ${access.conversation_id}::uuid
      AND "userId" = ${recipientUserId}::uuid
  `;
  if (!recipient || recipient.muted_at) return;
  const unreadBatchStart = recipient.last_read_at ?? recipient.created_at;
  const [existing] = await tx.$queryRaw<Array<{ id: string }>>`
    SELECT id FROM public."EmailOutbox"
    WHERE type = 'MESSAGE_UNREAD'
      AND "messageConversationId" = ${access.conversation_id}::uuid
      AND "messageRecipientUserId" = ${recipientUserId}::uuid
      AND "createdAt" > ${unreadBatchStart}
      AND status IN ('PENDING', 'SENDING', 'SENT', 'FAILED')
    LIMIT 1
  `;
  if (existing) return;
  await tx.emailOutbox.create({
    data: {
      idempotencyKey: `message-unread:${access.conversation_id}:${recipientUserId}:${messageId}`,
      messageConversationId: access.conversation_id,
      messageRecipientUserId: recipientUserId,
      nextAttemptAt: new Date(now.getTime() + UNREAD_MESSAGE_EMAIL_DELAY_MS),
      payload: {},
      status: "PENDING",
      subject: "You have an unread Liber message",
      templateName: "message-unread",
      to: recipientEmail,
      type: "MESSAGE_UNREAD",
    },
    select: { id: true },
  });
}

export async function cancelUnreadMessageEmail(
  client: Pick<typeof prisma, "$executeRaw">,
  conversationId: string,
  recipientUserId: string,
  reason: string,
) {
  await client.$executeRaw(Prisma.sql`
    UPDATE public."EmailOutbox"
    SET status = 'CANCELLED'::public."EmailOutboxStatus",
        "lastError" = ${reason},
        "nextAttemptAt" = NULL,
        "lockedAt" = NULL,
        "leaseUntil" = NULL,
        "workerId" = NULL,
        "updatedAt" = now()
    WHERE type = 'MESSAGE_UNREAD'
      AND "messageConversationId" = ${conversationId}::uuid
      AND "messageRecipientUserId" = ${recipientUserId}::uuid
      AND status IN ('PENDING', 'FAILED', 'SENDING')
  `);
}
