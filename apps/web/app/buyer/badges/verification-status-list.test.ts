import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import ts from "typescript";
import { describe, expect, it } from "vitest";
import type { BuyerVerificationDocument } from "../../../server/verification/buyer-documents";

// Next preserves JSX; compile the presentational component and stub the icon for SSR assertions.
const nativeRequire = createRequire(import.meta.url);
const compiled = ts.transpileModule(readFileSync(path.resolve("app/buyer/badges/verification-status-list.tsx"), "utf8"), {
  compilerOptions: { jsx: ts.JsxEmit.ReactJSX, module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;
const loaded = { exports: {} as { VerificationStatusList: typeof import("./verification-status-list")["VerificationStatusList"] } };
const icon = { Icon: ({ name }: { name: string }) => createElement("span", { "data-icon": name }) };
new Function("require", "exports", compiled)((id: string) => id === "../../../components/icon" ? icon : nativeRequire(id), loaded.exports);
const { VerificationStatusList } = loaded.exports;

type Badge = Parameters<typeof VerificationStatusList>[0]["badges"][number];
const document = (overrides: Partial<BuyerVerificationDocument>): BuyerVerificationDocument => ({
  createdAt: "2026-10-01T00:00:00.000Z",
  documentType: "PRE_APPROVAL",
  id: "synthetic-document",
  originalFilename: "synthetic.pdf",
  rejectionReason: null,
  reviewStatus: "PENDING",
  ...overrides,
});
const render = (badges: Badge[], documents: BuyerVerificationDocument[] = []) =>
  renderToStaticMarkup(createElement(VerificationStatusList, { badges, documents }));
const row = (html: string, title: string) => html.split("<li").find((item) => item.includes(`<strong>${title}</strong>`)) ?? "";

describe("buyer verification status rows", () => {
  it("never gives a test pre-approval the verified look", () => {
    const html = render([{ label: "Test pre-approval — not verified", status: "active", type: "TEST_PRE_APPROVED" }]);
    const test = row(html, "Test pre-approval");
    expect(test).toContain("Not verified");
    expect(test).toContain('data-icon="info"');
    expect(test).not.toContain("check-shield");
    expect(test).not.toContain("status-tag active");
    expect(row(html, "Pre-approval")).toContain("Not started");
  });

  it("marks only active evidence-backed badges as verified", () => {
    const html = render([{ expiresInDays: 30, label: "Pre-approved", status: "active", type: "PRE_APPROVED" }]);
    expect(row(html, "Pre-approval")).toContain("Verified");
    expect(row(html, "Pre-approval")).toContain("Expires in 30 days.");
    expect(row(html, "Pre-approval")).toContain('data-icon="check-shield"');
    expect(row(html, "Identity")).toContain("Not started");
  });

  it("does not report an expired badge's old approved document as a pending decision", () => {
    const html = render(
      [{ expiresInDays: -2, label: "Pre-approved", status: "expired", type: "PRE_APPROVED" }],
      [document({ reviewStatus: "APPROVED" })],
    );
    expect(row(html, "Pre-approval")).toContain("Expired");
    expect(row(html, "Pre-approval")).toContain('href="#verification-upload"');
  });

  it("shows review and rejection states from the latest submitted document", () => {
    const html = render([], [
      document({ documentType: "VERIFIED_FUNDS", reviewStatus: "PENDING" }),
      document({ documentType: "IDENTITY", reviewStatus: "REJECTED" }),
      document({ documentType: "PRE_APPROVAL", reviewStatus: "APPROVED" }),
    ]);
    expect(row(html, "Proof of funds")).toContain("In review");
    expect(row(html, "Identity")).toContain("Not approved");
    expect(row(html, "Pre-approval")).toContain("Badge decision pending.");
  });
});
