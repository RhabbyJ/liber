import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import ts from "typescript";
import { describe, expect, it } from "vitest";
import * as validators from "@liber/validators";
import { calculateLoiSummary, loiComputedSummaryV1Schema, type LoiComputedSummary, type LoiTermsV1 } from "@liber/validators";
import * as editorValues from "./loi-editor-values";
import { loiFeeBreakdown } from "./loi-fee-breakdown";
import { formatLoiMoney } from "./loi-presentation";
import { parseSellerLoanPayoff, sellerNetProceeds } from "./loi-seller-proceeds-values";
import { extractLoiTemplateTerms } from "./loi-template-values";
import { cashTerms } from "./loi-test-fixtures.test-helper";

const terms: LoiTermsV1 = { ...cashTerms, costsAndCredits: { ...cashTerms.costsAndCredits, closingCostEstimates: { buyerEscrowCents: 0, sellerEscrowCents: 100_00, buyerTitleInsuranceCents: 0, sellerTitleInsuranceCents: 200_00, buyerOtherClosingCostsCents: 0, sellerOtherClosingCostsCents: null, sellerAgentCommissionAmount: "0", note: "Synthetic" } } };

function renderProceeds(payoff: string, summary: LoiComputedSummary | null = calculateLoiSummary(terms), displayedTerms = terms, compact = false, breakdown = false) {
  // Render the real component with its private input state supplied explicitly.
  // This exercises blank, invalid, and known payoff UI without a real deal or DOM.
  const source = readFileSync(path.resolve("components/loi/loi-seller-proceeds.tsx"), "utf8");
  const compiled = ts.transpileModule(source, { compilerOptions: { jsx: ts.JsxEmit.ReactJSX, module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const exports: Record<string, (props: { terms: LoiTermsV1; summary: LoiComputedSummary | null; payoff?: string; showDetails?: boolean }) => React.ReactNode> = {};
  const nodeRequire = createRequire(import.meta.url);
  const requireModule = (id: string) => id === "react" ? { ...React, useState: () => [payoff, () => undefined] }
    : id === "./loi-fee-breakdown" ? { loiFeeBreakdown }
    : id === "./loi-presentation" ? { formatLoiMoney }
    : id === "./loi-seller-proceeds-values" ? { parseSellerLoanPayoff, sellerNetProceeds }
    : id === "@liber/validators" ? validators
    : id === "./loi-editor-values" ? editorValues
    : nodeRequire(id);
  new Function("require", "exports", compiled)(requireModule, exports);
  return renderToStaticMarkup(React.createElement(breakdown ? exports.LoiSellerProceedsBreakdown : exports.LoiSellerProceeds, { terms: displayedTerms, summary, payoff, showDetails: !compact }));
}

describe("private seller loan payoff and proceeds", () => {
  it("keeps the compact seller total and bottom fee ledger consistent with one payoff", () => {
    const summary = calculateLoiSummary(terms);
    for (const payoff of ["0", "600000", "1000000"]) {
      const compact = renderProceeds(payoff, summary, terms, true);
      const breakdown = renderProceeds(payoff, summary, terms, false, true);
      const expected = formatLoiMoney(sellerNetProceeds(summary, parseSellerLoanPayoff(payoff).cents));
      expect(compact).toContain(expected);
      expect(breakdown).toContain(expected);
      expect(compact).toContain("Seller loan payoff");
      expect(compact).not.toContain("Escrow fees");
      expect(breakdown).not.toContain("<input");
      for (const row of loiFeeBreakdown(terms, summary)) expect(breakdown).toContain(row.label);
    }
    expect(renderProceeds("-1", summary, terms, false, true)).toContain("Check payoff");
    expect(renderProceeds("600000", null, terms, false, true)).toContain("Not calculated");
  });
  it.each([["", null], ["   ", null], ["0", 0], ["0.00", 0], ["600000", 60_000_000], [" $600,000.25 ", 60_000_025], ["100000000", 10_000_000_000], ["2.5", 250]] as const)("parses %j without treating unknown payoff as zero", (value, cents) => {
    expect(parseSellerLoanPayoff(value)).toEqual({ cents, error: null });
  });

  it.each(["-1", "1e6", "1.001", "Infinity", "NaN", "100000000.01", "99999999999999999999999", "1 000", "no loan"])("rejects invalid or out-of-range payoff %j", (value) => {
    expect(parseSellerLoanPayoff(value).cents).toBeNull();
    expect(parseSellerLoanPayoff(value).error).toBeTruthy();
  });

  it("subtracts payoff without changing buyer totals, terms, or reusable templates", () => {
    const summary = calculateLoiSummary(terms);
    const originalSummary = JSON.stringify(summary);
    const originalTerms = JSON.stringify(terms);
    const originalTemplate = JSON.stringify(extractLoiTemplateTerms(terms));
    expect(sellerNetProceeds(summary, 60_000_000)).toBe(summary.sellerCashBeforePayoffsCents - 60_000_000);
    expect(sellerNetProceeds(summary, null)).toBeNull();
    expect(sellerNetProceeds(summary, 0)).toBe(summary.sellerCashBeforePayoffsCents);
    expect(sellerNetProceeds(summary, 110_000_000)).toBeLessThan(0);
    expect(JSON.stringify(summary)).toBe(originalSummary);
    expect(JSON.stringify(terms)).toBe(originalTerms);
    expect(JSON.stringify(extractLoiTemplateTerms(terms))).toBe(originalTemplate);
    expect(originalTemplate).not.toMatch(/payoff|netProceeds/i);
  });

  it("does not double-subtract seller-financed principal", () => {
    const sellerFinanced: LoiTermsV1 = { ...terms, funding: { type: "SELLER_FINANCING", principalCents: 80_000_000, cashDownPaymentCents: 20_000_000, annualInterestBps: 600, amortizationMonths: 360, termMonths: 360, balloonMonth: null, interestOnly: false, note: "" } };
    const summary = calculateLoiSummary(sellerFinanced);
    expect(sellerNetProceeds(summary, 5_000_000)).toBe(20_000_000 - summary.sellerClosingCostsCents - 5_000_000);
    const html = renderProceeds("50000", summary, sellerFinanced);
    expect(html).toContain("Seller-financed principal");
    expect(html).toContain(formatLoiMoney(sellerNetProceeds(summary, 5_000_000)));
  });

  it("renders all fee deductions with net proceeds as the final number and a private mobile-friendly input", () => {
    const summary = calculateLoiSummary(terms);
    const html = renderProceeds("600000", summary);
    expect(html).toContain("Seller loan payoff");
    expect(html).toContain('inputMode="decimal"');
    expect(html).toContain('type="text"');
    expect(html).toContain("This private estimate is not sent to the buyer and resets on refresh.");
    expect(html).toContain("Not estimated");
    expect(html).toContain("Estimate incomplete: unknown fees are excluded.");
    for (const row of loiFeeBreakdown(terms, summary)) expect(html).toContain(row.label);
    const finalList = html.slice(html.lastIndexOf('<dl class="loi-summary-list"'));
    expect(finalList).toContain('aria-live="polite"');
    expect(finalList).toContain("Net proceeds");
    expect(finalList).toContain(formatLoiMoney(sellerNetProceeds(summary, 60_000_000)));
    expect(finalList).not.toContain("Seller loan payoff");
  });

  it("distinguishes blank payoff, explicit zero, and invalid input in final proceeds", () => {
    expect(renderProceeds("")).toContain("Enter payoff");
    expect(renderProceeds("0")).not.toContain("Enter payoff</strong>");
    expect(renderProceeds("0")).toContain(formatLoiMoney(calculateLoiSummary(terms).sellerCashBeforePayoffsCents));
    expect(renderProceeds("-1")).toContain("Check payoff");
    expect(renderProceeds("-1")).toContain('aria-invalid="true"');
  });

  it("preserves historical V1 limitations instead of inventing proceeds", () => {
    const current = calculateLoiSummary(terms);
    const historical = loiComputedSummaryV1Schema.parse(Object.fromEntries(Object.keys(loiComputedSummaryV1Schema.shape).map((key) => [key, key === "calculationVersion" ? 1 : current[key as keyof typeof current]])));
    expect(sellerNetProceeds(historical, 0)).toBeNull();
    const html = renderProceeds("600000", historical);
    expect(html).toContain("Closing costs and seller proceeds were not calculated in this historical version.");
    expect(html).toContain("Not calculated");
    expect(html).not.toContain("Escrow fees");
  });

  it("retains private payoff input while draft fields are invalid, without presenting a stale total", () => {
    expect(sellerNetProceeds(null, 60_000_000)).toBeNull();
    const html = renderProceeds("600000", null);
    expect(html).toContain('value="600000"');
    expect(html).toContain("Complete valid financial fields to see your proceeds.");
    expect(html).toContain("Not calculated");
    expect(html).not.toContain("Escrow fees");
  });

  it("renders the private calculator only inside the seller gate and resets it between negotiations", () => {
    const source = readFileSync(path.resolve("components/loi/loi-workspace.tsx"), "utf8");
    const parsed = ts.createSourceFile("workspace.tsx", source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
    const instances: ts.JsxSelfClosingElement[] = [];
    function visit(node: ts.Node) {
      if (ts.isJsxSelfClosingElement(node) && node.tagName.getText(parsed) === "LoiSellerProceeds") instances.push(node);
      ts.forEachChild(node, visit);
    }
    visit(parsed);
    expect(instances).toHaveLength(1);
    const instance = instances[0];
    expect(ts.isConditionalExpression(instance.parent)).toBe(true);
    if (!ts.isConditionalExpression(instance.parent)) throw new Error("Seller calculator requires a conditional gate");
    expect(instance.parent.condition.getText(parsed)).toBe('negotiation.viewerRole === "SELLER" && sidebarTerms');
    expect(instance.attributes.getText(parsed)).toContain("key={negotiation.id}");
    expect(instance.attributes.getText(parsed)).toContain("summary={sidebarSummary}");
    expect(instance.attributes.getText(parsed)).toContain("terms={sidebarTerms}");
  });
});
