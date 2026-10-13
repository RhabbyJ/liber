import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import ts from "typescript";
import { describe, expect, it } from "vitest";
import * as values from "./buyer-budget-values";

const component = { exports: {} as { BuyerBudgetRange: typeof import("./buyer-budget-range")["BuyerBudgetRange"] } };
const compiled = ts.transpileModule(readFileSync(path.resolve("components/buyer-budget-range.tsx"), "utf8"), { compilerOptions: { jsx: ts.JsxEmit.ReactJSX, module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText;
const nodeRequire = createRequire(import.meta.url);
new Function("require", "exports", compiled)((id: string) => id.endsWith(".css") ? {} : id === "./buyer-budget-values" ? values : nodeRequire(id), component.exports);
const render = (defaultMin: string, defaultMax: string) => renderToStaticMarkup(createElement(component.exports.BuyerBudgetRange, { defaultMin, defaultMax }));
// Static rendering cannot focus inputs, so seed the component's [minimum, maximum, typing] state directly.
const renderState = (state: [string, string, boolean]) => {
  const seeded = { exports: {} as typeof component.exports };
  const react = nodeRequire("react") as typeof import("react");
  const useState = (initial: unknown) => [state.length ? state.shift() : initial, () => undefined];
  new Function("require", "exports", compiled)((id: string) => id.endsWith(".css") ? {} : id === "./buyer-budget-values" ? values : id === "react" ? { ...react, useState } : nodeRequire(id), seeded.exports);
  return renderToStaticMarkup(createElement(seeded.exports.BuyerBudgetRange, { defaultMin: "", defaultMax: "" }));
};

describe("buyer budget slider", () => {
  it("uses Zillow's 57 progressive price stops", () => {
    const stops = values.BUYER_BUDGET_STOPS;
    expect(stops).toHaveLength(57);
    for (const [price, next] of [[0, 50000], [50000, 75000], [475000, 500000], [500000, 550000], [1000000, 1100000], [2000000, 2250000], [5000000, 6000000]]) expect(stops[stops.indexOf(price) + 1]).toBe(next);
    expect(stops.at(-1)).toBe(10000000);
  });
  it("does not fabricate amounts for new blank budgets or submit slider indices", () => {
    const html = render("", "");
    expect(html).toContain("Choose your price range");
    expect(html.match(/name="budgetMin"/g)).toHaveLength(1);
    expect(html.match(/name="budgetMax"/g)).toHaveLength(1);
    expect(html).toMatch(/name="budgetMin"[^>]*value=""/);
    expect(html).toMatch(/name="budgetMax"[^>]*value=""/);
    expect(html.match(/type="range"/g)).toHaveLength(2);
    expect(html.match(/required=""/g)).toHaveLength(2);
  });
  it("keeps exact custom amounts, including zero, decimals and large budgets", () => {
    for (const [min, max] of [["731249", "987654"], ["0", "500000"], ["100.25", "10000000.75"], ["20000000", "50000000"]]) {
      const html = render(min, max);
      expect(html).toMatch(new RegExp(`name="budgetMin"[^>]*value="${min}"`));
      expect(html).toMatch(new RegExp(`name="budgetMax"[^>]*value="${max}"`));
      expect(html.match(/step="any"/g)).toHaveLength(2);
    }
    expect(values.buyerBudgetStops(20000000, 50000000).at(-1)).toBe(50000000);
  });
  it("clamps only the moved handle without overwriting the opposite custom amount", () => {
    expect(values.moveBuyerBudget(values.BUYER_BUDGET_STOPS, 56, "min", 731249)).toBe(731249);
    expect(values.moveBuyerBudget(values.BUYER_BUDGET_STOPS, 0, "max", 987654)).toBe(987654);
    expect(values.moveBuyerBudget(values.BUYER_BUDGET_STOPS, 1, "min", null)).toBe(50000);
  });
  it("labels both keyboard controls and reports reversed typed ranges", () => {
    const html = render("900000", "500000");
    expect(html).toContain('aria-label="Minimum budget slider"');
    expect(html).toContain('aria-label="Maximum budget slider"');
    expect(html).toContain('aria-valuetext="$900,000"');
    expect(html).toContain('role="alert"');
    expect(html).toContain("Minimum budget must be at or below maximum budget.");
  });
  it("waits until a typed amount is committed before flagging a reversed range", () => {
    // Typing "6" toward a $600,000 maximum must not raise an alert over a $500,000 minimum mid-entry.
    const typing = renderState(["500000", "6", true]);
    expect(typing).not.toContain('role="alert"');
    expect(typing).not.toContain("aria-invalid");
    expect(typing).not.toContain("Minimum budget must be at or below maximum budget.");
    const committed = renderState(["500000", "6", false]);
    expect(committed).toContain('role="alert"');
    expect(committed).toContain('aria-invalid="true"');
    // The handles' aria-valuetext already announces changes; a live summary would repeat every keystroke.
    expect(committed).not.toContain("aria-live");
  });
  it("leaves the form blank when no budget was ever saved instead of fabricating $0 – $0", () => {
    // Profile DTOs report a missing saved budget (or a new profile) as 0.
    expect(values.savedBuyerBudget(0, 0)).toEqual({ max: "", min: "" });
    expect(values.savedBuyerBudget(0, 500000)).toEqual({ max: "500000", min: "0" });
    expect(values.savedBuyerBudget(731249, 987654)).toEqual({ max: "987654", min: "731249" });
    expect(values.savedBuyerBudget(100.25, 10000000.75)).toEqual({ max: "10000000.75", min: "100.25" });
  });
  it.each(["", "-1", "abc", "Infinity", "10000000000"])("treats %s as an unset or invalid amount", (value) => {
    expect(values.readBuyerBudget(value)).toBeNull();
  });
});
