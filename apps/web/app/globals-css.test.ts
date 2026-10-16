import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const css = readFileSync(path.resolve("app/globals.css"), "utf8").replace(/\r\n/g, "\n");

function declarations(selector: string) {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`(?:^|\\n)\\s*${escaped}\\s*\\{([^}]*)\\}`).exec(css)?.[1] ?? "";
}

describe("global focus styles", () => {
  it("draws a forced-colors outline because High Contrast drops the box-shadow rings", () => {
    const forcedColors = /@media \(forced-colors: active\) \{([\s\S]*?)\n\}/.exec(css)?.[1] ?? "";

    expect(forcedColors).toMatch(/\s:focus-visible,[\s\S]*?\{\s*outline: 2px solid Highlight !important;/);
    expect(forcedColors).toContain(".check-row input:focus-visible + .check-box");
  });
});

describe("green button contrast (owner decision: near-black text on the brand green)", () => {
  it.each([".button.primary", ".pagination-button.primary", ".map-card-cta"])("%s uses ink text on the green", (selector) => {
    const rule = declarations(selector);
    expect(rule).toMatch(/background: var\(--sage-strong\)/);
    expect(rule).toContain("color: var(--ink-strong);");
  });

  it("keeps ink text on the deeper hover and pressed green", () => {
    expect(declarations(".button:active")).toContain("color: var(--ink-strong);");
    expect(css).toMatch(/\.button:hover,\s*\.button\.primary:hover \{\s*background: var\(--sage-deep\);\s*border-color: var\(--sage-deep\);\s*color: var\(--ink-strong\);/);
  });

  it("keeps disabled green buttons legible instead of fading their text", () => {
    const disabled = declarations('.button:not(.secondary):not(.ghost):not(.warning):is(:disabled, [disabled], [aria-disabled="true"])');
    expect(disabled).toContain("background: var(--sage-line);");
    expect(disabled).toContain("color: var(--ink-soft);");
    expect(disabled).toContain("opacity: 1;");
  });
});
