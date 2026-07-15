"use client";

import Link from "next/link";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type FormEvent,
  type KeyboardEvent,
  type ReactNode,
} from "react";
import { Icon } from "../icon";
import { PrivatePropertyImages } from "../private-property-images";
import {
  mergeCanonicalConversationState,
  messagePageMetadata,
  normalizeConversationThread,
  normalizedMessageLength,
  normalizeMessagePage,
} from "./normalize";
import { getMessagingBrowserClient, logMessagingRealtimeJoinStatus } from "./realtime";
import {
  formatMessagingDateTime,
  MESSAGE_REPORT_CATEGORIES,
  type ConversationThread,
  type MessagingMessage,
  type MessagingTemplateOption,
} from "./types";

const MESSAGING_REQUEST_TIMEOUT_MS = 15_000;

export function MessageThread({
  initialThread,
  templates,
}: {
  initialThread: ConversationThread;
  templates: MessagingTemplateOption[];
}) {
  const [thread, setThread] = useState(initialThread);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [mutationPending, setMutationPending] = useState(false);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [dialogError, setDialogError] = useState("");
  const [isOnline, setIsOnline] = useState(true);
  const [blockOpen, setBlockOpen] = useState(false);
  const [reportTarget, setReportTarget] = useState<MessagingMessage | null>(null);
  const [readRetry, setReadRetry] = useState(0);
  const olderMessagesAbortRef = useRef<AbortController | null>(null);
  const refreshAbortRef = useRef<AbortController | null>(null);
  const refreshInFlightRef = useRef(false);
  const readRetryTimerRef = useRef<number | null>(null);
  const sendInFlightRef = useRef(false);
  const mutationInFlightRef = useRef(false);
  const olderMessagesInFlightRef = useRef(false);
  const pendingMessageRef = useRef<{ id: string; signature: string } | null>(null);
  const readMessageIdRef = useRef<string | null>(null);
  const newestMessageIdRef = useRef(initialThread.messages.at(-1)?.id ?? null);
  const returnFocusRef = useRef<HTMLElement | null>(null);
  const fallbackFocusRef = useRef<HTMLAnchorElement | null>(null);
  const threadRef = useRef(initialThread);
  threadRef.current = thread;
  const conversationId = thread.id;
  const conversationPath = `/api/conversations/${encodeURIComponent(conversationId)}`;

  const refreshThread = useCallback(async (announceFailure = false) => {
    if (refreshInFlightRef.current) return;
    refreshInFlightRef.current = true;
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), MESSAGING_REQUEST_TIMEOUT_MS);
    refreshAbortRef.current = controller;
    try {
      const cachedThread = threadRef.current;
      let after = newestMessageIdRef.current;
      const canonicalPayload = await requestJson(conversationPath, {
        cache: "no-store",
        signal: controller.signal,
      });
      const canonical = normalizeConversationThread(canonicalPayload);
      if (!canonical) throw new Error("Conversation response is invalid.");
      if (canonical.id !== conversationId) throw new Error("Conversation response identity mismatch.");
      const moderationChanged = canonical.moderationRevision !== cachedThread.moderationRevision;
      if (moderationChanged) olderMessagesAbortRef.current?.abort();
      setThread((current) => moderationChanged
        ? canonical
        : mergeCanonicalConversationState(current, canonical));
      const canonicalNewestId = canonical.messages.at(-1)?.id ?? null;
      if (!after) {
        newestMessageIdRef.current = canonicalNewestId;
        if (announceFailure) setError("");
        return;
      }
      if (canonical.messages.some((message) => message.id === after)) {
        newestMessageIdRef.current = canonicalNewestId ?? after;
        if (announceFailure) setError("");
        return;
      }
      let keepFetching = true;
      while (keepFetching) {
        const requestAfter = after;
        const suffix = requestAfter ? `?after=${encodeURIComponent(requestAfter)}` : "";
        const payload = await requestJson(`${conversationPath}/messages${suffix}`, {
          cache: "no-store",
          signal: controller.signal,
        });
        const metadata = messagePageMetadata(payload);
        setThread((current) => {
          const refreshed = normalizeMessagePage(payload, current);
          return requestAfter ? { ...refreshed, pageInfo: current.pageInfo } : refreshed;
        });
        const nextAfter = metadata.newestMessageId;
        if (metadata.hasMore && (!nextAfter || nextAfter === after)) {
          throw new Error("Message catch-up response is incomplete.");
        }
        keepFetching = Boolean(after && metadata.hasMore && nextAfter && nextAfter !== after);
        if (nextAfter) {
          after = nextAfter;
          newestMessageIdRef.current = nextAfter;
        }
      }
      if (announceFailure) setError("");
    } catch (requestError) {
      if (isAbortError(requestError)) return;
      if (announceFailure) setError("Messages could not be refreshed. Check your connection and try again.");
    } finally {
      window.clearTimeout(timeout);
      if (refreshAbortRef.current === controller) refreshAbortRef.current = null;
      refreshInFlightRef.current = false;
    }
  }, [conversationId, conversationPath]);

  useEffect(() => {
    void refreshThread(false);
    return () => {
      olderMessagesAbortRef.current?.abort();
      refreshAbortRef.current?.abort();
    };
  }, [refreshThread]);

  useEffect(() => {
    const poll = window.setInterval(() => {
      if (document.visibilityState === "visible" && navigator.onLine) void refreshThread(false);
    }, 5_000);
    const recover = () => {
      if (document.visibilityState !== "visible" || !navigator.onLine) return;
      setReadRetry((value) => value + 1);
      void refreshThread(false);
    };
    const handleFocus = () => {
      setIsOnline(navigator.onLine);
      recover();
    };
    const handleOnline = () => {
      setIsOnline(true);
      recover();
    };
    const handleOffline = () => setIsOnline(false);
    const handleVisibilityChange = () => recover();
    setIsOnline(navigator.onLine);
    window.addEventListener("focus", handleFocus);
    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);
    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => {
      window.clearInterval(poll);
      window.removeEventListener("focus", handleFocus);
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [refreshThread]);

  useEffect(() => () => {
    if (readRetryTimerRef.current !== null) window.clearTimeout(readRetryTimerRef.current);
  }, []);

  useEffect(() => {
    const client = getMessagingBrowserClient();
    if (!client) return;
    let channel: ReturnType<typeof client.channel> | null = null;
    let cancelled = false;

    void (async () => {
      await client.realtime.setAuth();
      if (cancelled) return;
      channel = client
        .channel(`conversation:${thread.id}`, { config: { private: true } })
        .on("broadcast", { event: "message_changed" }, () => {
          void refreshThread(false);
        })
        .subscribe((status: string) => {
          if (status === "SUBSCRIBED") void refreshThread(false);
          else logMessagingRealtimeJoinStatus(status);
        });
    })().catch(() => {
      logMessagingRealtimeJoinStatus("AUTH_ERROR");
    });

    return () => {
      cancelled = true;
      if (channel) void client.removeChannel(channel);
    };
  }, [refreshThread, thread.id]);

  const newestMessage = thread.messages.at(-1);
  useEffect(() => {
    if (!newestMessage) return;
    if (!isOnline) return;
    if (document.visibilityState !== "visible") return;
    if (readMessageIdRef.current === newestMessage.id) return;
    readMessageIdRef.current = newestMessage.id;
    void requestJson(`${conversationPath}/read`, {
      body: JSON.stringify({ lastReadMessageId: newestMessage.id }),
      headers: { "Content-Type": "application/json" },
      method: "POST",
    }).catch(() => {
      if (readMessageIdRef.current === newestMessage.id) readMessageIdRef.current = null;
      if (readRetryTimerRef.current !== null) window.clearTimeout(readRetryTimerRef.current);
      readRetryTimerRef.current = window.setTimeout(() => {
        readRetryTimerRef.current = null;
        setReadRetry((value) => value + 1);
      }, 5_000);
    });
  }, [conversationPath, isOnline, newestMessage, readRetry]);

  const canSend = thread.canSend && (thread.status === "ACTIVE" || thread.status === "AWAITING_BUYER");
  const canSendFreeText = canSend && (thread.status === "ACTIVE" || thread.viewerRole === "BUYER");
  const draftLength = normalizedMessageLength(draft);

  async function sendMessage(input: {
    body?: string;
    kind: "FREE_TEXT" | "GUIDED";
    templateKey?: string;
    templateVersion?: number;
  }) {
    if (sendInFlightRef.current) return;
    const body = input.body?.trim() ?? "";
    if (input.kind === "FREE_TEXT" && !body) return;
    if (input.kind === "FREE_TEXT" && normalizedMessageLength(body) > 2_000) {
      setError("Messages can contain up to 2,000 characters.");
      return;
    }
    if (input.kind === "GUIDED" && (!input.templateKey || !input.templateVersion)) return;
    if (!isOnline) {
      setError("You are offline. Your message is still here so you can send it after reconnecting.");
      return;
    }
    const signature = input.kind === "GUIDED"
      ? `${input.kind}:${input.templateKey}:${input.templateVersion}`
      : `${input.kind}:${body}`;
    const existing = pendingMessageRef.current;
    const clientMessageId = existing?.signature === signature ? existing.id : createClientMessageId();
    pendingMessageRef.current = { id: clientMessageId, signature };
    sendInFlightRef.current = true;
    setSending(true);
    setError("");
    setNotice("");
    try {
      await requestJson(`${conversationPath}/messages`, {
        body: JSON.stringify(input.kind === "GUIDED"
          ? {
              clientMessageId,
              kind: "GUIDED",
              templateKey: input.templateKey,
              templateVersion: input.templateVersion,
            }
          : { body, clientMessageId, kind: "FREE_TEXT" }),
        headers: { "Content-Type": "application/json" },
        method: "POST",
      });
      pendingMessageRef.current = null;
      if (input.kind === "FREE_TEXT") setDraft("");
      setNotice("Message sent.");
      await refreshThread(true);
    } catch (requestError) {
      setError(errorMessage(requestError, "Your message was not sent. Your text is still here so you can try again."));
    } finally {
      sendInFlightRef.current = false;
      setSending(false);
    }
  }

  async function loadOlderMessages() {
    if (!thread.pageInfo.nextCursor || olderMessagesInFlightRef.current) return;
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), MESSAGING_REQUEST_TIMEOUT_MS);
    const moderationRevision = threadRef.current.moderationRevision;
    olderMessagesAbortRef.current = controller;
    olderMessagesInFlightRef.current = true;
    setLoadingOlder(true);
    setError("");
    try {
      const payload = await requestJson(
        `${conversationPath}/messages?cursor=${encodeURIComponent(thread.pageInfo.nextCursor)}`,
        { cache: "no-store", signal: controller.signal },
      );
      setThread((current) => {
        if (current.moderationRevision !== moderationRevision) return current;
        return normalizeMessagePage(payload, current);
      });
    } catch (requestError) {
      if (!isAbortError(requestError)) {
        setError(errorMessage(requestError, "Older messages could not be loaded."));
      }
    } finally {
      window.clearTimeout(timeout);
      if (olderMessagesAbortRef.current === controller) olderMessagesAbortRef.current = null;
      olderMessagesInFlightRef.current = false;
      setLoadingOlder(false);
    }
  }

  async function updateMute() {
    if (mutationInFlightRef.current) return;
    const muted = !thread.muted;
    mutationInFlightRef.current = true;
    setMutationPending(true);
    setError("");
    try {
      await requestJson(`${conversationPath}/mute`, {
        body: JSON.stringify({ muted }),
        headers: { "Content-Type": "application/json" },
        method: "POST",
      });
      setThread((current) => ({ ...current, muted }));
      setNotice(muted ? "Conversation muted." : "Conversation unmuted.");
    } catch (requestError) {
      setError(errorMessage(requestError, "Mute preference could not be changed."));
    } finally {
      mutationInFlightRef.current = false;
      setMutationPending(false);
    }
  }

  async function blockParticipant() {
    if (mutationInFlightRef.current) return;
    mutationInFlightRef.current = true;
    setMutationPending(true);
    setError("");
    setDialogError("");
    try {
      await requestJson(`${conversationPath}/block`, {
        body: JSON.stringify({}),
        headers: { "Content-Type": "application/json" },
        method: "POST",
      });
      setThread((current) => ({ ...current, canSend: false, status: "BLOCKED" }));
      closeDialog(() => setBlockOpen(false));
      setNotice("The conversation is now unavailable.");
      await refreshThread(false);
    } catch (requestError) {
      setDialogError(errorMessage(requestError, "The participant could not be blocked."));
    } finally {
      mutationInFlightRef.current = false;
      setMutationPending(false);
    }
  }

  async function reportMessage(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!reportTarget) return;
    const data = new FormData(event.currentTarget);
    const category = data.get("category");
    const details = data.get("details");
    const block = data.get("block") === "true";
    if (typeof category !== "string") return;
    if (mutationInFlightRef.current) return;
    mutationInFlightRef.current = true;
    setMutationPending(true);
    setError("");
    setDialogError("");
    try {
      await requestJson(`/api/messages/${encodeURIComponent(reportTarget.id)}/report`, {
        body: JSON.stringify({
          block,
          category,
          ...(typeof details === "string" && details.trim() ? { details: details.trim() } : {}),
        }),
        headers: { "Content-Type": "application/json" },
        method: "POST",
      });
      if (block) setThread((current) => ({ ...current, canSend: false, status: "BLOCKED" }));
      closeDialog(() => setReportTarget(null));
      setNotice(block ? "Report received. The conversation is now unavailable." : "Report received for review.");
      await refreshThread(false);
    } catch (requestError) {
      setDialogError(errorMessage(requestError, "The report could not be submitted."));
    } finally {
      mutationInFlightRef.current = false;
      setMutationPending(false);
    }
  }

  function openDialog(open: () => void) {
    returnFocusRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    setDialogError("");
    open();
  }

  function closeDialog(close: () => void) {
    setDialogError("");
    close();
    window.requestAnimationFrame(() => {
      const returnTarget = returnFocusRef.current;
      if (returnTarget?.isConnected && !returnTarget.matches(":disabled")) returnTarget.focus();
      else fallbackFocusRef.current?.focus();
    });
  }

  return (
    <div className="page wide message-thread-page">
      <header className="message-thread-header">
        <div className="stack tight">
          <Link className="link-button" href="/messages" ref={fallbackFocusRef}>
            <Icon name="arrow-left" size={14} />
            All conversations
          </Link>
          <div>
            <p className="eyebrow">Invite conversation</p>
            <h1>{thread.counterpartLabel}</h1>
          </div>
          <p className="muted">{thread.propertySnapshot.title}</p>
        </div>
        <div className="message-thread-actions">
          <button className="button secondary sm" disabled={mutationPending} onClick={updateMute} type="button">
            {thread.muted ? "Unmute" : "Mute"}
          </button>
          <button
            className="button warning sm"
            disabled={mutationPending || thread.status === "BLOCKED"}
            onClick={() => openDialog(() => setBlockOpen(true))}
            type="button"
          >
            Block
          </button>
        </div>
      </header>

      <div aria-atomic="true" aria-live="polite" className="message-live-region">
        {error ? <p className="auth-alert error" role="alert">{error}</p> : null}
        {!isOnline ? (
          <p className="auth-alert info" role="status">
            You are offline. Your draft stays here, and sending will resume after you reconnect.
          </p>
        ) : null}
        {notice ? <p className="visually-hidden">{notice}</p> : null}
      </div>

      <div className="message-thread-layout">
        <section aria-label="Conversation" className="message-thread-panel">
          {thread.pageInfo.hasMore ? (
            <div className="message-load-older">
              <button className="button secondary sm" disabled={loadingOlder} onClick={loadOlderMessages} type="button">
                {loadingOlder ? "Loading…" : "Load older messages"}
              </button>
            </div>
          ) : null}

          <ol aria-live="polite" aria-relevant="additions text" className="message-list" role="log">
            {thread.messages.length === 0 ? (
              <li className="message-empty">No messages to show yet.</li>
            ) : thread.messages.map((message) => (
              <li className={`message-row${message.isOwn ? " own" : ""}${message.kind === "SYSTEM" ? " system" : ""}`} key={message.id}>
                <article className="message-bubble">
                  <div className="message-meta">
                    <strong>{message.senderLabel}</strong>
                    <time dateTime={message.createdAt || undefined} suppressHydrationWarning>
                      {formatMessagingDateTime(message.createdAt)}
                    </time>
                  </div>
                  <p className={message.redacted ? "muted" : undefined}>{message.body}</p>
                  {!message.isOwn && message.kind !== "SYSTEM" && !message.redacted ? (
                    <button
                      className="message-report-button"
                      onClick={() => openDialog(() => setReportTarget(message))}
                      type="button"
                    >
                      Report message
                    </button>
                  ) : null}
                </article>
              </li>
            ))}
          </ol>

          <section aria-label="Message composer" className="message-composer">
            {canSend ? (
              <>
                <div className="message-guided-options">
                  <h2>Quick messages</h2>
                  <div className="message-template-list">
                    {templates.map((template) => (
                      <button
                        className="message-template-button"
                        disabled={sending || !isOnline}
                        key={template.key}
                        onClick={() => void sendMessage({
                          kind: "GUIDED",
                          templateKey: template.key,
                          templateVersion: template.version,
                        })}
                        title={template.text}
                        type="button"
                      >
                        <strong>{template.label}</strong>
                        <span>{template.text}</span>
                      </button>
                    ))}
                  </div>
                </div>
                {canSendFreeText ? (
                  <form className="message-free-form" onSubmit={(event) => {
                    event.preventDefault();
                    void sendMessage({ body: draft, kind: "FREE_TEXT" });
                  }}>
                    <label htmlFor="message-draft">Write a plain-text message</label>
                    <textarea
                      aria-describedby="message-draft-count"
                      disabled={sending || !isOnline}
                      id="message-draft"
                      maxLength={4_000}
                      name="message"
                      onChange={(event) => setDraft(event.target.value)}
                      onKeyDown={(event) => submitOnEnter(event)}
                      placeholder="Ask about the property or viewing logistics"
                      rows={4}
                      value={draft}
                    />
                    <div className="message-composer-footer">
                      <span
                        className={`field-hint message-character-count${draftLength > 2_000 ? " invalid" : ""}`}
                        id="message-draft-count"
                      >
                        {draftLength.toLocaleString()} / 2,000
                      </span>
                      <button
                        className="button primary"
                        disabled={sending || !isOnline || !draft.trim() || draftLength > 2_000}
                        type="submit"
                      >
                        <Icon name="message" size={14} />
                        {sending ? "Sending…" : "Send"}
                      </button>
                    </div>
                  </form>
                ) : (
                  <p className="muted small">Before the buyer replies, the seller follow-up is limited to one guided message.</p>
                )}
              </>
            ) : (
              <div className="message-read-only" role="status">
                <Icon name="lock" size={18} />
                <div>
                  <strong>{composerUnavailableTitle(thread)}</strong>
                  <p suppressHydrationWarning>{composerUnavailableDescription(thread)}</p>
                </div>
              </div>
            )}
            <p className="message-safety-copy">
              <Icon name="shield" size={16} />
              <span>{thread.safetyNotice}</span>
            </p>
          </section>
        </section>

        <aside className="message-context-panel" aria-label="Conversation context">
          <section className="card stack tight">
            <div className="section-head compact">
              <div>
                <p className="eyebrow seller">Private property</p>
                <h2>{thread.propertySnapshot.title}</h2>
              </div>
              <span className="status-dot info">{thread.inviteStatus}</span>
            </div>
            {thread.propertySnapshot.location ? (
              <p className="muted small"><Icon name="map-pin" size={13} /> {thread.propertySnapshot.location}</p>
            ) : null}
            {thread.propertySnapshot.ownershipStatus ? (
              <span className="status-dot active">{thread.propertySnapshot.ownershipStatus}</span>
            ) : null}
            <PrivatePropertyImages imageIds={thread.propertySnapshot.imageIds} />
            {!thread.propertySnapshot.identityCurrent ? (
              <div className="auth-alert info">
                This thread preserves the property identity shared with the invite. A newer property version is not shown here.
              </div>
            ) : null}
          </section>
          <section className="card flat stack tight">
            <p className="eyebrow">Manual invite</p>
            <p className="muted small">
              This conversation does not create an offer, contract, escrow instruction, or payment request.
            </p>
          </section>
        </aside>
      </div>

      {blockOpen ? (
        <MessagingDialog
          busy={mutationPending}
          title="Block this participant?"
          onClose={() => closeDialog(() => setBlockOpen(false))}
        >
          <p>Blocking is permanent in Messaging V1. Neither participant will be able to send messages, and future invites between you will be unavailable.</p>
          {dialogError ? <p className="auth-alert error" role="alert">{dialogError}</p> : null}
          <div className="actions right">
            <button className="button secondary" disabled={mutationPending} onClick={() => closeDialog(() => setBlockOpen(false))} type="button">Cancel</button>
            <button className="button warning" disabled={mutationPending} onClick={() => void blockParticipant()} type="button">
              {mutationPending ? "Blocking…" : "Block participant"}
            </button>
          </div>
        </MessagingDialog>
      ) : null}

      {reportTarget ? (
        <MessagingDialog
          busy={mutationPending}
          title="Report this message"
          onClose={() => closeDialog(() => setReportTarget(null))}
        >
          <form className="stack" onSubmit={reportMessage}>
            <div className="message-report-preview">
              <span className="muted small">Message from {reportTarget.senderLabel}</span>
              <p>{reportTarget.body}</p>
            </div>
            <div className="field">
              <label htmlFor="report-category">Reason</label>
              <select
                defaultValue={MESSAGE_REPORT_CATEGORIES[0].value}
                disabled={mutationPending}
                id="report-category"
                name="category"
                required
              >
                {MESSAGE_REPORT_CATEGORIES.map((category) => (
                  <option key={category.value} value={category.value}>{category.label}</option>
                ))}
              </select>
            </div>
            <div className="field">
              <label htmlFor="report-details">Additional context (optional)</label>
              <textarea disabled={mutationPending} id="report-details" maxLength={1_000} name="details" rows={4} />
            </div>
            <label className="checkbox-row">
              <input disabled={mutationPending} name="block" type="checkbox" value="true" />
              <span>Block this participant too (permanent)</span>
            </label>
            {dialogError ? <p className="auth-alert error" role="alert">{dialogError}</p> : null}
            <div className="actions right">
              <button className="button secondary" disabled={mutationPending} onClick={() => closeDialog(() => setReportTarget(null))} type="button">Cancel</button>
              <button className="button warning" disabled={mutationPending} type="submit">
                {mutationPending ? "Submitting…" : "Submit report"}
              </button>
            </div>
          </form>
        </MessagingDialog>
      ) : null}
    </div>
  );
}

