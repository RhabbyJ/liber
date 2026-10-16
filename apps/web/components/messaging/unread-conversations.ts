// Browser-side unread-conversation count for the Messages nav item. The header
// bell's existing poll publishes it; no other request reads it.
import { useSyncExternalStore } from "react";
import { NOTIFICATIONS_CHANGED_EVENT } from "../../lib/notification-client";

/** Fired after this browser advances a conversation's read marker. */
export const CONVERSATION_READ_EVENT = "liber:conversation-read";

export type ConversationReadDetail = { conversationId: string };

let unreadConversationCount: number | null = null;
const listeners = new Set<() => void>();

/** null hides the badge (messaging off, signed out, or the count is unavailable). */
export function publishUnreadConversationCount(count: number | null) {
  if (count === unreadConversationCount) return;
  unreadConversationCount = count;
  for (const listener of listeners) listener();
}

export function subscribeUnreadConversationCount(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function currentUnreadConversationCount() {
  return unreadConversationCount;
}

/** Server render and hydration see no badge; the client store fills it in. */
export function useUnreadConversationCount() {
  return useSyncExternalStore(subscribeUnreadConversationCount, currentUnreadConversationCount, () => null);
}

/**
 * Reads `unreadConversationCount` from a notifications response: undefined when
 * the payload has no valid count (keep the current badge), null when the server
 * reports messaging as off or unavailable.
 */
export function unreadConversationCountFrom(payload: unknown): number | null | undefined {
  if (!payload || typeof payload !== "object" || !("unreadConversationCount" in payload)) return undefined;
  const value = (payload as { unreadConversationCount: unknown }).unreadConversationCount;
  if (value === null) return null;
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0 ? value : undefined;
}

export function unreadConversationBadgeText(count: number) {
  return count > 99 ? "99+" : String(count);
}

/** Lets the inbox clear the row and the header re-poll the canonical count at once. */
export function announceConversationRead(conversationId: string) {
  window.dispatchEvent(new CustomEvent<ConversationReadDetail>(CONVERSATION_READ_EVENT, { detail: { conversationId } }));
  window.dispatchEvent(new Event(NOTIFICATIONS_CHANGED_EVENT));
}
