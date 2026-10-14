"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useId, useRef, useState } from "react";
import type { NotificationActivity, NotificationItem } from "../lib/notification-activity";
import { markNotificationRead, NOTIFICATIONS_CHANGED_EVENT } from "../lib/notification-client";
import { relativeTime } from "../lib/notification-format";
import { notificationIcon } from "../lib/notification-links";
import { Icon } from "./icon";
import { createRecoveryPolling, MESSAGING_FALLBACK_POLL_MS } from "./messaging/recovery-polling";
import { advanceInviteActivity, inviteActivityBaseline, isNotificationActivity } from "./notification-bell-state";

export function NotificationBell({ initialActivity, href, isBuyer }: {
  initialActivity: NotificationActivity | null;
  href: string;
  isBuyer: boolean;
}) {
  const router = useRouter();
  const popoverId = useId();
  const titleId = useId();
  const [activity, setActivity] = useState(initialActivity);
  const [isOpen, setIsOpen] = useState(false);
  const [toastId, setToastId] = useState<string | null>(null);
  const [isMarking, setIsMarking] = useState(false);
  const [error, setError] = useState("");
  const [sessionEnded, setSessionEnded] = useState(false);
  const baselineRef = useRef(inviteActivityBaseline(initialActivity));
  const shellRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const firstLinkRef = useRef<HTMLAnchorElement>(null);
  const markReadButtonRef = useRef<HTMLButtonElement>(null);
  const markAllRef = useRef<(() => Promise<boolean>) | null>(null);

  useEffect(() => {
    let disposed = false;
    let stopped = false;
    let controller: AbortController | null = null;
    let inFlight: Promise<boolean> | null = null;

    async function request(markAll = false): Promise<boolean> {
      if (markAll && inFlight) await inFlight;
      if (disposed || stopped) return false;
      if (inFlight) return true;
      const requestController = new AbortController();
      controller = requestController;
      const signal = requestController.signal;
      const timeout = setTimeout(() => requestController.abort(), 10_000);
      const pending = (async () => {
        try {
          const response = await fetch("/api/notifications", {
            method: markAll ? "PATCH" : "GET",
            cache: "no-store",
            credentials: "same-origin",
            signal,
            ...(markAll ? { headers: { "Content-Type": "application/json" }, body: JSON.stringify({ all: true }) } : {}),
          });
          if (disposed || signal.aborted) return false;
          if (response.status === 401) {
            stopped = true;
            polling.dispose();
            setActivity(null);
            setToastId(null);
            setIsOpen(false);
            setSessionEnded(true);
            return false;
          }
          if (!response.ok) return false;
          const next: unknown = await response.json();
          if (disposed || signal.aborted || !isNotificationActivity(next)) return false;
          const transition = advanceInviteActivity(baselineRef.current, next);
          baselineRef.current = transition.baseline;
          setActivity(next);
          if (isBuyer && transition.arrived) setToastId(next.latestInvite!.id);
          if (next.unreadCount === 0) setToastId(null);
          else if (next.latestInvite?.read) setToastId((current) => current === next.latestInvite?.id ? null : current);
          return true;
        } catch {
          return false;
        }
      })();
      inFlight = pending;
      try {
        return await pending;
      } finally {
        clearTimeout(timeout);
        if (inFlight === pending) inFlight = null;
      }
    }

    const polling = createRecoveryPolling({
      canRefresh: () => !stopped && document.visibilityState === "visible" && navigator.onLine,
      intervalMs: () => MESSAGING_FALLBACK_POLL_MS,
      refresh: () => request(),
    });
    markAllRef.current = () => request(true);
    const recover = () => polling.recover();
    window.addEventListener("focus", recover);
    window.addEventListener("online", recover);
    window.addEventListener(NOTIFICATIONS_CHANGED_EVENT, recover);
    document.addEventListener("visibilitychange", recover);
    polling.recover();
    return () => {
      disposed = true;
      polling.dispose();
      controller?.abort();
      markAllRef.current = null;
      window.removeEventListener("focus", recover);
      window.removeEventListener("online", recover);
      window.removeEventListener(NOTIFICATIONS_CHANGED_EVENT, recover);
      document.removeEventListener("visibilitychange", recover);
    };
  }, [isBuyer]);

  useEffect(() => {
    if (!isOpen) return;
    firstLinkRef.current?.focus({ preventScroll: true });
    function closeOutside(event: PointerEvent) {
      if (event.target instanceof Node && !shellRef.current?.contains(event.target)) setIsOpen(false);
    }
    document.addEventListener("pointerdown", closeOutside);
    return () => document.removeEventListener("pointerdown", closeOutside);
  }, [isOpen]);

  async function markAllRead() {
    if (isMarking) return;
    const focusedButton = document.activeElement === markReadButtonRef.current ? markReadButtonRef.current : null;
    setIsMarking(true);
    setError("");
    const success = await markAllRef.current?.();
    setIsMarking(false);
    if (success) {
      if (focusedButton && (document.activeElement === focusedButton || document.activeElement === document.body)) {
        firstLinkRef.current?.focus({ preventScroll: true });
      }
      router.refresh();
    }
    else setError("Could not mark notifications as read. Try again.");
  }

  function dismissToast() {
    setToastId(null);
    triggerRef.current?.focus({ preventScroll: true });
  }

  function openNotification(item: NotificationItem) {
    setIsOpen(false);
    if (item.read) return;
    // Optimistic: the row and count update now; the next poll reconciles with the server.
    setActivity((current) => current && {
      ...current,
      recent: current.recent.map((entry) => entry.id === item.id ? { ...entry, read: true } : entry),
      unreadCount: Math.max(0, current.unreadCount - 1),
    });
    void markNotificationRead(item.id);
  }

  if (sessionEnded) return null;
  const unreadCount = activity?.unreadCount ?? 0;
  const recent = activity?.recent ?? [];
  const now = new Date();
  const label = unreadCount > 0 ? `Notifications, ${unreadCount} unread` : "Notifications";

  return (
    <div className="notification-shell" ref={shellRef} onBlur={(event) => {
      if (!(event.relatedTarget instanceof Node) || !event.currentTarget.contains(event.relatedTarget)) setIsOpen(false);
    }} onKeyDown={(event) => {
      if (event.key === "Escape" && isOpen) {
        event.preventDefault();
        setIsOpen(false);
        triggerRef.current?.focus({ preventScroll: true });
      }
    }}>
      <button aria-controls={popoverId} aria-expanded={isOpen} aria-haspopup="dialog" aria-label={label}
        className={`icon-button notification-button${unreadCount > 0 ? " has-unread" : ""}`}
        onClick={() => setIsOpen((current) => !current)} ref={triggerRef} type="button">
        <Icon name="bell" size={22} />
        {unreadCount > 0 && <span aria-hidden="true" className="notification-count">{unreadCount > 99 ? "99+" : unreadCount}</span>}
      </button>
      <div aria-labelledby={titleId} className="notification-popover" hidden={!isOpen} id={popoverId} role="dialog">
        <div className="notification-popover-head">
          <strong id={titleId}>Notifications</strong>
          {unreadCount > 0 && <button className="notification-mark-read" disabled={isMarking} onClick={() => void markAllRead()} ref={markReadButtonRef} type="button">
            {isMarking ? "Marking as read…" : "Mark all read"}
          </button>}
        </div>
        {recent.length ? (
          <ul className="notification-popover-list">
            {recent.map((item, index) => (
              <li key={item.id}>
                <Link className={`notification-popover-item${item.read ? "" : " unread"}`} href={item.href}
                  onClick={() => openNotification(item)} ref={index === 0 ? firstLinkRef : undefined}>
                  <span aria-hidden="true" className="notification-popover-icon">
                    <Icon name={notificationIcon(item.type)} size={18} />
                  </span>
                  <span className="notification-popover-text">
                    <strong>{item.title}</strong>
                    <span>{item.body}</span>
                    <small>
                      <time dateTime={item.createdAt} suppressHydrationWarning>{relativeTime(item.createdAt, now)}</time>
                      {item.read ? null : <span className="visually-hidden"> (unread)</span>}
                    </small>
                  </span>
                  {item.read ? null : <span aria-hidden="true" className="notification-dot" />}
                </Link>
              </li>
            ))}
          </ul>
        ) : (
          <p className="notification-popover-summary">
            <span aria-hidden="true" className="notification-summary-icon"><Icon name="check" size={18} /></span>
            You&apos;re all caught up.
          </p>
        )}
        <Link className="notification-popover-link" href={href} onClick={() => setIsOpen(false)} ref={recent.length ? undefined : firstLinkRef}>
          See all notifications <Icon name="chevron-right" size={18} />
        </Link>
        {error && <p className="notification-error" role="alert">{error}</p>}
      </div>
      {toastId && <div className="invite-arrival-toast" key={toastId} onKeyDown={(event) => {
        if (event.key === "Escape") {
          event.preventDefault();
          dismissToast();
        }
      }}>
        <span aria-hidden="true" className="invite-arrival-icon"><Icon name="mail" size={20} /></span>
        <div className="invite-arrival-body">
          <div aria-live="polite" aria-atomic="true" role="status">
            <strong>New property invitation</strong>
            <p>A seller invited you to view a property.</p>
          </div>
          <Link href="/buyer/invites" onClick={() => setToastId(null)}>View invites <Icon name="arrow-right" size={15} /></Link>
        </div>
        <button aria-label="Dismiss invitation notification" className="invite-arrival-close" onClick={dismissToast} type="button">×</button>
      </div>}
    </div>
  );
}
