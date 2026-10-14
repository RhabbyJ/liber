"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Fragment,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
  type KeyboardEvent,
  type ReactNode,
} from "react";
import { GeneratedAvatar } from "../generated-avatar";
import { Icon } from "../icon";
import { PropertyCoverPhoto } from "../property-cover-photo";
import { ChatLoiAction } from "./chat-loi-action";
import { TourScheduler } from "./tour-scheduler";
import { PrivatePropertyImages } from "../private-property-images";
import {
  applySentMessageResponse,
  mergeCanonicalConversationState,
  mergeSentMessage,
  messagePageMetadata,
  normalizeConversationThread,
  normalizedMessageLength,
  normalizeMessagePage,
} from "./normalize";
import { getMessagingBrowserClient, logMessagingRealtimeJoinStatus } from "./realtime";
import { createRefreshCoordinator } from "./refresh-coordinator";
import { createRecoveryPolling, MESSAGING_CONNECTED_POLL_MS, MESSAGING_FALLBACK_POLL_MS } from "./recovery-polling";
import {
  normalizeMessagingLoiSummary,
  type MessagingLoiSummary,
} from "../../lib/messaging-loi-summary";
import {
  MESSAGE_REPORT_CATEGORIES,
  type ConversationThread,
  type MessagingMessage,
  type MessagingTemplateOption,
} from "./types";

const MESSAGING_REQUEST_TIMEOUT_MS = 15_000;
const LOI_SUMMARY_REQUEST_TIMEOUT_MS = 5_000;

