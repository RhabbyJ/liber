"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { EmptyState } from "../empty-state";
import { GeneratedAvatar } from "../generated-avatar";
import { Icon } from "../icon";
import {
  conversationPageSignature,
  mergeConversationSummaries,
  normalizeListPageInfo,
  normalizeConversationSummaries,
} from "./normalize";
import type { ConversationSummary, MessagingListPageInfo } from "./types";
import { createRecoveryPolling, MESSAGING_FALLBACK_POLL_MS } from "./recovery-polling";
import { CONVERSATION_READ_EVENT, type ConversationReadDetail } from "./unread-conversations";
import { isElementRendered } from "../element-visibility";

const conversationDateFormatter = new Intl.DateTimeFormat("en", { dateStyle: "medium" });
const conversationMonthDayFormatter = new Intl.DateTimeFormat("en", { day: "numeric", month: "short" });
const conversationTimeFormatter = new Intl.DateTimeFormat("en", { timeStyle: "short" });
const INBOX_REFRESH_TIMEOUT_MS = 15_000;

export function ConversationInbox({
  activeId,
  initialConversations,
  initialPageInfo,
}: {
  /** The conversation open beside the list, highlighted like a desktop messenger. */
  activeId?: string;
  initialConversations: ConversationSummary[];
  initialPageInfo: MessagingListPageInfo;
}) {
  const [conversations, setConversations] = useState(initialConversations);
  const [pageInfo, setPageInfo] = useState(initialPageInfo);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<"all" | "unread" | "active">("all");
  const firstPageSignatureRef = useRef(conversationPageSignature(initialConversations, initialPageInfo));
  const requestInFlightRef = useRef<"load" | "refresh" | null>(null);
  const requestAbortRef = useRef<AbortController | null>(null);
  // Both render branches return the same root <section>, so this node is stable.
  const rootRef = useRef<HTMLElement | null>(null);

  useEffect(() => () => {
    requestAbortRef.current?.abort();
  }, []);

  const refreshFirstPage = useCallback(async () => {
    if (requestInFlightRef.current) return true;
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), INBOX_REFRESH_TIMEOUT_MS);
    requestAbortRef.current = controller;
    requestInFlightRef.current = "refresh";
    try {
      const response = await fetch("/api/conversations", {
        cache: "no-store",
        signal: controller.signal,
      });
      const payload = await response.json().catch(() => null) as unknown;
      if (controller.signal.aborted || !response.ok) return false;
      const refreshedPageInfo = normalizeListPageInfo(payload);
      if (refreshedPageInfo.hasMore && !refreshedPageInfo.nextCursor) return false;
      const incoming = normalizeConversationSummaries(payload);
      const signature = conversationPageSignature(incoming, refreshedPageInfo);
      if (signature !== firstPageSignatureRef.current) {
        firstPageSignatureRef.current = signature;
        setConversations(incoming);
        setPageInfo(refreshedPageInfo);
      }
      return true;
    } catch {
      // Polling is a recovery path; the next focus, online, or timer event retries.
      return false;
    } finally {
      window.clearTimeout(timeout);
      if (requestAbortRef.current === controller) requestAbortRef.current = null;
      if (requestInFlightRef.current === "refresh") requestInFlightRef.current = null;
    }
  }, []);

  useEffect(() => {
    // Phones hide this sidebar beside an open thread (display: none below 900px);
    // a hidden list makes no requests and catches up as soon as it shows again.
    const isShown = () => isElementRendered(rootRef.current);
    const poll = createRecoveryPolling({
      canRefresh: () => document.visibilityState === "visible" && navigator.onLine && isShown(),
      intervalMs: () => MESSAGING_FALLBACK_POLL_MS,
      refresh: refreshFirstPage,
    });
    const recover = () => poll.recover();
    recover();
    window.addEventListener("focus", recover);
    window.addEventListener("online", recover);
    document.addEventListener("visibilitychange", recover);
    let shown = isShown();
    const resize = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(() => {
      const nowShown = isShown();
      if (nowShown && !shown) recover();
      shown = nowShown;
    });
    if (rootRef.current) resize?.observe(rootRef.current);
    return () => {
      poll.dispose();
      resize?.disconnect();
      window.removeEventListener("focus", recover);
      window.removeEventListener("online", recover);
      document.removeEventListener("visibilitychange", recover);
    };
  }, [refreshFirstPage]);

  // The open thread just advanced its read marker; clear that row now and let
  // the next canonical refresh confirm it.
  useEffect(() => {
    function clearReadConversation(event: Event) {
      const conversationId = (event as CustomEvent<ConversationReadDetail>).detail?.conversationId;
      if (!conversationId) return;
      setConversations((current) => current.some((item) => item.id === conversationId && item.unreadCount > 0)
        ? current.map((item) => item.id === conversationId ? { ...item, unreadCount: 0 } : item)
        : current);
    }
    window.addEventListener(CONVERSATION_READ_EVENT, clearReadConversation);
    return () => window.removeEventListener(CONVERSATION_READ_EVENT, clearReadConversation);
  }, []);

  async function loadMore() {
    if (!pageInfo.nextCursor || requestInFlightRef.current) return;
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), INBOX_REFRESH_TIMEOUT_MS);
    requestAbortRef.current = controller;
    requestInFlightRef.current = "load";
    setLoading(true);
    setError("");
    setNotice("");
    try {
      const response = await fetch(
        `/api/conversations?cursor=${encodeURIComponent(pageInfo.nextCursor)}`,
        { cache: "no-store", signal: controller.signal },
      );
      const payload = await response.json().catch(() => null) as unknown;
      if (controller.signal.aborted) return;
      if (!response.ok) throw new Error("Conversation page request failed.");
      const nextPageInfo = normalizeListPageInfo(payload);
      if (nextPageInfo.hasMore && !nextPageInfo.nextCursor) {
        throw new Error("Conversation page response is incomplete.");
      }
      const incoming = normalizeConversationSummaries(payload);
      setConversations((current) => mergeConversationSummaries(
        current,
        incoming,
      ));
      setPageInfo(nextPageInfo);
      setNotice(`${incoming.length} older conversation${incoming.length === 1 ? "" : "s"} loaded.`);
    } catch (requestError) {
      if (!(requestError instanceof Error && requestError.name === "AbortError")) {
        setError("Older conversations could not be loaded. Try again.");
      }
    } finally {
      window.clearTimeout(timeout);
      if (requestAbortRef.current === controller) requestAbortRef.current = null;
      if (requestInFlightRef.current === "load") requestInFlightRef.current = null;
      setLoading(false);
    }
  }

  if (conversations.length === 0) {
    return (
      <section aria-label="Conversations" className="messenger-inbox empty" ref={rootRef}>
        <EmptyState
          description="A conversation appears here after a valid property invite is sent to you or by you."
          icon="mail"
          title="No conversations yet"
        />
      </section>
    );
  }

  const query = search.trim().toLocaleLowerCase();
  const visibleConversations = conversations.filter((conversation) => {
    if (filter === "unread" && conversation.unreadCount === 0) return false;
    if (filter === "active" && conversation.status !== "ACTIVE") return false;
    return !query || [conversation.counterpartLabel, conversation.propertyTitle, conversation.lastMessage?.body ?? ""]
      .some((value) => value.toLocaleLowerCase().includes(query));
  });
  const unreadConversations = conversations.filter((conversation) => conversation.unreadCount > 0).length;

  return (
    <section aria-label="Conversations" className="messenger-inbox" ref={rootRef}>
      <div className="messenger-inbox-tools">
        <label className="messenger-search">
          <Icon aria-hidden="true" name="search" size={20} />
          <span className="visually-hidden">Search loaded conversations</span>
          <input onChange={(event) => setSearch(event.target.value)} placeholder="Search conversations" type="search" value={search} />
        </label>
        <div aria-label="Filter conversations" className="messenger-filters" role="group">
          <button aria-pressed={filter === "all"} onClick={() => setFilter("all")} type="button">All</button>
          <button aria-pressed={filter === "unread"} onClick={() => setFilter("unread")} type="button">
            Unread {unreadConversations > 0 ? <span className="messenger-filter-count">{unreadConversations}</span> : null}
          </button>
          <button aria-pressed={filter === "active"} onClick={() => setFilter("active")} type="button">Active</button>
        </div>
      </div>
      <p aria-live="polite" className="visually-hidden">
        {visibleConversations.length} of {conversations.length} loaded conversations shown.
      </p>
      <div className="message-inbox-list">
        {visibleConversations.map((conversation) => (
          <Link
            aria-current={conversation.id === activeId ? "page" : undefined}
            className={`message-inbox-item${conversation.unreadCount > 0 ? " unread" : ""}${conversation.id === activeId ? " active" : ""}`}
            href={`/messages/${conversation.id}`}
            key={conversation.id}
          >
            {conversation.counterpartAvatarVariant ? (
              <GeneratedAvatar
                className="message-inbox-avatar"
                decorative
                name={conversation.counterpartLabel}
                seed={conversation.counterpartLabel}
                variant={conversation.counterpartAvatarVariant}
              />
            ) : (
              <span className="message-inbox-icon" aria-hidden="true">
                <Icon name="home" size={20} />
              </span>
            )}
            <span className="message-inbox-main">
              <span className="message-inbox-heading">
                <strong>{conversation.counterpartLabel}</strong>
                <time dateTime={conversation.lastMessageAt || undefined} suppressHydrationWarning>
                  {formatConversationTime(conversation.lastMessageAt)}
                </time>
              </span>
              <span className="message-inbox-context">
                <span className="message-inbox-property">{conversation.propertyTitle}</span>
                {conversation.status !== "ACTIVE" ? (
                  <span className={`message-inbox-state ${statusClassName(conversation.status)}`}> · {statusLabel(conversation.status)}</span>
                ) : null}
              </span>
              <span className="message-inbox-snippet">
                <span className="message-inbox-preview">
                  {conversation.lastMessage ? (
                    <>{conversation.lastMessage.isOwn ? "You: " : ""}{conversation.lastMessage.body}</>
                  ) : statusDescription(conversation.status)}
                </span>
                <span className="message-inbox-meta">
                  {conversation.muted ? <span aria-label="Muted" className="message-inbox-muted" role="img"><Icon aria-hidden="true" name="bell" size={14} /></span> : null}
                  {conversation.unreadCount > 0 ? (
                    <span aria-label={`${conversation.unreadCount} unread messages`} className="message-unread-count">
                      {conversation.unreadCount > 99 ? "99+" : conversation.unreadCount}
                    </span>
                  ) : null}
                </span>
              </span>
            </span>
          </Link>
        ))}
        {visibleConversations.length === 0 ? (
          <div className="messenger-no-results">
            <Icon aria-hidden="true" name="search" size={40} />
            <h2>No matching conversations</h2>
            <p>Try a different search or filter.</p>
            <button className="button secondary" onClick={() => { setSearch(""); setFilter("all"); }} type="button">Show all conversations</button>
          </div>
        ) : null}
      </div>
      {error ? (
        <div className="inline-alert danger messenger-inbox-alert" role="alert">
          <Icon aria-hidden="true" name="info" size={20} />
          <p>{error}</p>
        </div>
      ) : null}
      <p aria-live="polite" className="visually-hidden">{notice}</p>
      {pageInfo.hasMore && pageInfo.nextCursor ? (
        <div className="message-inbox-pagination">
          <button className="button secondary" disabled={loading} onClick={() => void loadMore()} type="button">
            {loading ? "Loading…" : "Load older conversations"}
          </button>
          <p className="fine-print">Search and filters apply to loaded conversations.</p>
        </div>
      ) : null}
    </section>
  );
}

function formatConversationTime(value: string) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  if (isToday(date)) return conversationTimeFormatter.format(date);
  return date.getFullYear() === new Date().getFullYear()
    ? conversationMonthDayFormatter.format(date)
    : conversationDateFormatter.format(date);
}

function isToday(date: Date) {
  const now = new Date();
  return date.getFullYear() === now.getFullYear()
    && date.getMonth() === now.getMonth()
    && date.getDate() === now.getDate();
}

function statusDescription(status: ConversationSummary["status"]) {
  if (status === "AWAITING_BUYER") return "Waiting for the buyer to respond";
  if (status === "BLOCKED") return "Conversation unavailable";
  if (status === "READ_ONLY") return "Conversation closed";
  return "Open conversation";
}

function statusLabel(status: ConversationSummary["status"]) {
  if (status === "AWAITING_BUYER") return "Waiting for reply";
  if (status === "BLOCKED") return "Unavailable";
  if (status === "READ_ONLY") return "Closed";
  return "Active";
}

function statusClassName(status: ConversationSummary["status"]) {
  if (status === "AWAITING_BUYER") return "waiting";
  if (status === "BLOCKED") return "unavailable";
  if (status === "READ_ONLY") return "closed";
  return "active";
}
