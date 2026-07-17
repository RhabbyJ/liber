import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("conversation inbox rendering", () => {
  it("keeps message previews on React's inert text path", () => {
    const inboxSource = readFileSync(new URL("./conversation-inbox.tsx", import.meta.url), "utf8");
    const threadSource = readFileSync(new URL("./message-thread.tsx", import.meta.url), "utf8");

    expect(inboxSource).toContain("{conversation.lastMessage.body}");
    expect(inboxSource).toContain('conversation.lastMessage.isOwn ? "You: " : ""');
    expect(threadSource).toContain("{message.body}</p>");
    expect(`${inboxSource}\n${threadSource}`).not.toContain("dangerouslySetInnerHTML");
    expect(`${inboxSource}\n${threadSource}`).not.toContain("linkify");
  });

  it("renders only the authorized buyer avatar and keeps a generic fallback", () => {
    const source = readFileSync(new URL("./conversation-inbox.tsx", import.meta.url), "utf8");

    expect(source).toContain("<GeneratedAvatar");
    expect(source).toContain("conversation.counterpartAvatarVariant ? (");
    expect(source).toContain("variant={conversation.counterpartAvatarVariant}");
    expect(source).toContain('className="message-inbox-icon"');
  });

  it("refreshes the canonical first page for unread counts and ordering", () => {
    const source = readFileSync(new URL("./conversation-inbox.tsx", import.meta.url), "utf8");

    expect(source).toContain('fetch("/api/conversations"');
    expect(source).toContain("window.setInterval(recover, 5_000)");
    expect(source).toContain('window.addEventListener("focus", recover)');
    expect(source).toContain('window.addEventListener("online", recover)');
    expect(source).toContain('document.addEventListener("visibilitychange", recover)');
    expect(source).toContain("signature !== firstPageSignatureRef.current");
    expect(source).toContain("conversationPageSignature(incoming, refreshedPageInfo)");
    expect(source).toContain("if (requestInFlightRef.current) return");
    expect(source).toContain("INBOX_REFRESH_TIMEOUT_MS");
    expect(source).toContain("setLoading(false)");
    expect(source).not.toContain("if (!controller.signal.aborted) setLoading(false)");
  });

  it("drops cached history when the server moderation revision changes", () => {
    const source = readFileSync(new URL("./message-thread.tsx", import.meta.url), "utf8");

    expect(source).toContain("canonical.moderationRevision !== cachedThread.moderationRevision");
    expect(source).toMatch(/moderationChanged\s*\? canonical\s*:\s*mergeCanonicalConversationState/);
    expect(source).toContain("if (moderationChanged) olderMessagesAbortRef.current?.abort()");
    expect(source).toContain("current.moderationRevision !== moderationRevision");
    expect(source).toContain("createRefreshCoordinator");
    expect(source).toContain("refreshCoordinatorRef.current!.request(announceFailure)");
    expect(source).toContain("MESSAGING_REQUEST_TIMEOUT_MS");
    expect(source).not.toContain("refreshAbortRef.current?.abort();\n    refreshAbortRef.current = controller");
  });

  it("loads LOI enrichment independently from canonical messaging", () => {
    const source = readFileSync(new URL("./message-thread.tsx", import.meta.url), "utf8");

    expect(source).toContain("`${conversationPath}/loi`");
    expect(source).toContain("void refreshThread(false)");
    expect(source).toContain("void refreshLoiSummary()");
    expect(source).not.toContain("canonicalPayload as { loi");
  });

  it("keeps a successful reply independent from trailing reconciliation", () => {
    const source = readFileSync(new URL("./message-thread.tsx", import.meta.url), "utf8");
    const sendStart = source.indexOf("async function sendMessage");
    const sendEnd = source.indexOf("async function loadOlderMessages", sendStart);
    const sendSource = source.slice(sendStart, sendEnd);

    expect(source).toContain("event.preventDefault();");
    expect(sendSource).toContain("applySentMessageResponse(payload, threadRef.current)");
    expect(sendSource).toContain("setThread((current) => mergeSentMessage(current, applied.message))");
    expect(sendSource).toContain('setDraft("")');
    expect(sendSource).toContain("void refreshThread(true)");
    expect(sendSource).not.toContain("await refreshThread(true)");
  });

  it("keeps the latest messages visible without losing the older-page scroll anchor", () => {
    const source = readFileSync(new URL("./message-thread.tsx", import.meta.url), "utf8");

    expect(source).toContain("useLayoutEffect");
    expect(source).toContain("messageHistoryRef");
    expect(source).toContain("olderScrollAnchorRef");
    expect(source).toContain("history.scrollTop = olderAnchor.scrollTop + history.scrollHeight - olderAnchor.scrollHeight");
    expect(source).toContain("newestChanged && viewport.nearBottom");
  });

  it("keeps offline drafts editable and surfaces conversation state in the inbox", () => {
    const inboxSource = readFileSync(new URL("./conversation-inbox.tsx", import.meta.url), "utf8");
    const threadSource = readFileSync(new URL("./message-thread.tsx", import.meta.url), "utf8");

    expect(inboxSource).toContain('conversation.status !== "ACTIVE"');
    expect(inboxSource).toContain('conversation.unreadCount > 0 ? " unread"');
    expect(threadSource).toContain("disabled={sending}");
    expect(threadSource).toContain("aria-invalid={draftLength > 2_000 || undefined}");
    expect(threadSource).toContain('className="message-composer-error"');
  });
});
