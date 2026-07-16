import { readFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";

describe("LOI workspace rendered contract", () => {
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
    const source = await readFile(path.resolve("components/loi/loi-workspace.tsx"), "utf8");
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
