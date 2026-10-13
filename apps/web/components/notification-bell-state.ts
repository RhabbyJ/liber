import type { NotificationActivity } from "../lib/notification-activity";

export type InviteActivityBaseline = {
  established: boolean;
  newestInviteAt: number;
  newestInviteId: string | null;
};

export function inviteActivityBaseline(activity: NotificationActivity | null): InviteActivityBaseline {
  return {
    established: activity !== null,
    newestInviteAt: activity?.latestInvite ? Date.parse(activity.latestInvite.createdAt) : 0,
    newestInviteId: activity?.latestInvite?.id ?? null,
  };
}

export function advanceInviteActivity(baseline: InviteActivityBaseline, activity: NotificationActivity) {
  const invite = activity.latestInvite;
  const createdAt = invite ? Date.parse(invite.createdAt) : 0;
  // Match the API's createdAt DESC, id DESC ordering, including timestamp ties.
  const isNewer = invite !== null && invite.id !== baseline.newestInviteId && (
    createdAt > baseline.newestInviteAt
    || (createdAt === baseline.newestInviteAt && baseline.newestInviteId !== null && invite.id > baseline.newestInviteId)
  );
  const arrived = baseline.established && isNewer && !invite.read && activity.unreadCount > 0;
  return {
    arrived,
    baseline: {
      established: true,
      newestInviteAt: Math.max(baseline.newestInviteAt, createdAt),
      newestInviteId: isNewer ? invite.id : baseline.newestInviteId,
    },
  };
}

export function isNotificationActivity(value: unknown): value is NotificationActivity {
  if (!value || typeof value !== "object") return false;
  const activity = value as Partial<NotificationActivity>;
  if (!Number.isSafeInteger(activity.unreadCount) || (activity.unreadCount ?? -1) < 0) return false;
  if (activity.latestInvite === null) return true;
  const invite = activity.latestInvite;
  return Boolean(invite && typeof invite.id === "string" && invite.id.length > 0
    && typeof invite.createdAt === "string" && Number.isFinite(Date.parse(invite.createdAt))
    && typeof invite.read === "boolean");
}
