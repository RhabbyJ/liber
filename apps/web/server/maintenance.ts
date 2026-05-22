export const INVITE_EXPIRATION_DAYS = 30;

export function inviteExpiresAt(from = new Date()) {
  return new Date(from.getTime() + INVITE_EXPIRATION_DAYS * 86_400_000);
}

export async function expireMarketplaceState(now = new Date()) {
  const { prisma } = await import("@liber/db");

  const [badges, invites] = await prisma.$transaction([
    prisma.buyerBadge.updateMany({
      where: {
        expiresAt: { lt: now },
        status: { in: ["ACTIVE", "PENDING"] },
      },
      data: { status: "EXPIRED" },
    }),
    prisma.invite.updateMany({
      where: {
        expiresAt: { lt: now },
        status: { in: ["SENT", "VIEWED"] },
      },
      data: { status: "EXPIRED" },
    }),
  ]);

  return {
    badgesExpired: badges.count,
    invitesExpired: invites.count,
  };
}
