/** One notification as the browser sees it: display text plus a server-derived in-app link. */
export type NotificationItem = {
  actionLabel: string;
  body: string;
  createdAt: string;
  href: string;
  id: string;
  read: boolean;
  title: string;
  type: string;
};

export type NotificationActivity = {
  unreadCount: number;
  latestInvite: {
    id: string;
    createdAt: string;
    read: boolean;
  } | null;
  /** Newest notifications for the header dropdown. */
  recent: NotificationItem[];
};

/** Only same-site paths are ever followed from a notification. */
export function isInternalPath(value: unknown): value is string {
  return typeof value === "string" && value.startsWith("/") && !value.startsWith("//") && !value.includes("\\");
}
