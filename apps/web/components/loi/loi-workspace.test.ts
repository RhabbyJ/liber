import { readFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { createRequire } from "node:module";
import ts from "typescript";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { calculateLoiSummary, loiComputedSummaryV1Schema, loiComputedSummaryV2Schema, loiSideEstimateComplete, loiSummaryFromVersion, type LoiComputedSummary, type LoiTermsV1 } from "@liber/validators";
import { LOI_CLOSING_COST_EXCLUSIONS } from "./loi-editor-values";
import { formatLoiMoney } from "./loi-presentation";
import { loiCashEquations } from "./loi-cash-equation";
import { loiFeeBreakdown } from "./loi-fee-breakdown";
import { cashTerms } from "./loi-test-fixtures.test-helper";

describe("LOI workspace rendered contract", () => {
  async function renderSummary(summary: LoiComputedSummary, terms: LoiTermsV1, viewerRole: "BUYER" | "SELLER", options: { compact?: boolean; detailsOnly?: boolean } = {}) {
    const source = await readFile(path.resolve("components/loi/loi-workspace.tsx"), "utf8");
    const parsed = ts.createSourceFile("workspace.tsx", source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
    const declaration = parsed.statements.find((statement) => ts.isFunctionDeclaration(statement) && statement.name?.text === "Summary")!;
    const compiled = ts.transpileModule("export " + declaration.getText(parsed), { compilerOptions: { jsx: ts.JsxEmit.ReactJSX, module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
    const exports: { Summary?: (props: { summary: LoiComputedSummary; terms: LoiTermsV1; viewerRole: "BUYER" | "SELLER"; compact?: boolean; detailsOnly?: boolean }) => ReturnType<typeof createElement> } = {};
    new Function("require", "exports", "formatLoiMoney", "loiCashEquations", "loiFeeBreakdown", "loiSideEstimateComplete", "loiSummaryFromVersion", "LOI_CLOSING_COST_EXCLUSIONS", compiled)(createRequire(import.meta.url), exports, formatLoiMoney, loiCashEquations, loiFeeBreakdown, loiSideEstimateComplete, loiSummaryFromVersion, LOI_CLOSING_COST_EXCLUSIONS);
    return renderToStaticMarkup(createElement(exports.Summary!, { summary, terms, viewerRole, ...options }));
  }

  it("shows buyer cash/deposit and seller purchase price in their respective compact snapshots", async () => {
    const summary = calculateLoiSummary(cashTerms);
    const buyer = await renderSummary(summary, cashTerms, "BUYER", { compact: true });
    for (const label of ["Estimated total cash needed", "Balance due at closing", "Loan amount", "Earnest-money deposit"]) expect(buyer).toContain(label);
    expect(buyer).toContain('class="loi-cash-callout-amount">' + formatLoiMoney(summary.buyerCashDueAtClosingCents + summary.earnestMoneyCents));
    expect(buyer).toContain("Your deposit is part of this total.");
    const seller = await renderSummary(summary, cashTerms, "SELLER", { compact: true });
    expect(seller).toContain("Purchase price");
    for (const label of ["Buyer cash needed", "Balance due at closing", "Loan amount", "Earnest", "your deposit", "Down payment"]) expect(seller).not.toContain(label);
    for (const html of [buyer, seller]) expect(html).not.toContain("cash calculation");
  });

  it.each(["BUYER", "SELLER"] as const)("renders only %s fee allocations and equation, preserving the stored amounts", async (viewerRole) => {
    const terms: LoiTermsV1 = { ...cashTerms, representation: { ...cashTerms.representation, buyerRepresented: true, agent: { ...cashTerms.representation.agent, name: "Synthetic Agent", email: "agent@example.test" }, commissionAmount: "2%", commissionPayer: "SELLER" }, costsAndCredits: { ...cashTerms.costsAndCredits, closingCostEstimates: { buyerEscrowCents: 100_00, sellerEscrowCents: 200_00, buyerTitleInsuranceCents: 0, sellerTitleInsuranceCents: 300_00, buyerOtherClosingCostsCents: 0, sellerOtherClosingCostsCents: null, sellerAgentCommissionAmount: "3%", note: "Synthetic" } } };
    const summary = calculateLoiSummary(terms);
    const stored = JSON.stringify(summary);
    const html = await renderSummary(summary, terms, viewerRole, { detailsOnly: true });
    for (const row of loiFeeBreakdown(terms, summary)) {
      if (viewerRole === "BUYER" && row.sellerOnly) {
        expect(html).not.toContain("<dt>" + row.label + "</dt>");
        continue;
      }
      const cents = viewerRole === "BUYER" ? row.buyerCents : row.sellerCents;
      expect(html).toContain("<dt>" + row.label + "</dt><dd>" + (cents === null ? "Not estimated" : formatLoiMoney(cents)) + "</dd>");
    }
    expect(html).toContain(viewerRole === "BUYER" ? "Buyer cash calculation" : "Seller cash calculation");
    expect(html).not.toContain(viewerRole === "BUYER" ? "Seller cash calculation" : "Buyer cash calculation");
    expect(html).not.toContain(viewerRole === "BUYER" ? "Seller closing-cost estimate" : "Buyer closing-cost estimate");
    if (viewerRole === "SELLER") expect(html).not.toContain("Down payment");
    if (viewerRole === "BUYER") {
      // The deposit is shown as part of the total, never subtracted from it.
      expect(html).not.toContain("− " + formatLoiMoney(summary.earnestMoneyCents));
      expect(html).toContain("<strong>Estimated total cash needed</strong></dt><dd><strong>= " + formatLoiMoney(summary.buyerCashDueAtClosingCents + summary.earnestMoneyCents) + "</strong>");
      expect(html).toContain("<dt>Earnest-money deposit, paid after acceptance</dt><dd>" + formatLoiMoney(summary.earnestMoneyCents) + "</dd>");
      expect(html).toContain("<dt>Balance due at closing</dt><dd>" + formatLoiMoney(summary.buyerCashDueAtClosingCents) + "</dd>");
    }
    expect(JSON.stringify(summary)).toBe(stored);
  });

  it("preserves historical V1/V2 and negative buyer cash without inventing fees or percentages", async () => {
    const summary = calculateLoiSummary(cashTerms);
    const historical = loiComputedSummaryV2Schema.parse(Object.fromEntries(Object.keys(loiComputedSummaryV2Schema.shape).map((key) => [key, key === "calculationVersion" ? 2 : summary[key as keyof typeof summary]])));
    historical.buyerCashDueAtClosingCents = -123;
    historical.buyerClosingCostsCents = 321;
    const before = JSON.stringify(historical);
    const html = await renderSummary(historical, cashTerms, "BUYER");
    expect(html).toContain('class="loi-cash-callout-amount">$29,998.77');
    expect(html).toContain("-$1.23");
    expect(html).toContain("Stored estimate adjustment");
    expect(html).not.toContain("Home warranty");
    expect(JSON.stringify(historical)).toBe(before);
    const v1 = loiComputedSummaryV1Schema.parse(Object.fromEntries(Object.keys(loiComputedSummaryV1Schema.shape).map((key) => [key, key === "calculationVersion" ? 1 : summary[key as keyof typeof summary]])));
    for (const role of ["BUYER", "SELLER"] as const) {
      expect(await renderSummary(v1, cashTerms, role)).not.toContain("cash-callout");
      expect(await renderSummary(v1, cashTerms, role, { detailsOnly: true })).toContain("Closing costs were not calculated");
    }
  });

  it("keeps party details below the draft and supplies the verified role to snapshots and decisions", async () => {
    const source = await readFile(path.resolve("components/loi/loi-workspace.tsx"), "utf8");
    const section = source.indexOf('className="loi-financial-details stack"');
    expect(section).toBeGreaterThan(source.indexOf('</aside>'));
    expect(section).toBeLessThan(source.indexOf('<LoiCompletedDownload'));
    expect(source).toContain('compact viewerRole={negotiation.viewerRole}');
    expect(source).toContain('terms={current.terms} viewerRole={role}');
    expect(source).toContain('negotiation.viewerRole === "BUYER" ? <section');
    expect(source).toContain('negotiation.viewerRole === "SELLER" && sidebarTerms ? <LoiSellerProceeds');
    expect(source).not.toContain("showSellerCash");
  });
  it("uses canonical view modes, exact-version actions, and native dialog behavior", async () => {
    const source = await readFile(path.resolve("components/loi/loi-workspace.tsx"), "utf8");
    expect(source).toContain('view.mode === "HISTORICAL"');
    expect(source).toContain('view.mode === "REVIEWING"');
    expect(source).toContain("Return to current version");
    expect(source).toContain("showModal()");
    expect(source).toContain("onCancel");
    expect(source).toContain("Exact response deadline");
    expect(source).not.toContain('role="dialog"');
    expect(source).not.toContain("window.confirm");
  });

  it("distinguishes reset, discard, and resume workflows", async () => {
    const source = (await Promise.all(["loi-workspace.tsx", "loi-action-bar.tsx"].map((file) => readFile(path.resolve("components/loi", file), "utf8")))).join("\n");
    expect(source).toContain("Reset initial draft");
    expect(source).toContain("Discard counter draft");
    expect(source).toContain("Resume private draft");
    expect(source).toContain("expectedDraftVersion: view.draftVersion");
    expect(source).toContain("expectedDraftId");
    expect(source).toContain("expectedSequence: negotiation.currentSequence");
  });

  it("exposes every audited and newly approved editor field with constrained controls", async () => {
    const source = await readFile(path.resolve("components/loi/loi-editor.tsx"), "utf8");
    for (const id of [
      "loi-buyer",
      "loi-lender",
      "loi-loan-note",
      "loi-appraisal",
      "loi-loan-contingency",
      "loi-sf-amortization",
      "loi-sf-balloon",
      "loi-rentback-days",
      "loi-tenant-note",
      "loi-agent",
      "loi-warranty-payer",
      "loi-warranty-payer-note",
      "loi-alternate-costs",
      "loi-credit-note",
      "loi-excluded-items",
    ]) expect(source).toContain(id);
    expect(source).toContain('type="email"');
    expect(source).toContain("min={1}");
    expect(source).toContain("max={365}");
    expect(source).toContain("PercentageField");
  });

  it("contains no known LOI mojibake sequences", async () => {
    const files = await Promise.all([
      "components/loi/loi-workspace.tsx",
      "components/loi/loi-editor.tsx",
      "components/loi/loi-presentation.ts",
    ].map((file) => readFile(path.resolve(file), "utf8")));
    for (const source of files) {
      expect(source).not.toMatch(/Ã|â€¦|Â·/);
    }
  });
});
