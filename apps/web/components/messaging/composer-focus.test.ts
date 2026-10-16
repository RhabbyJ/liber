import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import { restoreComposerFocus } from "./composer-focus";

function control({ disabled = false } = {}) {
  return { disabled, matches: (selector: string) => selector === ":disabled" && disabled } as unknown as Element;
}

function composer({ disabled = false } = {}) {
  return Object.assign(control({ disabled }), { disabled, focus: vi.fn() }) as unknown as HTMLTextAreaElement & { focus: ReturnType<typeof vi.fn> };
}

describe("composer focus after a send", () => {
  const body = control();

  it("returns focus that fell to the page when the composer was disabled", () => {
    const draft = composer();

    expect(restoreComposerFocus(draft, { activeElement: body, body })).toBe(true);
    expect(restoreComposerFocus(draft, { activeElement: null, body })).toBe(true);
    expect(draft.focus).toHaveBeenCalledTimes(2);
  });

  it("returns focus stranded on the disabled send button or still on the composer", () => {
    const draft = composer();

    expect(restoreComposerFocus(draft, { activeElement: control({ disabled: true }), body })).toBe(true);
    expect(restoreComposerFocus(draft, { activeElement: draft, body })).toBe(true);
    expect(draft.focus).toHaveBeenCalledTimes(2);
  });

  it("does not steal focus the user moved to another control during the send", () => {
    const draft = composer();

    expect(restoreComposerFocus(draft, { activeElement: control(), body })).toBe(false);
    expect(draft.focus).not.toHaveBeenCalled();
  });

  it("does nothing while the composer is still disabled or gone", () => {
    const draft = composer({ disabled: true });

    expect(restoreComposerFocus(draft, { activeElement: body, body })).toBe(false);
    expect(restoreComposerFocus(null, { activeElement: body, body })).toBe(false);
    expect(draft.focus).not.toHaveBeenCalled();
  });

  it("restores focus after free-text sends settle, whether they succeed or fail", () => {
    const source = readFileSync(new URL("./message-thread.tsx", import.meta.url), "utf8");
    const sendSource = source.slice(source.indexOf("async function sendMessage"), source.indexOf("async function loadOlderMessages"));

    // Regression: the textarea is disabled while sending and nothing gave focus back.
    expect(source).toContain("disabled={sending}");
    expect(sendSource).toMatch(/restoreDraftFocusRef\.current = input\.kind === "FREE_TEXT";\s*setSending\(true\);/);
    expect(sendSource).toMatch(/finally \{[^}]*setSending\(false\);/);
    expect(source).toMatch(
      /useEffect\(\(\) => \{\s*if \(sending \|\| !restoreDraftFocusRef\.current\) return;\s*restoreDraftFocusRef\.current = false;\s*restoreComposerFocus\(draftRef\.current, document\);\s*\}, \[sending\]\);/,
    );
  });
});
