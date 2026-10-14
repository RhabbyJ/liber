// Browser-side read receipts for the signed-in user's own notifications.
// keepalive lets the request finish while the click navigates away.

/** Fired after a successful read so the header bell refreshes its count right away. */
export const NOTIFICATIONS_CHANGED_EVENT = "liber:notifications-changed";

export function markNotificationRead(notificationId: string) {
  return sendRead({ notificationId });
}

export function markAllNotificationsRead() {
  return sendRead({ all: true });
}

async function sendRead(body: { all: true } | { notificationId: string }) {
  try {
    const response = await fetch("/api/notifications", {
      body: JSON.stringify(body),
      cache: "no-store",
      credentials: "same-origin",
      headers: { "Content-Type": "application/json" },
      keepalive: true,
      method: "PATCH",
    });
    if (response.ok) window.dispatchEvent(new Event(NOTIFICATIONS_CHANGED_EVENT));
    return response.ok;
  } catch {
    return false;
  }
}
