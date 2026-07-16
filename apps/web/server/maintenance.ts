export const INVITE_EXPIRATION_DAYS = 30;
type LoiFreezeReason = "INVITE_NO_LONGER_ELIGIBLE" | "PARTICIPANT_INACTIVE" | "PARTICIPANTS_BLOCKED" | "PROPERTY_IDENTITY_CHANGED" | "PROPERTY_NO_LONGER_ELIGIBLE" | "SELLER_ACCESS_LOST";

export function inviteExpiresAt(from = new Date()) {
  return new Date(from.getTime() + INVITE_EXPIRATION_DAYS * 86_400_000);
}

export async function expireMarketplaceState(now = new Date()) {
  const { prisma } = await import("@liber/db");

  return prisma.$transaction(async (tx) => {
    const [expiredBadges, expiredInvites] = await Promise.all([
      tx.buyerBadge.findMany({
        where: {
          expiresAt: { lte: now },
          status: { in: ["ACTIVE", "PENDING"] },
        },
        select: {
          badgeType: true,
          buyerProfile: { select: { userId: true } },
          id: true,
        },
      }),
      tx.invite.findMany({
        where: {
          expiresAt: { lte: now },
          status: { in: ["SENT", "VIEWED"] },
        },
        select: {
          buyerProfile: { select: { userId: true } },
          buyerProfileId: true,
          id: true,
          propertyId: true,
          sellerId: true,
          title: true,
        },
      }),
    ]);

    const badges = await tx.buyerBadge.updateMany({
      where: {
        expiresAt: { lte: now },
        status: { in: ["ACTIVE", "PENDING"] },
      },
      data: { status: "EXPIRED" },
    });
    const invites = await tx.invite.updateMany({
      where: {
        expiresAt: { lte: now },
        status: { in: ["SENT", "VIEWED"] },
      },
      data: { status: "EXPIRED" },
    });
    const expiredLoi = await tx.$queryRaw<Array<{ buyerUserId: string; currentRevisionId: string; id: string; sellerUserId: string }>>`
      SELECT negotiation.id,
        negotiation."buyerUserId" AS "buyerUserId",
        negotiation."sellerUserId" AS "sellerUserId",
        negotiation."currentRevisionId" AS "currentRevisionId"
      FROM public."LoiNegotiation" negotiation
      JOIN public."LoiRevision" revision ON revision.id = negotiation."currentRevisionId"
      WHERE negotiation.status IN (
          'AWAITING_BUYER_RESPONSE'::public."LoiNegotiationStatus",
          'AWAITING_SELLER_RESPONSE'::public."LoiNegotiationStatus"
        )
        AND revision."responseDeadline" <= ${now}
      ORDER BY negotiation.id
      FOR UPDATE OF negotiation SKIP LOCKED
    `;
    for (const negotiation of expiredLoi) {
      await tx.loiNegotiation.update({
        where: { id: negotiation.id },
        data: { closedAt: now, closedReason: "RESPONSE_EXPIRED", status: "EXPIRED" },
      });
      await tx.loiEvent.create({
        data: {
          clientActionId: crypto.randomUUID(),
          metadata: {},
          negotiationId: negotiation.id,
          revisionId: negotiation.currentRevisionId,
          type: "EXPIRED",
        },
      });
      await tx.loiDraft.deleteMany({ where: { negotiationId: negotiation.id } });
      await tx.notification.createMany({
        data: [negotiation.buyerUserId, negotiation.sellerUserId].map((userId) => ({
          body: "The current LOI response period expired.",
          metadata: { negotiationId: negotiation.id },
          title: "LOI expired",
          type: "LOI_EXPIRED",
          userId,
        })),
      });
      await tx.emailOutbox.updateMany({
        where: { loiNegotiationId: negotiation.id, status: { in: ["PENDING", "FAILED"] }, type: "LOI_UPDATE" },
        data: { lastError: "The LOI response period expired.", nextAttemptAt: null, status: "CANCELLED" },
      });
    }
    const frozenLoi = (await tx.$queryRaw<Array<{ closedReason: LoiFreezeReason; currentRevisionId: string | null; id: string }>>`
      SELECT negotiation.id,
        negotiation."currentRevisionId" AS "currentRevisionId",
        CASE
          WHEN EXISTS (SELECT 1 FROM public."UserBlock" block WHERE (block."blockerUserId" = negotiation."buyerUserId" AND block."blockedUserId" = negotiation."sellerUserId") OR (block."blockerUserId" = negotiation."sellerUserId" AND block."blockedUserId" = negotiation."buyerUserId")) THEN 'PARTICIPANTS_BLOCKED'
          WHEN buyer_user.status <> 'ACTIVE' OR seller_user.status <> 'ACTIVE' OR buyer."visibilityStatus" <> 'ACTIVE' OR NOT ('BUYER' = ANY(buyer_user.roles)) OR NOT ('SELLER' = ANY(seller_user.roles)) THEN 'PARTICIPANT_INACTIVE'
          WHEN seller_access.status IS DISTINCT FROM 'APPROVED' THEN 'SELLER_ACCESS_LOST'
          WHEN invite."propertyIdentityVersion" <> property."identityVersion" OR negotiation."propertyIdentityVersion" <> property."identityVersion" THEN 'PROPERTY_IDENTITY_CHANGED'
          WHEN property.status <> 'READY_FOR_INVITES' OR property."ownershipVerificationStatus" <> 'APPROVED' OR property."flaggedForReviewAt" IS NOT NULL OR property."ownerUserId" <> negotiation."sellerUserId" OR property."authorityAttestedIdentityVersion" IS DISTINCT FROM property."identityVersion" THEN 'PROPERTY_NO_LONGER_ELIGIBLE'
          ELSE 'INVITE_NO_LONGER_ELIGIBLE'
        END AS "closedReason"
      FROM public."LoiNegotiation" negotiation
      JOIN public."Invite" invite ON invite.id = negotiation."inviteId"
      JOIN public."Conversation" conversation ON conversation.id = negotiation."conversationId"
      JOIN public."BuyerProfile" buyer ON buyer.id = invite."buyerProfileId"
      JOIN public."User" buyer_user ON buyer_user.id = negotiation."buyerUserId"
      JOIN public."User" seller_user ON seller_user.id = negotiation."sellerUserId"
      JOIN public."SellerProperty" property ON property.id = negotiation."propertyId"
      LEFT JOIN public."SellerAccess" seller_access ON seller_access."userId" = negotiation."sellerUserId"
      WHERE negotiation.status IN ('AWAITING_BUYER_SUBMISSION', 'AWAITING_BUYER_RESPONSE', 'AWAITING_SELLER_RESPONSE')
        AND (
          invite.status <> 'ACCEPTED' OR conversation.status <> 'ACTIVE'
          OR buyer."userId" <> negotiation."buyerUserId"
          OR buyer_user.status <> 'ACTIVE' OR seller_user.status <> 'ACTIVE'
          OR buyer."visibilityStatus" <> 'ACTIVE' OR NOT ('BUYER' = ANY(buyer_user.roles)) OR NOT ('SELLER' = ANY(seller_user.roles))
          OR seller_access.status IS DISTINCT FROM 'APPROVED'
          OR invite."propertyIdentityVersion" <> property."identityVersion" OR negotiation."propertyIdentityVersion" <> property."identityVersion"
          OR property.status <> 'READY_FOR_INVITES' OR property."ownershipVerificationStatus" <> 'APPROVED'
          OR property."flaggedForReviewAt" IS NOT NULL OR property."ownerUserId" <> negotiation."sellerUserId"
          OR property."authorityAttestedIdentityVersion" IS DISTINCT FROM property."identityVersion"
          OR EXISTS (SELECT 1 FROM public."UserBlock" block WHERE (block."blockerUserId" = negotiation."buyerUserId" AND block."blockedUserId" = negotiation."sellerUserId") OR (block."blockerUserId" = negotiation."sellerUserId" AND block."blockedUserId" = negotiation."buyerUserId"))
        )
      ORDER BY negotiation.id
      FOR UPDATE OF negotiation SKIP LOCKED
    `) ?? [];
    for (const negotiation of frozenLoi) {
      await tx.loiNegotiation.update({ where: { id: negotiation.id }, data: { closedAt: now, closedReason: negotiation.closedReason, status: "READ_ONLY" } });
      await tx.loiEvent.create({ data: { clientActionId: crypto.randomUUID(), metadata: { closedReason: negotiation.closedReason }, negotiationId: negotiation.id, revisionId: negotiation.currentRevisionId ?? undefined, type: "FROZEN" } });
      await tx.loiDraft.deleteMany({ where: { negotiationId: negotiation.id } });
      await tx.emailOutbox.updateMany({ where: { loiNegotiationId: negotiation.id, status: { in: ["PENDING", "FAILED"] }, type: "LOI_UPDATE" }, data: { lastError: "The negotiation is no longer eligible.", nextAttemptAt: null, status: "CANCELLED" } });
    }

    if (expiredBadges.length > 0) {
      await tx.notification.createMany({
        data: expiredBadges.map((badge) => ({
          body: "An admin-verified trust badge expired and no longer affects seller search.",
          metadata: { badgeId: badge.id, badgeType: badge.badgeType },
          title: "Trust badge expired",
          type: "badge_expired",
          userId: badge.buyerProfile.userId,
        })),
      });
      await tx.adminAuditLog.create({
        data: {
          action: "expire_badges",
          actorUserId: null,
          metadata: { badgeIds: expiredBadges.map((badge) => badge.id), count: expiredBadges.length },
          targetId: "maintenance",
          targetType: "system",
        },
      });
    }

    if (expiredInvites.length > 0) {
      await tx.notification.createMany({
        data: expiredInvites.flatMap((invite) => [
          {
            body: "A seller invite expired without a response.",
            metadata: { inviteId: invite.id, propertyId: invite.propertyId },
            title: invite.title,
            type: "invite_expired",
            userId: invite.buyerProfile.userId,
          },
          {
            body: "Your manual buyer invite expired without a response.",
            metadata: {
              buyerProfileId: invite.buyerProfileId,
              inviteId: invite.id,
              propertyId: invite.propertyId,
            },
            title: invite.title,
            type: "invite_expired",
            userId: invite.sellerId,
          },
        ]),
      });
      await tx.adminAuditLog.create({
        data: {
          action: "expire_invites",
          actorUserId: null,
          metadata: { count: expiredInvites.length, inviteIds: expiredInvites.map((invite) => invite.id) },
          targetId: "maintenance",
          targetType: "system",
        },
      });
    }

    const minimizedOutbox = await tx.emailOutbox.updateMany({
      where: { status: "SENT", sentAt: { lt: new Date(now.getTime() - 30 * 86_400_000) } },
      data: { payload: {}, subject: null, to: "redacted" },
    });

    return {
      badgesExpired: badges.count,
      invitesExpired: invites.count,
      loiNegotiationsExpired: expiredLoi.length,
      loiNegotiationsFrozen: frozenLoi.length,
      outboxPayloadsMinimized: minimizedOutbox.count,
    };
  });
}
