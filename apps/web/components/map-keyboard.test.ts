import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

// Mapbox markers and popups need a real browser, so these checks read the map sources.
const maps = {
  "approved seller map": readFileSync(path.resolve("components/interactive-buyer-map.tsx"), "utf8"),
  "public preview map": readFileSync(path.resolve("components/public-demand-map.tsx"), "utf8"),
};

describe.each(Object.entries(maps))("%s keyboard support", (_name, source) => {
  it("moves keyboard focus to the re-clustered marker instead of dropping it to the page", () => {
    expect(source).toContain('active.matches(":focus-visible")');
    expect(source).toMatch(/clearMarkers\(\);[\s\S]*?if \(keepFocus && \w+\?\.length\) markerNodesRef\.current\.get\(\w+\[0\]\)\?\.focus\(\{ preventScroll: true \}\);/);
  });

  it("closes the mini-card on Escape, leaves Escape to an open modal, and returns focus to its marker", () => {
    expect(source).toContain('document.addEventListener("keydown", closePopupOnEscape);');
    expect(source).toContain(`event.target.closest('[aria-modal="true"]')`);
    expect(source).toMatch(/popup\.remove\(\);\s+pinnedPopupRef\.current = null;/);
    expect(source).toMatch(/if \(focusWasInPopup && owner(?: !== null)?\) markerNodesRef\.current\.get\(owner\)\?\.focus/);
  });

  it("moves into a pinned mini-card only when a marker is activated from the keyboard", () => {
    expect(source).toMatch(/showPopup\(group, true\);\s+\/\/ Enter or Space[^\n]*\n\s+if \(event\.detail === 0\)/);
  });
});
