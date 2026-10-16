import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const css = readFileSync(new URL("./notification-bell.css", import.meta.url), "utf8");

function mediaBlock(query: string) {
  const start = css.indexOf(`@media ${query} {`);
  if (start === -1) return "";
  let depth = 0;
  for (let index = css.indexOf("{", start); index < css.length; index += 1) {
    if (css[index] === "{") depth += 1;
    if (css[index] === "}" && (depth -= 1) === 0) return css.slice(start, index + 1);
  }
  return "";
}

function rule(block: string, selector: string) {
  const match = new RegExp(`${selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s*\\{([^}]*)\\}`).exec(block);
  return Object.fromEntries((match?.[1] ?? "").split(";").map((declaration) => declaration.split(":").map((part) => part.trim()))
    .filter(([property, value]) => property && value)
    .map(([property, ...value]) => [property, value.join(":")]));
}

describe("notification dropdown layout", () => {
  it("keeps the desktop dropdown anchored to the bell and capped at 380px", () => {
    expect(rule(css, ".notification-popover")).toMatchObject({
      position: "absolute",
      right: "0",
      width: "min(380px, calc(100vw - 32px))",
    });
  });

  // Verified in headless Chrome at 320, 360, 375, 414 and 480px: the bell-anchored
  // panel started at -72px (320) and -4px (480); the phone rule keeps 16px margins.
  it("pins the dropdown to the viewport below the header on phones so it cannot clip", () => {
    const phones = mediaBlock("(max-width: 599px)");
    expect(rule(phones, ".notification-popover")).toEqual({
      left: "16px",
      position: "fixed",
      right: "16px",
      top: "calc(var(--header-h) + 1px + 8px)",
      width: "auto",
    });
    expect(rule(phones, ".notification-popover-list")).toEqual({
      "max-height": "min(520px, calc(100dvh - 220px))",
    });
  });
});
