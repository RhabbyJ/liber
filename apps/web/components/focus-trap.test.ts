import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { focusableElements, focusTrapTarget } from "./focus-trap";

type FakeElement = HTMLElement & { name: string };

function element(name: string, { focusable = true, rendered = true, children = [] as FakeElement[] } = {}) {
  return {
    name,
    getClientRects: () => (rendered ? [{}] : []) as unknown as DOMRectList,
    matches: () => focusable,
    querySelectorAll: () => children.filter((child) => child.matches("")),
  } as unknown as FakeElement;
}

describe("focus trap", () => {
  const items = ["toggle", "map", "messages", "sign-out"];

  it("wraps Tab from the last element and Shift+Tab from the first", () => {
    expect(focusTrapTarget(items, "sign-out", false)).toBe("toggle");
    expect(focusTrapTarget(items, "toggle", true)).toBe("sign-out");
  });

  it("leaves Tab between inner elements to the browser", () => {
    expect(focusTrapTarget(items, "map", false)).toBeNull();
    expect(focusTrapTarget(items, "messages", true)).toBeNull();
  });

  it("pulls focus that is outside back to the matching end", () => {
    expect(focusTrapTarget(items, "page-body", false)).toBe("toggle");
    expect(focusTrapTarget(items, "page-body", true)).toBe("sign-out");
    expect(focusTrapTarget([], "page-body", false)).toBeNull();
  });

  it("collects rendered focusable elements in root order and skips hidden ones", () => {
    const toggle = element("toggle");
    const link = element("link");
    const hiddenAction = element("hidden-action", { rendered: false });
    const nav = element("nav", { focusable: false, children: [link, hiddenAction] });
    expect(focusableElements([toggle, null, nav]).map((item) => (item as FakeElement).name)).toEqual(["toggle", "link"]);
  });
});

// The nav is TSX with `jsx: preserve`, so Vitest cannot import it; check the wiring in source.
describe("phone navigation drawer focus wiring", () => {
  const nav = readFileSync(new URL("./primary-nav.tsx", import.meta.url), "utf8");

  it("hands the drawer from the pre-hydration fallback to React", () => {
    expect(nav).toContain('const hydrated = () => shell.dataset.primaryNavHydrated === "true";');
    expect(nav.match(/if \(hydrated\(\)\) return;/g)).toHaveLength(3);
    expect(nav).toContain('shell.dataset.primaryNavHydrated = "true";');
    expect(nav).toContain('if (toggleRef.current?.getAttribute("aria-expanded") === "true") setIsOpen(true);');
  });

  it("traps Tab, closes on Escape with focus on the toggle, and never strands focus", () => {
    expect(nav).toContain("focusableElements([toggleRef.current, navRef.current])");
    expect(nav).toMatch(/if \(event\.key === "Escape"\) \{\s*event\.preventDefault\(\);\s*closeMenu\(true\);/);
    expect(nav).toContain("if (returnFocus) toggleRef.current?.focus({ preventScroll: true });");
    expect(nav).toContain('document.addEventListener("focusin", onFocusIn);');
    expect(nav).toContain("if (!isElementRendered(toggleRef.current)) closeMenu(false);");
    expect(nav).toContain("aria-controls={navId}");
    expect(nav).not.toContain("onClick={close}");
  });
});
