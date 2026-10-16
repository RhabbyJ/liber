// Participant safety controls: per-conversation mutes and permanent V1 blocks.
import { Prisma, prisma } from "@liber/db";
import { hasRole } from "../authz";
import { getSessionUser } from "../session";
import { requireConversationAccess, requireMessagingUser } from "./access";
import { normalizeOptionalText } from "./content";
import { messagingInviteUnavailable, messagingUnavailable } from "./errors";
import { lockPair, type TransactionClient } from "./locks";
import { cancelUnreadMessageEmail } from "./unread-email";

export async function setConversationMuted(
  input: { conversationId: string; muted: boolean },
) {
  const currentUser = await requireMessagingUser();
  return prisma.$transaction(async (tx) => {
    const initial = await requireConversationAccess(tx, input.conversationId, currentUser.id);
    await lockPair(tx, initial.seller_user_id, initial.buyer_user_id);
    const access = await requireConversationAccess(tx, input.conversationId, currentUser.id);
    await tx.$executeRaw`
      UPDATE public."ConversationParticipant"
      SET "mutedAt" = ${input.muted ? new Date() : null}
      WHERE "conversationId" = ${input.conversationId}::uuid
        AND "userId" = ${currentUser.id}::uuid
    `;
    if (input.muted) {
      await cancelUnreadMessageEmail(tx, input.conversationId, currentUser.id, "Conversation notifications were muted.");
    }
    return { data: { muted: input.muted, role: access.participant_role } };
  });
}

export async function blockConversationUser(
  input: { conversationId: string; reason?: string },
) {
  const currentUser = await requireMessagingUser();
  return prisma.$transaction(async (tx) => {
    const initial = await requireConversationAccess(tx, input.conversationId, currentUser.id);
    await lockPair(tx, initial.seller_user_id, initial.buyer_user_id);
    const access = await requireConversationAccess(tx, input.conversationId, currentUser.id);
    const conversationsClosed = await blockPairInTransaction(
      tx,
      currentUser.id,
      access.other_user_id,
      input.reason,
    );
    await tx.adminAuditLog.create({
      data: {
        action: "conversation_user_blocked",
        actorUserId: currentUser.id,
        metadata: { conversationsClosed },
        targetId: input.conversationId,
        targetType: "conversation",
      },
    });
    return { data: { blocked: true } };
  });
}

export async function blockUserByBuyerProfile(input: { buyerProfileId: string }) {
  const currentUser = await getSessionUser();
  if (!currentUser || (!hasRole(currentUser, "SELLER") && !hasRole(currentUser, "ADMIN"))) throw messagingUnavailable();
  const profile = await prisma.buyerProfile.findUnique({
    where: { id: input.buyerProfileId },
    select: { userId: true },
  });
  if (!profile || profile.userId === currentUser.id) throw messagingUnavailable();
  return prisma.$transaction(async (tx) => {
    await lockPair(tx, currentUser.id, profile.userId);
    const conversationsClosed = await blockPairInTransaction(tx, currentUser.id, profile.userId, "Profile block");
    await tx.adminAuditLog.create({
      data: {
        action: "buyer_profile_user_blocked",
        actorUserId: currentUser.id,
        metadata: { conversationsClosed },
        targetId: input.buyerProfileId,
        targetType: "buyer_profile",
      },
    });
    return { data: { blocked: true } };
  });
}

export async function pairHasBlock(client: Pick<typeof prisma, "$queryRaw">, firstUserId: string, secondUserId: string) {
  const [row] = await client.$queryRaw<Array<{ blocked: boolean }>>(Prisma.sql`
    SELECT EXISTS (
      SELECT 1 FROM public."UserBlock" block
      WHERE (block."blockerUserId" = ${firstUserId}::uuid AND block."blockedUserId" = ${secondUserId}::uuid)
         OR (block."blockerUserId" = ${secondUserId}::uuid AND block."blockedUserId" = ${firstUserId}::uuid)
    ) AS blocked
  `);
  return row?.blocked === true;
}

export async function usersHaveMessagingBlock(
  client: Pick<typeof prisma, "$queryRaw">,
  firstUserId: string,
  secondUserId: string,
) {
  return pairHasBlock(client, firstUserId, secondUserId);
}

export async function lockAndAssertInvitePairAvailable(
  tx: TransactionClient,
  firstUserId: string,
  secondUserId: string,
) {
  await lockPair(tx, firstUserId, secondUserId);
  if (await pairHasBlock(tx, firstUserId, secondUserId)) {
    throw messagingInviteUnavailable();
  }
}

