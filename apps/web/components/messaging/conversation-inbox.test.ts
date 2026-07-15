import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("conversation inbox rendering", () => {
  it("keeps message previews on React's inert text path", () => {
    const inboxSource = readFileSync(new URL("./conversation-inbox.tsx", import.meta.url), "utf8");
    const threadSource = readFileSync(new URL("./message-thread.tsx", import.meta.url), "utf8");

    expect(inboxSource).toContain("conversation.lastMessage?.body || statusDescription");
    expect(threadSource).toContain("{message.body}</p>");
    expect(`${inboxSource}\n${threadSource}`).not.toContain("dangerouslySetInnerHTML");
    expect(`${inboxSource}\n${threadSource}`).not.toContain("linkify");
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
    expect(source).toContain("if (refreshInFlightRef.current) return");
    expect(source).toContain("MESSAGING_REQUEST_TIMEOUT_MS");
    expect(source).not.toContain("refreshAbortRef.current?.abort();\n    refreshAbortRef.current = controller");
  });
});
