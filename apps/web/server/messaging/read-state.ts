// Participant read markers, invite VIEWED transitions and unread-email cancellation.
import { Prisma, prisma } from "@liber/db";
import { requireConversationAccess, requireMessagingUser } from "./access";
import { lockConversation, lockInvite, lockPair } from "./locks";
import { messageMarker } from "./message-rows";
import { cancelUnreadMessageEmail } from "./unread-email";

export async function markConversationRead(
  input: { conversationId: string; lastReadMessageId: string },
) {
  const currentUser = await requireMessagingUser();
  return prisma.$transaction(async (tx) => {
    const initial = await requireConversationAccess(tx, input.conversationId, currentUser.id);
    await lockPair(tx, initial.seller_user_id, initial.buyer_user_id);
    await lockInvite(tx, initial.invite_id);
    await lockConversation(tx, input.conversationId);
    const access = await requireConversationAccess(tx, input.conversationId, currentUser.id);
    const marker = await messageMarker(tx, input.conversationId, input.lastReadMessageId);

    const advancesReadState = markerIsNewer(marker, access.last_read_at, access.last_read_message_id);
    if (advancesReadState) {
      await tx.$executeRaw`
        UPDATE public."ConversationParticipant"
        SET "lastReadMessageId" = ${marker.id}::uuid,
            "lastReadAt" = ${marker.created_at}
        WHERE "conversationId" = ${input.conversationId}::uuid
          AND "userId" = ${currentUser.id}::uuid
      `;
    }
    if (access.participant_role === "BUYER" && access.invite_status === "SENT") {
      await tx.$executeRaw`
        UPDATE public."Invite"
        SET status = 'VIEWED', "viewedAt" = COALESCE("viewedAt", now()), "updatedAt" = now()
        WHERE id = ${access.invite_id} AND status = 'SENT'
      `;
    }
    const effectiveReadMarker = advancesReadState
      ? marker
      : { created_at: access.last_read_at!, id: access.last_read_message_id! };
    if (!await hasUnreadNotifiableMessage(tx, input.conversationId, currentUser.id, effectiveReadMarker)) {
      await cancelUnreadMessageEmail(tx, input.conversationId, currentUser.id, "Conversation was read.");
    }
    return { data: { lastReadMessageId: effectiveReadMarker.id } };
  });
}

function markerIsNewer(
  marker: { created_at: Date; id: string },
  lastReadAt: Date | null,
  lastReadMessageId: string | null,
) {
  if (!lastReadAt || !lastReadMessageId) return true;
  const dateComparison = marker.created_at.getTime() - lastReadAt.getTime();
  return dateComparison > 0 || (dateComparison === 0 && marker.id > lastReadMessageId);
}

async function hasUnreadNotifiableMessage(
  client: Pick<typeof prisma, "$queryRaw">,
  conversationId: string,
  recipientUserId: string,
  marker: { created_at: Date; id: string },
) {
  const [row] = await client.$queryRaw<Array<{ unread: boolean }>>(Prisma.sql`
    SELECT EXISTS (
      SELECT 1
      FROM public."Message" message
      WHERE message."conversationId" = ${conversationId}::uuid
        AND message."senderUserId" IS NOT NULL
        AND message."senderUserId" <> ${recipientUserId}::uuid
        AND message.kind IN ('GUIDED'::public."MessageKind", 'FREE_TEXT'::public."MessageKind")
        AND (
          message."createdAt" > ${marker.created_at}
          OR (message."createdAt" = ${marker.created_at} AND message.id > ${marker.id}::uuid)
        )
    ) AS unread
  `);
  return row?.unread === true;
}
