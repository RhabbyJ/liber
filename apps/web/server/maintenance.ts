export const INVITE_RESPONSE_WINDOW_MS = 48 * 60 * 60 * 1000;
export const MAINTENANCE_BATCH_SIZE = 25;
export const OUTBOX_PII_RETENTION_MS = 30 * 24 * 60 * 60 * 1000;
export const RATE_LIMIT_PRUNE_BATCH_SIZE = 1_000;
// Matches app_private.expire_operational_rows(): legacy buckets stay a day past expiry.
const LEGACY_RATE_LIMIT_RETENTION_MS = 24 * 60 * 60 * 1000;
type LoiFreezeReason = "INVITE_NO_LONGER_ELIGIBLE" | "PARTICIPANT_INACTIVE" | "PARTICIPANTS_BLOCKED" | "PROPERTY_IDENTITY_CHANGED" | "PROPERTY_NO_LONGER_ELIGIBLE" | "SELLER_ACCESS_LOST";

export function inviteExpiresAt(from = new Date()) {
  return new Date(from.getTime() + INVITE_RESPONSE_WINDOW_MS);
}

export async function expireMarketplaceState(now = new Date()) {
  const { prisma } = await import("@liber/db");

  return prisma.$transaction(async (tx) => {
    // Notify only transitions owned by this transaction; concurrent workers skip its locks.
    const expiredBadges = await tx.$queryRaw<Array<{ badgeType: string; userId: string; id: string }>>`
      WITH candidates AS (
        SELECT badge.id FROM public."BuyerBadge" badge
        WHERE badge."expiresAt" <= ${now} AND badge.status IN ('ACTIVE', 'PENDING')
        ORDER BY badge."expiresAt", badge.id
        LIMIT ${MAINTENANCE_BATCH_SIZE}
        FOR UPDATE OF badge SKIP LOCKED
      ), expired AS (
        UPDATE public."BuyerBadge" badge SET status = 'EXPIRED', "updatedAt" = ${now}
        FROM candidates WHERE badge.id = candidates.id
        RETURNING badge.id, badge."badgeType", badge."buyerProfileId"
      )
      SELECT expired.id, expired."badgeType", buyer."userId"
      FROM expired JOIN public."BuyerProfile" buyer ON buyer.id = expired."buyerProfileId"
    `;
    const expiredInvites = await tx.$queryRaw<Array<{
      buyerProfileId: string; userId: string; id: string; propertyId: string; sellerId: string; title: string;
    }>>`
      WITH candidates AS (
        SELECT invite.id FROM public."Invite" invite
        WHERE invite."expiresAt" <= ${now} AND invite.status IN ('SENT', 'VIEWED')
        ORDER BY invite."expiresAt", invite.id
        LIMIT ${MAINTENANCE_BATCH_SIZE}
        FOR UPDATE OF invite SKIP LOCKED
      ), expired AS (
        UPDATE public."Invite" invite SET status = 'EXPIRED', "updatedAt" = ${now}
        FROM candidates WHERE invite.id = candidates.id
        RETURNING invite.id, invite."buyerProfileId", invite."propertyId", invite."sellerId", invite.title
      )
      SELECT expired.*, buyer."userId"
      FROM expired JOIN public."BuyerProfile" buyer ON buyer.id = expired."buyerProfileId"
    `;
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
      LIMIT ${MAINTENANCE_BATCH_SIZE}
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
      LIMIT ${MAINTENANCE_BATCH_SIZE}
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
          userId: badge.userId,
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
            userId: invite.userId,
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

    // Finished jobs keep recipient address, subject, and payload for 30 days after
    // delivery (SENT) or their last transition (CANCELLED, FAILED). Delivery
    // re-derives recipients from relational IDs, so a late retry still works.
    const minimizedOutbox = await tx.$queryRaw<Array<{ id: string }>>`
      WITH candidates AS (
        SELECT job.id FROM public."EmailOutbox" job
        WHERE job.status IN ('SENT', 'CANCELLED', 'FAILED')
          AND coalesce(job."sentAt", job."updatedAt") < ${new Date(now.getTime() - OUTBOX_PII_RETENTION_MS)}
          AND (job.payload <> '{}'::jsonb OR job.subject IS NOT NULL OR job."to" <> 'redacted')
        ORDER BY coalesce(job."sentAt", job."updatedAt"), job.id
        LIMIT ${MAINTENANCE_BATCH_SIZE}
        FOR UPDATE OF job SKIP LOCKED
      )
      UPDATE public."EmailOutbox" job
      SET payload = '{}'::jsonb, subject = NULL, "to" = 'redacted', "updatedAt" = ${now}
      FROM candidates WHERE job.id = candidates.id
      RETURNING job.id
    `;

    return {
      badgesExpired: expiredBadges.length,
      invitesExpired: expiredInvites.length,
      loiNegotiationsExpired: expiredLoi.length,
      loiNegotiationsFrozen: frozenLoi.length,
      outboxPayloadsMinimized: minimizedOutbox.length,
      hasMore: [expiredBadges, expiredInvites, expiredLoi, frozenLoi, minimizedOutbox]
        .some((rows) => rows.length === MAINTENANCE_BATCH_SIZE),
    };
  }, { maxWait: 5_000, timeout: 15_000 });
}

// Deletes only expired rate-limit buckets, never business rows. This does not
// call app_private.expire_operational_rows(), which also rewrites upload
// session state that the upload cleanup worker owns.
export async function pruneExpiredRateLimitBuckets(now = new Date()) {
  const { prisma } = await import("@liber/db");
  // Prisma sends Dates as UTC wall-clock text; anchor it to UTC for timestamptz.
  const [shared] = await prisma.$queryRaw<Array<{ deleted: number }>>`
    SELECT app_private.prune_rate_limit_buckets(
      ${now}::timestamp AT TIME ZONE 'UTC',
      ${RATE_LIMIT_PRUNE_BATCH_SIZE}::integer
    ) AS deleted
  `;
  const [legacy] = await prisma.$queryRaw<Array<{ deleted: number }>>`
    WITH expired AS (
      SELECT bucket.key FROM public."RateLimitBucket" bucket
      WHERE bucket."expiresAt" < ${new Date(now.getTime() - LEGACY_RATE_LIMIT_RETENTION_MS)}
      ORDER BY bucket."expiresAt"
      LIMIT ${RATE_LIMIT_PRUNE_BATCH_SIZE}
      FOR UPDATE SKIP LOCKED
    ), deleted AS (
      DELETE FROM public."RateLimitBucket" bucket
      USING expired WHERE bucket.key = expired.key
      RETURNING 1
    )
    SELECT count(*)::integer AS deleted FROM deleted
  `;
  const sharedBucketsPruned = Number(shared?.deleted ?? 0);
  const legacyBucketsPruned = Number(legacy?.deleted ?? 0);
  return {
    hasMore: sharedBucketsPruned === RATE_LIMIT_PRUNE_BATCH_SIZE || legacyBucketsPruned === RATE_LIMIT_PRUNE_BATCH_SIZE,
    legacyBucketsPruned,
    sharedBucketsPruned,
  };
}
