import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import ts from "typescript";
import { describe, expect, it } from "vitest";
import { negotiation, revision } from "./loi-test-fixtures.test-helper";

const component = { exports: {} as { LoiCompletedDownload: typeof import("./loi-completed-download")["LoiCompletedDownload"] } };
const compiled = ts.transpileModule(readFileSync(path.resolve("components/loi/loi-completed-download.tsx"), "utf8"), {
  compilerOptions: { jsx: ts.JsxEmit.ReactJSX, module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
}).outputText;
new Function("require", "exports", compiled)(createRequire(import.meta.url), component.exports);
const render = (data: ReturnType<typeof negotiation>, historical = false) => renderToStaticMarkup(createElement(component.exports.LoiCompletedDownload, { negotiation: data, historical }));

describe("completed LOI download", () => {
  it.each(["BUYER", "SELLER"] as const)("offers the final PDF to %s after alignment", (viewerRole) => {
    const data = negotiation({ status: "TERMS_ALIGNED", viewerRole, currentSequence: 2, revisions: [revision(1), revision(2)] });
    const html = render(data);
    expect(html).toContain("Download PDF");
    expect(html).toContain('download=""');
    expect(html).toContain(`href="/api/loi/negotiations/${data.id}/pdf"`);
    expect(render(data, true)).toBe("");
  });
  it.each(["AWAITING_BUYER_SUBMISSION", "AWAITING_BUYER_RESPONSE", "AWAITING_SELLER_RESPONSE", "DECLINED", "WITHDRAWN", "EXPIRED", "READ_ONLY"])("hides the export for %s", (status) => {
    expect(render(negotiation({ status, revisions: [revision(1)] }))).toBe("");
  });
  it("does not offer an older revision as the final PDF", () => {
    expect(render(negotiation({ status: "TERMS_ALIGNED", currentSequence: 2, revisions: [revision(1)] }))).toBe("");
  });
  it("places the download after the terms, timeline and calculator", () => {
    const workspace = readFileSync(path.resolve("components/loi/loi-workspace.tsx"), "utf8");
    const download = workspace.indexOf("<LoiCompletedDownload");
    expect(download).toBeGreaterThan(workspace.indexOf("<RevisionTimeline"));
    expect(download).toBeGreaterThan(workspace.indexOf("<LoiSellerProceeds"));
    expect(download).toBeLessThan(workspace.indexOf("<LoiActionBar"));
  });
});
