"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { EmptyState } from "../empty-state";
import { Icon } from "../icon";
import {
  conversationPageSignature,
  mergeConversationSummaries,
  normalizeListPageInfo,
  normalizeConversationSummaries,
} from "./normalize";
import type { ConversationSummary, MessagingListPageInfo } from "./types";

const conversationDateFormatter = new Intl.DateTimeFormat("en", { dateStyle: "medium" });
const conversationTimeFormatter = new Intl.DateTimeFormat("en", { timeStyle: "short" });
const INBOX_REFRESH_TIMEOUT_MS = 15_000;

export function ConversationInbox({
  initialConversations,
  initialPageInfo,
}: {
  initialConversations: ConversationSummary[];
  initialPageInfo: MessagingListPageInfo;
}) {
  const [conversations, setConversations] = useState(initialConversations);
  const [pageInfo, setPageInfo] = useState(initialPageInfo);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const firstPageSignatureRef = useRef(conversationPageSignature(initialConversations, initialPageInfo));
  const requestInFlightRef = useRef<"load" | "refresh" | null>(null);
  const requestAbortRef = useRef<AbortController | null>(null);

  useEffect(() => () => {
    requestAbortRef.current?.abort();
  }, []);

  const refreshFirstPage = useCallback(async () => {
    if (requestInFlightRef.current) return;
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
      if (controller.signal.aborted || !response.ok) return;
      const refreshedPageInfo = normalizeListPageInfo(payload);
      if (refreshedPageInfo.hasMore && !refreshedPageInfo.nextCursor) return;
      const incoming = normalizeConversationSummaries(payload);
      const signature = conversationPageSignature(incoming, refreshedPageInfo);
      if (signature !== firstPageSignatureRef.current) {
        firstPageSignatureRef.current = signature;
        setConversations(incoming);
        setPageInfo(refreshedPageInfo);
      }
    } catch {
      // Polling is a recovery path; the next focus, online, or timer event retries.
    } finally {
      window.clearTimeout(timeout);
      if (requestAbortRef.current === controller) requestAbortRef.current = null;
      if (requestInFlightRef.current === "refresh") requestInFlightRef.current = null;
    }
  }, []);

  useEffect(() => {
    void refreshFirstPage();
    const recover = () => {
      if (document.visibilityState === "visible" && navigator.onLine) void refreshFirstPage();
    };
    const poll = window.setInterval(recover, 5_000);
    window.addEventListener("focus", recover);
    window.addEventListener("online", recover);
    document.addEventListener("visibilitychange", recover);
    return () => {
      window.clearInterval(poll);
      window.removeEventListener("focus", recover);
      window.removeEventListener("online", recover);
      document.removeEventListener("visibilitychange", recover);
    };
  }, [refreshFirstPage]);

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
      <EmptyState
        description="A conversation appears here after a valid property invite is sent to you or by you."
        icon="mail"
        title="No conversations yet"
      />
    );
  }

  return (
    <section aria-label="Conversations" className="stack tight">
      <div className="message-inbox-list">
        {conversations.map((conversation) => (
          <Link className="message-inbox-item" href={`/messages/${conversation.id}`} key={conversation.id}>
            <span className="message-inbox-icon" aria-hidden="true">
              <Icon name="message" size={19} />
            </span>
            <span className="message-inbox-main">
              <span className="message-inbox-heading">
                <strong>{conversation.counterpartLabel}</strong>
                <time dateTime={conversation.lastMessageAt || undefined} suppressHydrationWarning>
                  {formatConversationTime(conversation.lastMessageAt)}
                </time>
              </span>
              <span className="message-inbox-property">{conversation.propertyTitle}</span>
              <span className="message-inbox-preview">
                {conversation.lastMessage?.body || statusDescription(conversation.status)}
              </span>
            </span>
            <span className="message-inbox-meta">
              {conversation.unreadCount > 0 ? (
                <span aria-label={`${conversation.unreadCount} unread messages`} className="message-unread-count">
                  {conversation.unreadCount > 99 ? "99+" : conversation.unreadCount}
                </span>
              ) : null}
              {conversation.muted ? <span className="muted small">Muted</span> : null}
              <Icon name="chevron-right" size={16} />
            </span>
          </Link>
        ))}
      </div>
      {error ? <p className="auth-alert error" role="alert">{error}</p> : null}
      <p aria-live="polite" className="visually-hidden">{notice}</p>
      {pageInfo.hasMore && pageInfo.nextCursor ? (
        <div className="message-inbox-pagination">
          <button className="button secondary" disabled={loading} onClick={() => void loadMore()} type="button">
            {loading ? "Loading…" : "Load older conversations"}
          </button>
        </div>
      ) : null}
    </section>
  );
}

function formatConversationTime(value: string) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return isToday(date) ? conversationTimeFormatter.format(date) : conversationDateFormatter.format(date);
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