export function MessageThread({
  counterpartAvatarVariant,
  initialLoi,
  initialThread,
  templates,
}: {
  /** From the authorized inbox row; the thread payload carries no avatar. */
  counterpartAvatarVariant?: string | null;
  initialLoi: MessagingLoiSummary;
  initialThread: ConversationThread;
  templates: MessagingTemplateOption[];
}) {
  const router = useRouter();
  const [loi, setLoi] = useState(initialLoi);
  const [thread, setThread] = useState(initialThread);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [mutationPending, setMutationPending] = useState(false);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [composerError, setComposerError] = useState("");
  const [dialogError, setDialogError] = useState("");
  const [isOnline, setIsOnline] = useState(true);
  const [blockOpen, setBlockOpen] = useState(false);
  const [reportTarget, setReportTarget] = useState<MessagingMessage | null>(null);
  const [contextOpen, setContextOpen] = useState(false);
  const [trayOpen, setTrayOpen] = useState(false);
  const draftRef = useRef<HTMLTextAreaElement | null>(null);
  const [timeZone, setTimeZone] = useState("UTC");
  const dateFormatters = useMemo(() => ({
    day: new Intl.DateTimeFormat("en", { dateStyle: "medium", timeZone }),
    time: new Intl.DateTimeFormat("en", { timeStyle: "short", timeZone }),
    full: new Intl.DateTimeFormat("en", { dateStyle: "medium", timeStyle: "short", timeZone }),
  }), [timeZone]);
  const [readRetry, setReadRetry] = useState(0);
  const loiRefreshAbortRef = useRef<AbortController | null>(null);
  const loiRefreshInFlightRef = useRef(false);
  const olderMessagesAbortRef = useRef<AbortController | null>(null);
  const refreshAbortRef = useRef<AbortController | null>(null);
  const refreshEnabledRef = useRef(false);
  const refreshSucceededRef = useRef(true);
  const realtimeConnectedRef = useRef(false);
  const pollingRecoverRef = useRef<(() => void) | null>(null);
  const refreshExecutorRef = useRef<(announceFailure: boolean) => Promise<void>>(async () => undefined);
  const refreshCoordinatorRef = useRef<ReturnType<typeof createRefreshCoordinator> | null>(null);
  if (!refreshCoordinatorRef.current) {
    refreshCoordinatorRef.current = createRefreshCoordinator(
      (announceFailure) => refreshExecutorRef.current(announceFailure),
    );
  }
  const readRetryTimerRef = useRef<number | null>(null);
  const sendInFlightRef = useRef(false);
  const mutationInFlightRef = useRef(false);
  const olderMessagesInFlightRef = useRef(false);
  const pendingMessageRef = useRef<{ id: string; signature: string } | null>(null);
  const readMessageIdRef = useRef<string | null>(null);
  const newestMessageIdRef = useRef(initialThread.messages.at(-1)?.id ?? null);
  const messageHistoryRef = useRef<HTMLDivElement | null>(null);
  const messageViewportRef = useRef({
    initialized: false,
    nearBottom: true,
    newestMessageId: initialThread.messages.at(-1)?.id ?? null,
  });
  const olderScrollAnchorRef = useRef<{ scrollHeight: number; scrollTop: number } | null>(null);
  const returnFocusRef = useRef<HTMLElement | null>(null);
  const fallbackFocusRef = useRef<HTMLAnchorElement | null>(null);
  const contextToggleRef = useRef<HTMLButtonElement | null>(null);
  const threadRef = useRef(initialThread);
  threadRef.current = thread;
  const conversationId = thread.id;
  const conversationPath = `/api/conversations/${encodeURIComponent(conversationId)}`;

  useEffect(() => {
    setTimeZone(Intl.DateTimeFormat().resolvedOptions().timeZone);
  }, []);

  // The composer grows with the draft (up to about six lines), like a messaging app.
  useLayoutEffect(() => {
    const input = draftRef.current;
    if (!input) return;
    input.style.height = "auto";
    input.style.height = `${Math.min(input.scrollHeight, 160)}px`;
  }, [draft]);

  const executeRefresh = useCallback(async (announceFailure = false) => {
    if (!refreshEnabledRef.current) return;
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
      threadRef.current = moderationChanged
        ? canonical
        : mergeCanonicalConversationState(cachedThread, canonical);
      setThread((current) => moderationChanged
        ? canonical
        : mergeCanonicalConversationState(current, canonical));
      const canonicalNewestId = canonical.messages.at(-1)?.id ?? null;
      if (!after) {
        newestMessageIdRef.current = canonicalNewestId;
        if (announceFailure) setError("");
        refreshSucceededRef.current = true;
        return;
      }
      if (canonical.messages.some((message) => message.id === after)) {
        newestMessageIdRef.current = canonicalNewestId ?? after;
        if (announceFailure) setError("");
        refreshSucceededRef.current = true;
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
        const currentRef = threadRef.current;
        const refreshedRef = normalizeMessagePage(payload, currentRef);
        threadRef.current = requestAfter
          ? { ...refreshedRef, pageInfo: currentRef.pageInfo }
          : refreshedRef;
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
      refreshSucceededRef.current = true;
    } catch (requestError) {
      refreshSucceededRef.current = false;
      if (isAbortError(requestError)) return;
      if (announceFailure) setError("Messages could not be refreshed. Check your connection and try again.");
    } finally {
      window.clearTimeout(timeout);
      if (refreshAbortRef.current === controller) refreshAbortRef.current = null;
    }
  }, [conversationId, conversationPath]);

  refreshExecutorRef.current = executeRefresh;
  const refreshThread = useCallback(
    (announceFailure = false) => refreshCoordinatorRef.current!.request(announceFailure),
    [],
  );

  const refreshLoiSummary = useCallback(async () => {
    if (!refreshEnabledRef.current || loiRefreshInFlightRef.current) return true;
    loiRefreshInFlightRef.current = true;
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), LOI_SUMMARY_REQUEST_TIMEOUT_MS);
    loiRefreshAbortRef.current = controller;
    try {
      const payload = await requestJson(`${conversationPath}/loi`, {
        cache: "no-store",
        signal: controller.signal,
      });
      if (refreshEnabledRef.current) setLoi(normalizeMessagingLoiSummary(payload));
      return true;
    } catch {
      if (refreshEnabledRef.current) setLoi({ available: false });
      return false;
    } finally {
      window.clearTimeout(timeout);
      if (loiRefreshAbortRef.current === controller) loiRefreshAbortRef.current = null;
      loiRefreshInFlightRef.current = false;
    }
  }, [conversationPath]);

  useEffect(() => {
    refreshEnabledRef.current = true;
    void refreshThread(false);
    void refreshLoiSummary();
    return () => {
      refreshEnabledRef.current = false;
      loiRefreshAbortRef.current?.abort();
      olderMessagesAbortRef.current?.abort();
      refreshAbortRef.current?.abort();
    };
  }, [refreshLoiSummary, refreshThread]);

  useEffect(() => {
    void refreshLoiSummary();
  }, [refreshLoiSummary, thread.status]);

  useEffect(() => {
    const canRefresh = () => document.visibilityState === "visible" && navigator.onLine;
    const poll = createRecoveryPolling({
      canRefresh,
      intervalMs: () => realtimeConnectedRef.current ? MESSAGING_CONNECTED_POLL_MS : MESSAGING_FALLBACK_POLL_MS,
      refresh: async () => {
        await refreshThread(false);
        return refreshSucceededRef.current;
      },
    });
    const loiPoll = createRecoveryPolling({
      canRefresh,
      intervalMs: () => MESSAGING_CONNECTED_POLL_MS,
      refresh: refreshLoiSummary,
    });
    pollingRecoverRef.current = poll.recover;
    const recover = () => {
      if (document.visibilityState !== "visible" || !navigator.onLine) return;
      setReadRetry((value) => value + 1);
      poll.recover();
      loiPoll.recover();
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
      poll.dispose();
      loiPoll.dispose();
      pollingRecoverRef.current = null;
      window.removeEventListener("focus", handleFocus);
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [refreshLoiSummary, refreshThread]);

  useEffect(() => () => {
    if (readRetryTimerRef.current !== null) window.clearTimeout(readRetryTimerRef.current);
  }, []);

  useEffect(() => {
    realtimeConnectedRef.current = false;
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
          if (cancelled || document.visibilityState !== "visible" || !navigator.onLine) return;
          void refreshThread(false);
        })
        .subscribe((status: string) => {
          if (cancelled) return;
          realtimeConnectedRef.current = status === "SUBSCRIBED";
          if (status === "SUBSCRIBED") {
            if (document.visibilityState !== "visible" || !navigator.onLine) return;
            void refreshThread(false);
            void refreshLoiSummary();
          }
          else {
            logMessagingRealtimeJoinStatus(status);
            pollingRecoverRef.current?.();
          }
        });
    })().catch(() => {
      if (cancelled) return;
      realtimeConnectedRef.current = false;
      logMessagingRealtimeJoinStatus("AUTH_ERROR");
    });

    return () => {
      cancelled = true;
      realtimeConnectedRef.current = false;
      if (channel) void client.removeChannel(channel);
    };
  }, [refreshLoiSummary, refreshThread, thread.id]);

  const newestMessage = thread.messages.at(-1);
  const newestRenderedMessageId = newestMessage?.id ?? null;
  const oldestRenderedMessageId = thread.messages[0]?.id ?? null;
  const renderedMessageCount = thread.messages.length;

  useLayoutEffect(() => {
    const history = messageHistoryRef.current;
    if (!history) return;
    const viewport = messageViewportRef.current;
    const olderAnchor = olderScrollAnchorRef.current;
    if (olderAnchor) {
      history.scrollTop = olderAnchor.scrollTop + history.scrollHeight - olderAnchor.scrollHeight;
      olderScrollAnchorRef.current = null;
      viewport.initialized = true;
      viewport.newestMessageId = newestRenderedMessageId;
      viewport.nearBottom = history.scrollHeight - history.scrollTop - history.clientHeight < 96;
      return;
    }
    const newestChanged = viewport.newestMessageId !== newestRenderedMessageId;
    if (!viewport.initialized || (newestChanged && viewport.nearBottom)) {
      history.scrollTop = history.scrollHeight;
    }
    viewport.initialized = true;
    viewport.newestMessageId = newestRenderedMessageId;
    viewport.nearBottom = history.scrollHeight - history.scrollTop - history.clientHeight < 96;
  }, [newestRenderedMessageId, oldestRenderedMessageId, renderedMessageCount]);

  useEffect(() => {
    const history = messageHistoryRef.current;
    if (!history) return;
    const observer = new ResizeObserver(() => {
      if (messageViewportRef.current.nearBottom && !olderScrollAnchorRef.current) {
        history.scrollTop = history.scrollHeight;
      }
    });
    observer.observe(history);
    return () => observer.disconnect();
  }, []);

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
  const draftLimitError = draftLength > 2_000
    ? `Remove ${(draftLength - 2_000).toLocaleString()} character${draftLength - 2_000 === 1 ? "" : "s"} to send.`
    : "";
  const visibleComposerError = draftLimitError || composerError;

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
      setComposerError("Messages can contain up to 2,000 characters.");
      return;
    }
    if (input.kind === "GUIDED" && (!input.templateKey || !input.templateVersion)) return;
    if (!isOnline) {
      setComposerError("You are offline. Your message is still here so you can send it after reconnecting.");
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
    setComposerError("");
    setNotice("");
    try {
      const payload = await requestJson(`${conversationPath}/messages`, {
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
      const applied = applySentMessageResponse(payload, threadRef.current);
      if (!applied) throw new Error("Message response is invalid.");
      threadRef.current = applied.thread;
      newestMessageIdRef.current = applied.thread.messages.at(-1)?.id ?? newestMessageIdRef.current;
      messageViewportRef.current.nearBottom = true;
      setThread((current) => mergeSentMessage(current, applied.message));
      pendingMessageRef.current = null;
      if (input.kind === "FREE_TEXT") setDraft("");
      setNotice("Message sent.");
      void refreshThread(true);
    } catch (requestError) {
      setComposerError(errorMessage(requestError, "Your message was not sent. Your text is still here so you can try again."));
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
      if (threadRef.current.moderationRevision !== moderationRevision) return;
      const history = messageHistoryRef.current;
      olderScrollAnchorRef.current = history
        ? { scrollHeight: history.scrollHeight, scrollTop: history.scrollTop }
        : null;
      setThread((current) => {
        if (current.moderationRevision !== moderationRevision) {
          olderScrollAnchorRef.current = null;
          return current;
        }
        const next = normalizeMessagePage(payload, current);
        if (next.messages.length === current.messages.length) olderScrollAnchorRef.current = null;
        return next;
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

  async function startLoi() {
    if (!loi.available || !loi.canCreate || !loi.inviteId || mutationInFlightRef.current) return;
    mutationInFlightRef.current = true;
    setMutationPending(true);
    setError("");
    try {
      const created = await requestJson("/api/loi/negotiations", {
        body: JSON.stringify({ clientActionId: createClientMessageId(), inviteId: loi.inviteId }),
        headers: { "Content-Type": "application/json" },
        method: "POST",
      }) as { id?: string; status?: string };
      if (!created.id) throw new Error("LOI response is invalid.");
      setLoi({ available: true, id: created.id, status: created.status ?? "AWAITING_BUYER_SUBMISSION" });
      router.push(`/negotiations/${encodeURIComponent(created.id)}`);
    } catch (requestError) {
      setError(errorMessage(requestError, "The LOI workspace could not be started."));
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

  const coverImageId = thread.propertySnapshot.imageIds[0];
  const listingLocation = locationDetail(thread.propertySnapshot);

  return (
    <div className={`chat-thread${contextOpen ? " details-open" : ""}`}>
      <header className="chat-header">
        <Link aria-label="All conversations" className="chat-back" href="/messages" ref={fallbackFocusRef}>
          <Icon name="chevron-left" size={26} />
        </Link>
        {counterpartAvatarVariant ? (
          <GeneratedAvatar className="chat-header-avatar" decorative name={thread.counterpartLabel} seed={thread.counterpartLabel} variant={counterpartAvatarVariant} />
        ) : (
          <span aria-hidden="true" className="chat-header-avatar chat-header-avatar-fallback"><Icon name="home" size={20} /></span>
        )}
        <div className="chat-header-copy">
          <h1>{thread.counterpartLabel}</h1>
          <p>{thread.viewerRole === "BUYER" ? "Seller" : "Buyer"} · {conversationStatusLabel(thread.status)}</p>
        </div>
        <button
          aria-controls="message-context"
          aria-expanded={contextOpen}
          aria-label="Conversation details"
          className="chat-icon-button"
          onClick={() => setContextOpen((open) => !open)}
          ref={contextToggleRef}
          type="button"
        >
          <Icon name="info" size={22} />
        </button>
      </header>

      <div className="chat-pinned">
        <button className="chat-listing" onClick={() => setContextOpen(true)} type="button">
          <span className="chat-listing-thumb">
            <PropertyCoverPhoto className="chat-listing-photo" imageId={coverImageId} propertyType="HOME" seed={thread.id} showSampleTag={false} sizes="56px" />
          </span>
          <span className="chat-listing-text">
            <strong>{thread.propertySnapshot.title}</strong>
            <span>{[listingLocation, thread.viewerRole === "BUYER" ? "Shared with you" : "Your property"].filter(Boolean).join(" · ")}</span>
          </span>
          <Icon className="chat-listing-chevron" name="chevron-right" size={20} />
        </button>
        <ChatLoiAction loi={loi} busy={mutationPending} onStart={() => void startLoi()} />
        <TourScheduler conversationId={conversationId} muted={thread.muted} />
      </div>

      <div aria-atomic="true" aria-live="polite" className="message-live-region chat-alerts">
        {error ? (
          <div className="inline-alert danger" role="alert">
            <Icon name="info" size={20} />
            <p>{error}</p>
          </div>
        ) : null}
        {!isOnline ? (
          <div className="inline-alert warning" role="status">
            <Icon name="info" size={20} />
            <p>You are offline. Your draft stays here, and sending will resume after you reconnect.</p>
          </div>
        ) : null}
        {notice ? <p className="visually-hidden">{notice}</p> : null}
      </div>

      <div
        aria-label="Message history"
        className="chat-history"
        onScroll={(event) => {
          const history = event.currentTarget;
          messageViewportRef.current.nearBottom = history.scrollHeight - history.scrollTop - history.clientHeight < 96;
        }}
        ref={messageHistoryRef}
        role="region"
        tabIndex={0}
      >
        {thread.pageInfo.hasMore ? (
          <div className="chat-load-older">
            <button className="chat-pill-button" disabled={loadingOlder} onClick={loadOlderMessages} type="button">
              {loadingOlder ? "Loading…" : "Load older messages"}
            </button>
          </div>
        ) : null}

        <ol aria-live="polite" aria-relevant="additions text" className="chat-list" role="log">
          {thread.messages.length === 0 ? (
            <li className="chat-system"><p>No messages to show yet.</p></li>
          ) : thread.messages.map((message, index) => {
            const previous = thread.messages[index - 1];
            const next = thread.messages[index + 1];
            const newDay = dayKey(message.createdAt, timeZone) !== dayKey(previous?.createdAt, timeZone);
            const groupedWithPrevious = !newDay && sameGroup(previous, message);
            const groupedWithNext = dayKey(message.createdAt, timeZone) === dayKey(next?.createdAt, timeZone) && sameGroup(message, next);
            const time = (
              <time dateTime={message.createdAt || undefined} suppressHydrationWarning title={formatMessageDate(message.createdAt, dateFormatters.full)}>
                {formatMessageDate(message.createdAt, dateFormatters.time)}
              </time>
            );
            return (
              <Fragment key={message.id}>
                {newDay ? (
                  <li className="chat-day"><span suppressHydrationWarning>{dayLabel(message.createdAt, timeZone)}</span></li>
                ) : null}
                {message.kind === "SYSTEM" ? (
                  <li className="chat-system"><p>{message.body}</p></li>
                ) : (
                  <li className={`chat-row${message.isOwn ? " own" : ""}${groupedWithPrevious ? " grouped" : ""}${groupedWithNext ? "" : " tail"}${message.kind === "INVITE" ? " invite" : ""}`}>
                    <article className="chat-bubble">
                      <span className="visually-hidden">{message.senderLabel}</span>
                      {message.kind === "INVITE" ? (
                        <span className="chat-invite-media">
                          <PropertyCoverPhoto className="chat-invite-photo" imageId={coverImageId} propertyType="HOME" seed={thread.id} sizes="300px" />
                          <span className="chat-invite-label"><Icon name="home" size={14} /> Private viewing invite</span>
                        </span>
                      ) : null}
                      {message.kind === "INVITE" ? <strong className="chat-invite-title">{thread.propertySnapshot.title}</strong> : null}
                      <p className={message.redacted ? "muted" : undefined}>{message.body}</p>
                      <span className="chat-meta">
                        {time}
                        {message.isOwn ? <span aria-label="Sent" className="chat-sent" role="img" title="Sent"><Icon aria-hidden="true" name="check" size={14} /></span> : null}
                      </span>
                    </article>
                    {!message.isOwn && !message.redacted ? (
                      <button
                        aria-label={`Report message from ${message.senderLabel}, ${formatMessageDate(message.createdAt, dateFormatters.full)}`}
                        className="chat-report"
                        onClick={() => openDialog(() => setReportTarget(message))}
                        type="button"
                      >
                        Report
                      </button>
                    ) : null}
                  </li>
                )}
              </Fragment>
            );
          })}
        </ol>
      </div>

      <footer aria-label="Message composer" className="chat-composer">
        {canSend ? (
          <>
            {trayOpen || !canSendFreeText ? (
              <div className="chat-quick-tray" id="message-quick-replies">
                <p className="chat-quick-heading" id="message-quick-replies-label">Quick replies</p>
                <div aria-labelledby="message-quick-replies-label" className="chat-quick-list" role="group">
                  {templates.map((template) => (
                    <button
                      className="chat-quick-reply"
                      disabled={sending || !isOnline}
                      key={template.key}
                      onClick={() => {
                        setTrayOpen(false);
                        void sendMessage({
                          kind: "GUIDED",
                          templateKey: template.key,
                          templateVersion: template.version,
                        });
                      }}
                      type="button"
                    >
                      <strong>{template.label}</strong>
                      <span>{template.text}</span>
                    </button>
                  ))}
                </div>
              </div>
            ) : null}
            {visibleComposerError ? (
              <p className="message-composer-error" id="message-composer-error" role="alert">
                {visibleComposerError}
              </p>
            ) : null}
            {canSendFreeText ? (
              <form className="chat-compose" onSubmit={(event) => {
                event.preventDefault();
                void sendMessage({ body: draft, kind: "FREE_TEXT" });
              }}>
                <button
                  aria-controls="message-quick-replies"
                  aria-expanded={trayOpen}
                  aria-label="Quick replies"
                  className={`chat-compose-plus${trayOpen ? " open" : ""}`}
                  onClick={() => setTrayOpen((open) => !open)}
                  type="button"
                >
                  <Icon name="plus" size={22} />
                </button>
                <label className="visually-hidden" htmlFor="message-draft">Message {thread.counterpartLabel}</label>
                <textarea
                  aria-describedby={visibleComposerError ? "message-draft-count message-composer-error" : "message-draft-count"}
                  aria-invalid={draftLength > 2_000 || undefined}
                  className="chat-compose-input"
                  disabled={sending}
                  id="message-draft"
                  maxLength={4_000}
                  name="message"
                  onChange={(event) => {
                    setDraft(event.target.value);
                    if (composerError) setComposerError("");
                  }}
                  onKeyDown={(event) => submitOnEnter(event)}
                  placeholder="Message"
                  ref={draftRef}
                  rows={1}
                  value={draft}
                />
                <button
                  aria-label={sending ? "Sending message" : "Send message"}
                  className="chat-send"
                  disabled={sending || !isOnline || !draft.trim() || draftLength > 2_000}
                  type="submit"
                >
                  <Icon name="arrow-right" size={20} strokeWidth={2.4} />
                </button>
                <span
                  className={`chat-count${draftLength > 1_800 ? " visible" : ""}${draftLength > 2_000 ? " invalid" : ""}`}
                  id="message-draft-count"
                >
                  {draftLength.toLocaleString()} / 2,000<span className="visually-hidden"> characters. Enter to send, Shift+Enter for a new line.</span>
                </span>
              </form>
            ) : (
              <p className="chat-composer-note">The invite is delivered. Chat opens after the buyer replies.</p>
            )}
            {sending ? <span className="visually-hidden" role="status">Sending…</span> : null}
          </>
        ) : (
          <div className="chat-readonly" role="status">
            <Icon name="lock" size={18} />
            <p><strong>{composerUnavailableTitle(thread)}.</strong> <span suppressHydrationWarning>{composerUnavailableDescription(thread)}</span></p>
          </div>
        )}
        <p className="chat-private-note"><Icon name="lock" size={12} /> Private property chat. No sensitive info or payment requests.</p>
      </footer>

      <aside className="chat-details" aria-label="Conversation context" hidden={!contextOpen} id="message-context">
        <div className="chat-details-head">
          <h2>Details</h2>
          <button aria-label="Close conversation details" className="chat-icon-button" onClick={() => { setContextOpen(false); contextToggleRef.current?.focus(); }} type="button">
            <Icon name="close" size={22} />
          </button>
        </div>
        <section className="chat-details-section">
          <PrivatePropertyImages imageIds={thread.propertySnapshot.imageIds} />
          <h3>{thread.propertySnapshot.title}</h3>
          {thread.propertySnapshot.location ? <p className="chat-details-meta">{thread.propertySnapshot.location}</p> : null}
          <dl className="chat-details-list">
            <div><dt>Property</dt><dd>{thread.viewerRole === "BUYER" ? "Seller’s property" : "Your property"}</dd></div>
            <div><dt>Conversation</dt><dd><span className={`status-tag ${conversationStatusClassName(thread.status)}`}>{conversationStatusLabel(thread.status)}</span></dd></div>
            {thread.propertySnapshot.ownershipStatus ? (
              <div><dt>Ownership</dt><dd><span className={`status-tag ${["APPROVED", "Ownership verified"].includes(thread.propertySnapshot.ownershipStatus) ? "active" : "pending"}`}>{ownershipLabel(thread.propertySnapshot.ownershipStatus)}</span></dd></div>
            ) : null}
            {loi.available ? (
              <div><dt>LOI</dt><dd><span className={`status-tag ${loi.status === "TERMS_ALIGNED" ? "active" : "pending"}`}>{!loi.id && !loi.canCreate ? "Waiting for buyer" : loiStatusLabel(loi.status)}</span></dd></div>
            ) : null}
          </dl>
          {!thread.propertySnapshot.identityCurrent ? (
            <p className="fine-print">Showing the property version shared with this invite.</p>
          ) : null}
        </section>
        <section className="chat-details-section chat-details-actions">
          <button className="chat-details-action" disabled={mutationPending} onClick={updateMute} type="button">
            <Icon name="bell" size={20} /> {thread.muted ? "Unmute conversation" : "Mute conversation"}
          </button>
          <button
            className="chat-details-action danger"
            disabled={mutationPending || thread.status === "BLOCKED"}
            onClick={() => openDialog(() => setBlockOpen(true))}
            type="button"
          >
            <Icon name="shield" size={20} /> Block participant
          </button>
        </section>
        <p className="chat-details-safety">{thread.safetyNotice}</p>
      </aside>

      {blockOpen ? (
        <MessagingDialog
          busy={mutationPending}
          title="Block this participant?"
          onClose={() => closeDialog(() => setBlockOpen(false))}
        >
          <p>Blocking is permanent in Messaging V1. Neither participant will be able to send messages, and future invites between you will be unavailable.</p>
          {dialogError ? <div className="inline-alert danger" role="alert"><Icon name="info" size={20} /><p>{dialogError}</p></div> : null}
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
            {dialogError ? <div className="inline-alert danger" role="alert"><Icon name="info" size={20} /><p>{dialogError}</p></div> : null}
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

function loiStatusLabel(status: string | null) {
  const labels: Record<string, string> = {
    AWAITING_BUYER_RESPONSE: "Waiting for buyer",
    AWAITING_BUYER_SUBMISSION: "Buyer drafting",
    AWAITING_SELLER_RESPONSE: "Waiting for seller",
    DECLINED: "Declined",
    EXPIRED: "Expired",
    NOT_STARTED: "Not started",
    READ_ONLY: "Read-only",
    TERMS_ALIGNED: "Terms aligned",
    WITHDRAWN: "Withdrawn",
  };
  return status ? labels[status] ?? "LOI" : "LOI";
}

function formatMessageDate(value: string | undefined, formatter: Intl.DateTimeFormat) {
  if (!value) return "";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : formatter.format(date);
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
            <Icon name="close" size={20} />
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

function conversationStatusLabel(status: ConversationThread["status"]) {
  if (status === "AWAITING_BUYER") return "Waiting for reply";
  if (status === "BLOCKED") return "Unavailable";
  if (status === "READ_ONLY") return "Closed";
  return "Active";
}

/** Snapshot stores the enum ("APPROVED") or an already human label (test approvals). */
function ownershipLabel(value: string) {
  const labels: Record<string, string> = { APPROVED: "Verified", PENDING: "In review", REJECTED: "Not verified", NOT_SUBMITTED: "Not submitted" };
  return labels[value] ?? value;
}

function conversationStatusClassName(status: ConversationThread["status"]) {
  if (status === "AWAITING_BUYER") return "pending";
  if (status === "BLOCKED") return "expired";
  if (status === "READ_ONLY") return "";
  return "active";
}

const GROUP_WINDOW_MS = 5 * 60_000;

/** Consecutive messages from one side within a few minutes read as one bubble group. */
function sameGroup(first?: MessagingMessage, second?: MessagingMessage) {
  if (!first || !second || first.kind === "SYSTEM" || second.kind === "SYSTEM") return false;
  if (first.kind === "INVITE" || second.kind === "INVITE" || first.isOwn !== second.isOwn) return false;
  const gap = new Date(second.createdAt).getTime() - new Date(first.createdAt).getTime();
  return Number.isFinite(gap) && gap >= 0 && gap < GROUP_WINDOW_MS;
}

function dayKey(value: string | undefined, timeZone: string) {
  if (!value) return "";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "" : new Intl.DateTimeFormat("en-CA", { timeZone }).format(date);
}

/** "Today", "Yesterday", then "Mon, Oct 13" (adds the year outside the current one). */
function dayLabel(value: string, timeZone: string) {
  const key = dayKey(value, timeZone);
  const now = Date.now();
  if (key === dayKey(new Date(now).toISOString(), timeZone)) return "Today";
  if (key === dayKey(new Date(now - 86_400_000).toISOString(), timeZone)) return "Yesterday";
  const date = new Date(value);
  const sameYear = new Intl.DateTimeFormat("en", { timeZone, year: "numeric" }).format(date)
    === new Intl.DateTimeFormat("en", { timeZone, year: "numeric" }).format(new Date(now));
  return new Intl.DateTimeFormat("en", { day: "numeric", month: "short", timeZone, weekday: "short", ...(sameYear ? {} : { year: "numeric" }) }).format(date);
}

function composerUnavailableTitle(thread: ConversationThread) {
  if (thread.status === "BLOCKED") return "Conversation unavailable";
  if (thread.status === "AWAITING_BUYER") return "Waiting for the buyer";
  return "Conversation is read-only";
}

function composerUnavailableDescription(thread: ConversationThread) {
  if (thread.status === "BLOCKED") return "Messaging is no longer available in this conversation.";
  if (thread.status === "AWAITING_BUYER") {
    return "Chat opens after the buyer replies to your invite.";
  }
  return "The invite, property, or participant is no longer eligible for new messages. History remains available.";
}

function submitOnEnter(event: KeyboardEvent<HTMLTextAreaElement>) {
  if (event.key !== "Enter" || event.shiftKey || event.nativeEvent.isComposing) return;
  event.preventDefault();
  event.currentTarget.form?.requestSubmit();
}

/** The location after the title: "17200 Ventura Blvd, Encino, CA" under that title reads "Encino, CA". */
function locationDetail({ location, title }: { location?: string | null; title: string }) {
  if (!location) return "";
  return location.startsWith(title) ? location.slice(title.length).replace(/^[,\s]+/, "") : location;
}
