import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import ts from "typescript";
import { describe, expect, it } from "vitest";
import type { BuyerVerificationDocument } from "../server/verification/buyer-documents";

// Next preserves JSX; compile the presentational component for actual SSR assertions.
const componentModule = { exports: {} as { BuyerVerificationDocuments: typeof import("./buyer-verification-documents")["BuyerVerificationDocuments"] } };
const compiled = ts.transpileModule(readFileSync(path.resolve("components/buyer-verification-documents.tsx"), "utf8"), {
  compilerOptions: { jsx: ts.JsxEmit.ReactJSX, module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;
new Function("require", "exports", compiled)(createRequire(import.meta.url), componentModule.exports);
const { BuyerVerificationDocuments } = componentModule.exports;

const document: BuyerVerificationDocument = {
  id: "test-document",
  documentType: "PRE_APPROVAL",
  originalFilename: "letter.pdf",
  createdAt: "2026-09-29T09:30:00.000Z",
  reviewStatus: "PENDING",
  rejectionReason: null,
};
const render = (documents: BuyerVerificationDocument[]) => renderToStaticMarkup(createElement(BuyerVerificationDocuments, { documents }));

describe("buyer submitted-document status", () => {
  it("explains that pending documents have already been submitted and need no second button", () => {
    const html = render([document]);
    expect(html).toContain("Awaiting review");
    expect(html).toContain("No further submission is needed.");
    expect(html).toContain('dateTime="2026-09-29T09:30:00.000Z"');
    expect(html).not.toContain("<button");
    expect(html).not.toContain("<form");
  });

  it("distinguishes approved evidence from the separate matching badge decision", () => {
    const html = render([{ ...document, reviewStatus: "APPROVED" }]);
    expect(html).toContain("Approved");
    expect(html).toContain("An admin can use it to grant the matching badge");
    expect(html).not.toContain("Upload a replacement");
  });

  it("safely displays owner rejection feedback and links to replacement upload without deletion", () => {
    const html = render([{
      ...document,
      originalFilename: "<script>filename</script>.pdf",
      reviewStatus: "REJECTED",
      rejectionReason: "Upload a newer letter <script>alert(1)</script>",
    }]);
    expect(html).toContain("Rejected");
    expect(html).toContain("&lt;script&gt;filename&lt;/script&gt;.pdf");
    expect(html).toContain("Upload a newer letter &lt;script&gt;alert(1)&lt;/script&gt;");
    expect(html).toContain('href="#verification-upload"');
    expect(html).not.toContain("<script>");
    expect(html).not.toContain("Delete");
  });

  it("shows a helpful first-upload empty state", () => {
    expect(render([])).toContain("No documents submitted yet. Upload a document above to send it for review.");
  });
});
