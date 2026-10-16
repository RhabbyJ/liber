// Guided and plain-text sends under the canonical lock order and send-side quotas.
import { Prisma, prisma } from "@liber/db";
import { checkRateLimit } from "../rate-limit";
import { assertUuid, inviteStatusValue, requireConversationAccess, requireMessagingUser } from "./access";
import { pairHasBlock } from "./blocks-and-mutes";
import { normalizeMessageBody } from "./content";
import { MessagingError, messagingUnavailable } from "./errors";
import { lockConversation, lockInvite, lockMessageSender, lockPair } from "./locks";
import { messageColumns, messageDto, type MessageRow } from "./message-rows";
import {
  assertConversationCanSend,
  MESSAGE_ATTEMPT_LIMIT_PER_MINUTE,
  MESSAGE_CONVERSATION_LIMIT_PER_HOUR,
  MESSAGE_USER_LIMIT_PER_24_HOURS,
} from "./policy";
import { resolveMessagingTemplate } from "./templates";
import type { SendConversationMessageInput } from "./types";
import { queueUnreadMessageEmail } from "./unread-email";

export async function sendConversationMessage(input: SendConversationMessageInput) {
  const currentUser = await requireMessagingUser();
  assertUuid(input.clientMessageId, "Client message ID");
  const attemptLimit = await checkRateLimit(
    `message-send:${currentUser.id}`,
    MESSAGE_ATTEMPT_LIMIT_PER_MINUTE,
    60_000,
  );
  if (!attemptLimit.allowed) {
    throw new MessagingError("RATE_LIMITED", "Message limit reached. Try again later.", 429);
  }

  return prisma.$transaction(async (tx) => {
    const initial = await requireConversationAccess(tx, input.conversationId, currentUser.id);
    await lockPair(tx, initial.seller_user_id, initial.buyer_user_id);
    await lockInvite(tx, initial.invite_id);
    await lockConversation(tx, input.conversationId);
    const access = await requireConversationAccess(tx, input.conversationId, currentUser.id);

    const [existing] = await tx.$queryRaw<MessageRow[]>(Prisma.sql`
      SELECT ${messageColumns()}
      FROM public."Message" message
      WHERE message."conversationId" = ${input.conversationId}::uuid
        AND message."clientMessageId" = ${input.clientMessageId}::uuid
    `);
    if (existing) {
      if (existing.sender_user_id !== currentUser.id) throw messagingUnavailable();
      return { data: messageDto(existing, currentUser.id), idempotent: true };
    }

    const hasBlock = await pairHasBlock(tx, access.seller_user_id, access.buyer_user_id);
    const template = input.kind === "GUIDED"
      ? resolveMessagingTemplate({
          key: input.templateKey ?? "",
          role: access.participant_role,
          use: access.participant_role === "SELLER" && access.conversation_status === "AWAITING_BUYER"
            ? "SELLER_FOLLOW_UP"
            : access.participant_role === "BUYER" ? "QUICK_REPLY" : undefined,
          version: input.templateVersion ?? 0,
        })
      : null;
    const body = template ? template.text : normalizeMessageBody(input.body ?? "");

    assertConversationCanSend({
      kind: input.kind,
      participantRole: access.participant_role,
      state: {
        buyerProfileActive: access.buyer_profile_active,
        buyerUserActive: access.buyer_user_active,
        conversationStatus: access.conversation_status,
        hasBlock,
        inviteExpiresAt: access.invite_expires_at,
        inviteStatus: inviteStatusValue(access.invite_status),
        propertyApproved: access.property_approved,
        propertyIdentityCurrent: access.property_identity_current,
        sellerAccessApproved: access.seller_access_approved,
        sellerUserActive: access.seller_user_active,
      },
      templateUse: template?.uses.includes("SELLER_FOLLOW_UP") ? "SELLER_FOLLOW_UP" : template?.uses[0],
    });

    await lockMessageSender(tx, currentUser.id);
    const now = new Date();
    // One interactive transaction is one connection: run its queries sequentially.
    const conversationUsage = await tx.$queryRaw<Array<{ count: number }>>`
      SELECT count(*)::integer AS count
      FROM public."Message"
      WHERE "conversationId" = ${input.conversationId}::uuid
        AND kind IN ('GUIDED'::public."MessageKind", 'FREE_TEXT'::public."MessageKind")
        AND "createdAt" >= ${new Date(now.getTime() - 60 * 60_000)}
    `;
    const userUsage = await tx.$queryRaw<Array<{ count: number }>>`
      SELECT count(*)::integer AS count
      FROM public."Message"
      WHERE "senderUserId" = ${currentUser.id}::uuid
        AND kind IN ('GUIDED'::public."MessageKind", 'FREE_TEXT'::public."MessageKind")
        AND "createdAt" >= ${new Date(now.getTime() - 24 * 60 * 60_000)}
    `;
    if (
      Number(conversationUsage[0]?.count ?? 0) >= MESSAGE_CONVERSATION_LIMIT_PER_HOUR
      || Number(userUsage[0]?.count ?? 0) >= MESSAGE_USER_LIMIT_PER_24_HOURS
    ) {
      throw new MessagingError("RATE_LIMITED", "Message limit reached. Try again later.", 429);
    }

    const [created] = await tx.$queryRaw<MessageRow[]>(Prisma.sql`
      INSERT INTO public."Message" AS message (
        "conversationId", "senderUserId", kind, "templateKey", "templateVersion",
        body, "clientMessageId", "moderationStatus", "createdAt"
      ) VALUES (
        ${input.conversationId}::uuid,
        ${currentUser.id}::uuid,
        CAST(${input.kind} AS public."MessageKind"),
        ${template?.key ?? null},
        ${template?.version ?? null},
        ${body},
        ${input.clientMessageId}::uuid,
        'ALLOWED'::public."MessageModerationStatus",
        ${now}
      )
      RETURNING ${messageColumns()}
    `);
    if (!created) throw new Error("Message insert returned no row.");

    await queueUnreadMessageEmail(tx, access, currentUser.id, created.id, now);
    await tx.adminAuditLog.create({
      data: {
        action: "message_sent",
        actorUserId: currentUser.id,
        metadata: {
          kind: input.kind,
          ...(template ? { templateKey: template.key, templateVersion: template.version } : {}),
        },
        targetId: created.id,
        targetType: "message",
      },
    });

    return { data: messageDto(created, currentUser.id), idempotent: false };
  });
}
