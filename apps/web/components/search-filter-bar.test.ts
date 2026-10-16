import { existsSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import * as react from "react";
import * as reactDom from "react-dom";
import { renderToStaticMarkup } from "react-dom/server";
import ts from "typescript";
import { afterEach, describe, expect, it, vi } from "vitest";

const nodeRequire = createRequire(import.meta.url);
const sourcePath = path.resolve("components/search-filter-bar.tsx");
const source = readFileSync(sourcePath, "utf8");

// Components are JSX-preserved .tsx files, so compile them (and their local imports) here.
function load(file: string, overrides: Record<string, unknown>): Record<string, unknown> {
  const compiled = ts.transpileModule(readFileSync(file, "utf8"), {
    compilerOptions: { esModuleInterop: true, jsx: ts.JsxEmit.ReactJSX, module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const moduleExports: Record<string, unknown> = {};
  const localRequire = (id: string) => {
    if (id in overrides) return overrides[id];
    if (id.startsWith(".")) {
      const base = path.resolve(path.dirname(file), id);
      const resolved = [".tsx", ".ts"].map((extension) => base + extension).find((candidate) => existsSync(candidate));
      if (resolved) return load(resolved, overrides);
    }
    return nodeRequire(id);
  };
  new Function("require", "exports", compiled)(localRequire, moduleExports);
  return moduleExports;
}

/** Renders the toolbar with the Filters sheet open (its second piece of state). */
function renderOpenSheet() {
  let stateCalls = 0;
  const useState = (initial: unknown) => {
    stateCalls += 1;
    return [stateCalls === 2 ? true : initial, () => undefined];
  };
  const { SearchFilterBar } = load(sourcePath, {
    "next/navigation": { useRouter: () => ({ push: () => undefined }), useSearchParams: () => new URLSearchParams() },
    react: { ...react, useState },
    "react-dom": { ...reactDom, createPortal: (children: unknown) => children },
  }) as { SearchFilterBar: react.FC<Record<string, unknown>> };
  const filters = {
    amenities: [], badges: [], bathrooms: "", bedrooms: "", budgetMax: "", budgetMin: "", condition: "", propertySubtype: "", squareFeet: "",
  };
  // The sheet is portaled to document.body; the portal is rendered in place here.
  vi.stubGlobal("document", { body: {} });
  return renderToStaticMarkup(react.createElement(SearchFilterBar, { filters, location: react.createElement("div") }));
}

describe("filters sheet", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("is a modal dialog named by its focusable title", () => {
    const markup = renderOpenSheet();
    const titleId = /<h2 class="filter-sheet-title" id="([^"]+)" tabindex="-1">Filters<\/h2>/.exec(markup)?.[1];

    expect(titleId).toBeTruthy();
    expect(markup).toContain(`aria-labelledby="${titleId}" aria-modal="true" class="filter-sheet-panel"`);
    expect(markup).toContain('role="dialog"');
    expect(markup).toMatch(/aria-expanded="true" aria-haspopup="dialog" class="filter-button filter-sheet-trigger"/);
  });

  it("offers one close control to assistive tech; the scrim is pointer-only", () => {
    const markup = renderOpenSheet();

    expect(markup.match(/aria-label="Close filters"/g)).toHaveLength(1);
    expect(markup).toContain('<div aria-hidden="true" class="filter-sheet-scrim"></div>');
  });

  it("discards unapplied edits the same way for Escape, the close button, and the scrim", () => {
    expect(source).toMatch(/function closeSheet\(\) \{\s+setDraft\(filters\);\s+setIsSheetOpen\(false\);\s+\}/);
    expect(source).toMatch(/if \(event\.key === "Escape"\) \{\s+event\.preventDefault\(\);\s+closeSheet\(\);/);
    expect(source.match(/onClick=\{closeSheet\}/g)).toHaveLength(2);
    // Opening starts from the applied filters, not from a popover's unapplied draft.
    expect(source).toMatch(/function openSheet\(\) \{\s+setDraft\(filters\);\s+setIsSheetOpen\(true\);\s+\}/);
  });

  it("makes the page inert, focuses the title, traps Tab, and returns focus to the trigger", () => {
    expect(source).toContain('background.forEach((element) => element.setAttribute("inert", ""));');
    expect(source).toContain("sheetTitleRef.current?.focus();");
    expect(source).toContain("keepTabInside(sheetPanelRef.current, event);");
    expect(source).toContain("trigger?.focus({ preventScroll: true });");
  });
});
