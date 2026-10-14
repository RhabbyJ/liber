import { prisma } from "@liber/db";
import type { NotificationActivity, NotificationItem } from "../lib/notification-activity";
import { notificationTarget } from "../lib/notification-links";
import { hasRole, type SessionUser } from "./authz";

export type NotificationReadInput = { notificationId: string } | { all: true };

export const RECENT_NOTIFICATION_LIMIT = 5;
export const NOTIFICATION_FEED_LIMIT = 200;

const notificationSelect = {
  body: true,
  createdAt: true,
  id: true,
  metadata: true,
  readAt: true,
  title: true,
  type: true,
} as const;

type NotificationRow = {
  body: string;
  createdAt: Date;
  id: string;
  metadata: unknown;
  readAt: Date | null;
  title: string;
  type: string;
};

// Metadata stays on the server; only the derived in-app link is serialized.
export function toNotificationItem(row: NotificationRow): NotificationItem {
  const target = notificationTarget(row.type, row.metadata);
  return {
    actionLabel: target.label,
    body: row.body,
    createdAt: row.createdAt.toISOString(),
    href: target.href,
    id: row.id,
    read: row.readAt !== null,
    title: row.title,
    type: row.type,
  };
}

const recentQuery = (userId: string) => prisma.notification.findMany({
  where: { userId },
  orderBy: [{ createdAt: "desc" }, { id: "desc" }],
  take: RECENT_NOTIFICATION_LIMIT,
  select: notificationSelect,
});

// Only call with the active, database-controlled session resolved on the server.
export async function readNotificationActivity(user: SessionUser): Promise<NotificationActivity> {
  if (!hasRole(user, "BUYER")) {
    const [unreadCount, recent] = await prisma.$transaction([
      prisma.notification.count({ where: { userId: user.id, readAt: null } }),
      recentQuery(user.id),
    ], { isolationLevel: "RepeatableRead" });
    return { latestInvite: null, recent: recent.map(toNotificationItem), unreadCount };
  }
  // Keep the count, popup hint and list in one snapshot so an arriving invite cannot
  // advance the client's deduplication baseline while its unread count is stale.
  const [unreadCount, latestInvite, recent] = await prisma.$transaction([
    prisma.notification.count({ where: { userId: user.id, readAt: null } }),
    prisma.notification.findFirst({
      where: { userId: user.id, type: "invite_received" },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      select: { id: true, createdAt: true, readAt: true },
    }),
    recentQuery(user.id),
  ], { isolationLevel: "RepeatableRead" });
  return {
    unreadCount,
    latestInvite: latestInvite
      ? { id: latestInvite.id, createdAt: latestInvite.createdAt.toISOString(), read: latestInvite.readAt !== null }
      : null,
    recent: recent.map(toNotificationItem),
  };
}

/** The signed-in user's notification feed, newest first. */
export async function listNotificationItems(user: SessionUser): Promise<NotificationItem[]> {
  const rows = await prisma.notification.findMany({
    where: { userId: user.id },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: NOTIFICATION_FEED_LIMIT,
    select: notificationSelect,
  });
  return rows.map(toNotificationItem);
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