function MessagingDialog({
  busy = false,
  children,
  onClose,
  title,
}: {
  busy?: boolean;
  children: ReactNode;
  onClose: () => void;
  title: string;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const titleId = `message-dialog-${title.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`;

  useEffect(() => {
    const dialog = dialogRef.current;
    if (dialog && !dialog.open) dialog.showModal();
  }, []);

  return (
    <dialog aria-busy={busy} aria-labelledby={titleId} className="message-dialog" onCancel={(event) => {
      event.preventDefault();
      if (!busy) onClose();
    }} ref={dialogRef}>
      <div className="message-dialog-content stack">
        <div className="section-head compact">
          <h2 id={titleId}>{title}</h2>
          <button
            aria-label="Close dialog"
            className="message-dialog-close"
            disabled={busy}
            onClick={onClose}
            type="button"
          >
            ×
          </button>
        </div>
        {children}
      </div>
    </dialog>
  );
}

async function requestJson(url: string, init?: RequestInit) {
  const controller = new AbortController();
  const sourceSignal = init?.signal;
  const abortFromSource = () => controller.abort();
  if (sourceSignal?.aborted) controller.abort();
  else sourceSignal?.addEventListener("abort", abortFromSource, { once: true });
  const timeout = window.setTimeout(() => controller.abort(), MESSAGING_REQUEST_TIMEOUT_MS);
  try {
    const response = await fetch(url, { ...init, signal: controller.signal });
    const payload = await response.json().catch(() => null) as unknown;
    if (!response.ok) throw new MessagingRequestError(response.status);
    return payload;
  } finally {
    window.clearTimeout(timeout);
    sourceSignal?.removeEventListener("abort", abortFromSource);
  }
}

function errorMessage(error: unknown, fallback: string) {
  if (error instanceof MessagingRequestError && error.status === 429) {
    return "Please wait a moment before trying again.";
  }
  if (error instanceof MessagingRequestError && (error.status === 404 || error.status === 409)) {
    return "This conversation is unavailable.";
  }
  return fallback;
}

function isAbortError(error: unknown) {
  return error instanceof Error && error.name === "AbortError";
}

function createClientMessageId() {
  if (typeof crypto.randomUUID === "function") return crypto.randomUUID();
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const value = [...bytes].map((byte) => byte.toString(16).padStart(2, "0")).join("");
  return `${value.slice(0, 8)}-${value.slice(8, 12)}-${value.slice(12, 16)}-${value.slice(16, 20)}-${value.slice(20)}`;
}

class MessagingRequestError extends Error {
  constructor(readonly status: number) {
    super("Messaging request failed.");
  }
}

function composerUnavailableTitle(thread: ConversationThread) {
  if (thread.status === "BLOCKED") return "Conversation unavailable";
  if (thread.status === "AWAITING_BUYER") return "Waiting for the buyer";
  return "Conversation is read-only";
}

function composerUnavailableDescription(thread: ConversationThread) {
  if (thread.status === "BLOCKED") return "Messaging is no longer available in this conversation.";
  if (thread.status === "AWAITING_BUYER") {
    if (thread.sellerFollowUpAvailableAt) {
      return `A single guided follow-up becomes available ${formatMessagingDateTime(thread.sellerFollowUpAvailableAt)}.`;
    }
    return "No additional seller message is available unless the buyer replies.";
  }
  return "The invite, property, or participant is no longer eligible for new messages. History remains available.";
}

function submitOnEnter(event: KeyboardEvent<HTMLTextAreaElement>) {
  if (event.key !== "Enter" || event.shiftKey || event.nativeEvent.isComposing) return;
  event.preventDefault();
  event.currentTarget.form?.requestSubmit();
}
