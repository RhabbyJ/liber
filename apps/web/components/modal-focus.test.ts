import { afterEach, describe, expect, it, vi } from "vitest";
import { keepTabInside, tabWrapTarget } from "./modal-focus";

describe("modal Tab wrapping", () => {
  const [close, reset, apply] = ["close", "reset", "apply"];
  const focusable = [close, reset, apply];

  it("wraps Tab from the last control to the first, and Shift+Tab from the first to the last", () => {
    expect(tabWrapTarget(focusable, apply, true, false)).toBe(close);
    expect(tabWrapTarget(focusable, close, true, true)).toBe(apply);
  });

  it("lets the browser move focus between inner controls and from the focused title", () => {
    expect(tabWrapTarget(focusable, reset, true, false)).toBeNull();
    expect(tabWrapTarget(focusable, reset, true, true)).toBeNull();
    expect(tabWrapTarget(focusable, "title", true, false)).toBeNull();
  });

  it("pulls focus that escaped the modal back inside", () => {
    expect(tabWrapTarget(focusable, "page link", false, false)).toBe(close);
    expect(tabWrapTarget(focusable, null, false, true)).toBe(apply);
  });

  it("does nothing for a modal without focusable controls", () => {
    expect(tabWrapTarget([], null, false, false)).toBeNull();
  });
});

describe("keepTabInside", () => {
  afterEach(() => vi.unstubAllGlobals());

  function control(name: string, visible = true) {
    return { focus: vi.fn(), getClientRects: () => (visible ? [{}] : []), name };
  }

  it("skips hidden controls and moves focus itself when it wraps", () => {
    const first = control("close");
    const hidden = control("hidden apply", false);
    const last = control("show matching buyers");
    const container = {
      contains: (element: unknown) => [first, hidden, last].includes(element as never),
      querySelectorAll: () => [first, last, hidden],
    };
    vi.stubGlobal("document", { activeElement: last });
    const event = { preventDefault: vi.fn(), shiftKey: false };

    keepTabInside(container as never, event as never);

    expect(event.preventDefault).toHaveBeenCalledTimes(1);
    expect(first.focus).toHaveBeenCalledTimes(1);
  });

  it("leaves ordinary Tab presses to the browser", () => {
    const first = control("close");
    const last = control("apply");
    vi.stubGlobal("document", { activeElement: first });
    const event = { preventDefault: vi.fn(), shiftKey: false };

    keepTabInside({ contains: () => true, querySelectorAll: () => [first, last] } as never, event as never);

    expect(event.preventDefault).not.toHaveBeenCalled();
    expect(last.focus).not.toHaveBeenCalled();
  });
});
