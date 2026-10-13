import { prisma } from "@liber/db";
import type { NotificationActivity } from "../lib/notification-activity";
import { hasRole, type SessionUser } from "./authz";

export type NotificationReadInput = { notificationId: string } | { all: true };

// Only call with the active, database-controlled session resolved on the server.
export async function readNotificationActivity(user: SessionUser): Promise<NotificationActivity> {
  if (!hasRole(user, "BUYER")) {
    return {
      unreadCount: await prisma.notification.count({ where: { userId: user.id, readAt: null } }),
      latestInvite: null,
    };
  }
  // Keep the count and popup hint in one snapshot so an arriving invite cannot
  // advance the client's deduplication baseline while its unread count is stale.
  const [unreadCount, latestInvite] = await prisma.$transaction([
    prisma.notification.count({ where: { userId: user.id, readAt: null } }),
    prisma.notification.findFirst({
      where: { userId: user.id, type: "invite_received" },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      select: { id: true, createdAt: true, readAt: true },
    }),
  ], { isolationLevel: "RepeatableRead" });
  return {
    unreadCount,
    latestInvite: latestInvite
      ? { id: latestInvite.id, createdAt: latestInvite.createdAt.toISOString(), read: latestInvite.readAt !== null }
      : null,
  };
}

export async function markNotificationsRead(user: SessionUser, input: NotificationReadInput) {
  // updateMany deliberately makes unknown, already-read, and non-owned IDs indistinguishable.
  await prisma.notification.updateMany({
    where: {
      userId: user.id,
      readAt: null,
      ...("notificationId" in input ? { id: input.notificationId } : {}),
    },
    data: { readAt: new Date() },
  });
  return readNotificationActivity(user);
}
