export type NotificationActivity = {
  unreadCount: number;
  latestInvite: {
    id: string;
    createdAt: string;
    read: boolean;
  } | null;
};
