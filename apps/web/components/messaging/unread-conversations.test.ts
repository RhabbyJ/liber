import { readFileSync } from "node:fs";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { NOTIFICATIONS_CHANGED_EVENT } from "../../lib/notification-client";
import {
  announceConversationRead,
  CONVERSATION_READ_EVENT,
  currentUnreadConversationCount,
  publishUnreadConversationCount,
  subscribeUnreadConversationCount,
  unreadConversationBadgeText,
  unreadConversationCountFrom,
  useUnreadConversationCount,
} from "./unread-conversations";

const source = (path: string) => readFileSync(new URL(path, import.meta.url), "utf8");

afterEach(() => {
  publishUnreadConversationCount(null);
  vi.unstubAllGlobals();
});

describe("unread conversation badge state", () => {
  it.each([
    [{ unreadCount: 0, unreadConversationCount: 4 }, 4],
    [{ unreadConversationCount: 0 }, 0],
    [{ unreadConversationCount: null }, null],
    [{ unreadCount: 2 }, undefined],
    [{ unreadConversationCount: -1 }, undefined],
    [{ unreadConversationCount: 1.5 }, undefined],
    [{ unreadConversationCount: "3" }, undefined],
    [null, undefined],
    ["unreadConversationCount", undefined],
  ])("reads %j as %s", (payload, expected) => {
    expect(unreadConversationCountFrom(payload)).toBe(expected);
  });

  it("notifies subscribers only when the count changes", () => {
    const listener = vi.fn();
    const unsubscribe = subscribeUnreadConversationCount(listener);
    publishUnreadConversationCount(3);
    publishUnreadConversationCount(3);
    expect(currentUnreadConversationCount()).toBe(3);
    publishUnreadConversationCount(null);
    expect(listener).toHaveBeenCalledTimes(2);
    unsubscribe();
    publishUnreadConversationCount(1);
    expect(listener).toHaveBeenCalledTimes(2);
  });

  it("never renders a browser-published count on the server", () => {
    publishUnreadConversationCount(7);
    function Probe() {
      return createElement("span", null, String(useUnreadConversationCount()));
    }
    expect(renderToStaticMarkup(createElement(Probe))).toBe("<span>null</span>");
  });

  it("caps the badge text the way the server caps the count", () => {
    expect(unreadConversationBadgeText(1)).toBe("1");
    expect(unreadConversationBadgeText(99)).toBe("99");
    expect(unreadConversationBadgeText(100)).toBe("99+");
  });

  it("announces a read to the inbox and to the header bell", () => {
    const target = new EventTarget();
    const read = vi.fn();
    const changed = vi.fn();
    target.addEventListener(CONVERSATION_READ_EVENT, read);
    target.addEventListener(NOTIFICATIONS_CHANGED_EVENT, changed);
    vi.stubGlobal("window", target);
    announceConversationRead("conversation-1");
    expect((read.mock.calls[0]?.[0] as CustomEvent).detail).toEqual({ conversationId: "conversation-1" });
    expect(changed).toHaveBeenCalledOnce();
  });
});

// The components are TSX with `jsx: preserve`, so Vitest cannot import them; check the wiring in source.
describe("unread conversation badge wiring", () => {
  it("publishes the count from the bell's existing poll and clears it when the session ends", () => {
    const bell = source("../notification-bell.tsx");
    expect(bell).toContain("const conversations = unreadConversationCountFrom(next);");
    expect(bell).toContain("if (conversations !== undefined) publishUnreadConversationCount(conversations);");
    expect(bell.match(/publishUnreadConversationCount\(null\)/g)).toHaveLength(2);
    expect(bell).toContain("intervalMs: () => MESSAGING_FALLBACK_POLL_MS");
    expect(bell).toContain("if (inFlight) refreshQueued = true;");
    expect(bell).toContain("window.addEventListener(NOTIFICATIONS_CHANGED_EVENT, refreshChanged);");
    expect(bell.match(/fetch\(/g)).toHaveLength(1);
  });

  it("shows the badge only on the Messages item of an enabled account", () => {
    const nav = source("../primary-nav.tsx");
    expect(nav).toContain('const MESSAGES_HREF = "/messages";');
    expect(nav).toContain("const unread = messagingEnabled && item.href === MESSAGES_HREF ? unreadConversations : 0;");
    expect(nav).toContain('<span aria-hidden="true" className="nav-unread-badge">{unreadConversationBadgeText(unread)}</span>');
    expect(nav).toContain('import "./primary-nav.css";');
  });

  it("announces only acknowledged reads and clears the inbox row", () => {
    const thread = source("./message-thread.tsx");
    const inbox = source("./conversation-inbox.tsx");
    expect(thread).toContain("}).then(() => announceConversationRead(conversationId), () => {");
    expect(inbox).toContain("window.addEventListener(CONVERSATION_READ_EVENT, clearReadConversation);");
    expect(inbox).toContain("{ ...item, unreadCount: 0 }");
  });
});
