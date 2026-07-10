export const INVITE_EXPIRATION_DAYS = 30;

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

    return {
      badgesExpired: badges.count,
      invitesExpired: invites.count,
    };
  });
}