export async function blockPairInTransaction(
  tx: TransactionClient,
  blockerUserId: string,
  blockedUserId: string,
  reason?: string,
) {
  const [result] = await tx.$queryRaw<Array<{ count: number }>>`
    SELECT count(*)::integer AS count
    FROM public."Conversation" conversation
    WHERE conversation.status <> 'BLOCKED'::public."ConversationStatus"
      AND EXISTS (
        SELECT 1 FROM public."ConversationParticipant" first_participant
        WHERE first_participant."conversationId" = conversation.id
          AND first_participant."userId" = ${blockerUserId}::uuid
      )
      AND EXISTS (
        SELECT 1 FROM public."ConversationParticipant" second_participant
        WHERE second_participant."conversationId" = conversation.id
          AND second_participant."userId" = ${blockedUserId}::uuid
      )
  `;

  await tx.$executeRaw`
    INSERT INTO public."UserBlock" ("blockerUserId", "blockedUserId", reason, "createdAt")
    VALUES (${blockerUserId}::uuid, ${blockedUserId}::uuid, ${normalizeOptionalText(reason, 500, "Block reason")}, now())
    ON CONFLICT ("blockerUserId", "blockedUserId") DO NOTHING
  `;
  await tx.$executeRaw`
    WITH frozen AS (
      UPDATE public."LoiNegotiation" negotiation
      SET status = 'READ_ONLY'::public."LoiNegotiationStatus",
          "closedReason" = 'PARTICIPANTS_BLOCKED'::public."LoiClosedReason",
          "closedAt" = now(),
          "updatedAt" = now()
      WHERE negotiation.status NOT IN (
        'TERMS_ALIGNED'::public."LoiNegotiationStatus",
        'DECLINED'::public."LoiNegotiationStatus",
        'WITHDRAWN'::public."LoiNegotiationStatus",
        'EXPIRED'::public."LoiNegotiationStatus",
        'READ_ONLY'::public."LoiNegotiationStatus"
      )
        AND NOT EXISTS (
          SELECT 1
          FROM public."LoiRevision" current_revision
          WHERE current_revision.id = negotiation."currentRevisionId"
            AND current_revision."negotiationId" = negotiation.id
            AND current_revision."responseDeadline" <= statement_timestamp()
        )
        AND (
          (negotiation."buyerUserId" = ${blockerUserId}::uuid AND negotiation."sellerUserId" = ${blockedUserId}::uuid)
          OR (negotiation."buyerUserId" = ${blockedUserId}::uuid AND negotiation."sellerUserId" = ${blockerUserId}::uuid)
        )
      RETURNING id, "currentRevisionId"
    )
    INSERT INTO public."LoiEvent" (
      id, "negotiationId", "revisionId", type, "clientActionId", metadata, "createdAt"
    )
    SELECT gen_random_uuid(), frozen.id, frozen."currentRevisionId",
      'FROZEN'::public."LoiEventType", gen_random_uuid(), '{}'::jsonb, now()
    FROM frozen
  `;
  await tx.$executeRaw`
    DELETE FROM public."LoiDraft" draft
    USING public."LoiNegotiation" negotiation
    WHERE draft."negotiationId" = negotiation.id
      AND (
        (
          negotiation.status = 'READ_ONLY'::public."LoiNegotiationStatus"
          AND negotiation."closedReason" = 'PARTICIPANTS_BLOCKED'::public."LoiClosedReason"
        )
        OR EXISTS (
          SELECT 1
          FROM public."LoiRevision" current_revision
          WHERE current_revision.id = negotiation."currentRevisionId"
            AND current_revision."negotiationId" = negotiation.id
            AND current_revision."responseDeadline" <= statement_timestamp()
        )
      )
      AND (
        (negotiation."buyerUserId" = ${blockerUserId}::uuid AND negotiation."sellerUserId" = ${blockedUserId}::uuid)
        OR (negotiation."buyerUserId" = ${blockedUserId}::uuid AND negotiation."sellerUserId" = ${blockerUserId}::uuid)
      )
  `;
  await tx.emailOutbox.updateMany({
    where: {
      loiNegotiation: {
        OR: [
          { buyerUserId: blockerUserId, sellerUserId: blockedUserId },
          { buyerUserId: blockedUserId, sellerUserId: blockerUserId },
        ],
      },
      status: { in: ["PENDING", "FAILED"] },
      type: "LOI_UPDATE",
    },
    data: { lastError: "The participants are no longer eligible.", nextAttemptAt: null, status: "CANCELLED" },
  });
  return Number(result?.count ?? 0);
}
