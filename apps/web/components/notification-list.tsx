"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import type { NotificationItem } from "../lib/notification-activity";
import { markAllNotificationsRead, markNotificationRead } from "../lib/notification-client";
import { relativeTime } from "../lib/notification-format";
import { notificationIcon } from "../lib/notification-links";
import { Icon } from "./icon";

/**
 * Zillow-style notification centre: every row opens where the notification points and is
 * marked read on the way; All/Unread tabs and Mark all as read sit above the feed.
 */
export function NotificationList({ items, now }: { items: NotificationItem[]; now: string }) {
  const router = useRouter();
  const [filter, setFilter] = useState<"all" | "unread">("all");
  const [readIds, setReadIds] = useState<Set<string>>(() => new Set());
  const [markingAll, setMarkingAll] = useState(false);
  const [error, setError] = useState("");
  const renderedAt = useMemo(() => new Date(now), [now]);

  const isRead = (item: NotificationItem) => item.read || readIds.has(item.id);
  const unread = items.filter((item) => !isRead(item));
  const visible = filter === "unread" ? unread : items;

  function open(item: NotificationItem) {
    if (isRead(item)) return;
    setReadIds((current) => new Set(current).add(item.id));
    void markNotificationRead(item.id);
  }

  async function markAll() {
    setMarkingAll(true);
    setError("");
    const ok = await markAllNotificationsRead();
    setMarkingAll(false);
    if (!ok) {
      setError("Could not mark notifications as read. Try again.");
      return;
    }
    setReadIds(new Set(items.map((item) => item.id)));
    router.refresh();
  }

  return (
    <section aria-label="Notifications" className="notification-center">
      <div className="notification-center-bar">
        <div aria-label="Show notifications" className="segmented-control notification-filter" role="group">
          <button aria-pressed={filter === "all"} className={filter === "all" ? "selected" : undefined} onClick={() => setFilter("all")} type="button">
            All
          </button>
          <button aria-pressed={filter === "unread"} className={filter === "unread" ? "selected" : undefined} onClick={() => setFilter("unread")} type="button">
            Unread{unread.length ? ` (${unread.length})` : ""}
          </button>
        </div>
        {unread.length ? (
          <button className="text-link notification-mark-all" disabled={markingAll} onClick={() => void markAll()} type="button">
            {markingAll ? "Marking as read…" : "Mark all as read"}
          </button>
        ) : null}
      </div>
      {error ? <p className="field-error" role="alert">{error}</p> : null}

      {visible.length === 0 ? (
        <div className="notification-empty">
          <span aria-hidden="true" className="notification-row-icon"><Icon name="check" size={20} /></span>
          <p><strong>You’re all caught up.</strong> New updates about invites, LOIs and verification appear here.</p>
        </div>
      ) : (
        <ul className="notification-list">
          {visible.map((item) => {
            const read = isRead(item);
            return (
              <li key={item.id}>
                <Link className={`notification-row${read ? "" : " unread"}`} href={item.href} onClick={() => open(item)}>
                  <span aria-hidden="true" className="notification-row-icon">
                    <Icon name={notificationIcon(item.type)} size={20} />
                  </span>
                  <span className="notification-row-text">
                    <strong>{item.title}</strong>
                    <span className="notification-row-body">{item.body}</span>
                    <small>
                      <time dateTime={item.createdAt}>{relativeTime(item.createdAt, renderedAt)}</time>
                      <span aria-hidden="true"> · </span>
                      <span className="notification-row-action">{item.actionLabel}</span>
                      {read ? null : <span className="visually-hidden"> (unread)</span>}
                    </small>
                  </span>
                  {read ? <Icon className="notification-row-chevron" name="chevron-right" size={20} /> : <span aria-hidden="true" className="notification-dot" />}
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
