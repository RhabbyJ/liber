import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { isElementRendered } from "./element-visibility";

const source = (path: string) => readFileSync(new URL(path, import.meta.url), "utf8");

describe("element visibility", () => {
  it("treats elements without layout boxes as hidden", () => {
    expect(isElementRendered({ getClientRects: () => [{}] as unknown as DOMRectList })).toBe(true);
    expect(isElementRendered({ getClientRects: () => [] as unknown as DOMRectList })).toBe(false);
    expect(isElementRendered(null)).toBe(false);
    expect(isElementRendered(undefined)).toBe(false);
  });
});

// The components are TSX with `jsx: preserve`, so Vitest cannot import them; check the wiring in source.
describe("messaging sidecar polling cost", () => {
  it("polls the inbox only while its list is rendered and catches up when it reappears", () => {
    const inbox = source("./conversation-inbox.tsx");
    expect(inbox).toContain("const isShown = () => isElementRendered(rootRef.current);");
    expect(inbox).toContain('canRefresh: () => document.visibilityState === "visible" && navigator.onLine && isShown(),');
    expect(inbox).toContain("if (nowShown && !shown) recover();");
    expect(inbox).toContain("resize?.disconnect();");
    expect(inbox.match(/ref=\{rootRef\}/g)).toHaveLength(2);
    // The hidden sidebar is the phone layout's: the thread page hides it below 900px.
    expect(source("../../app/messages/chat.css")).toMatch(/@media \(max-width: 899px\)[\s\S]*?\.chat-shell\.is-thread \.chat-sidebar[\s\S]*?display: none/);
  });

  it("polls the tour bar through the shared poller: visible and online only, with failure backoff", () => {
    const tour = source("./tour-scheduler.tsx");
    expect(tour).toContain("const poll = createRecoveryPolling({");
    expect(tour).toContain('canRefresh: () => document.visibilityState === "visible" && navigator.onLine,');
    expect(tour).toContain("intervalMs: () => TOUR_POLL_MS,");
    expect(tour).toContain("const TOUR_POLL_MS = 15_000;");
    expect(tour).toContain("return !failed;");
    expect(tour).not.toContain("setInterval(");
    expect(tour).toContain('document.addEventListener("visibilitychange", recover);');
  });
});
