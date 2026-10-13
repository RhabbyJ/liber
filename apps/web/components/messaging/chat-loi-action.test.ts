import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import ts from "typescript";
import { describe, expect, it } from "vitest";
import type { MessagingLoiSummary } from "../../lib/messaging-loi-summary";

const component = { exports: {} as { ChatLoiAction: typeof import("./chat-loi-action")["ChatLoiAction"] } };
const nodeRequire = createRequire(import.meta.url);
const compiled = ts.transpileModule(readFileSync(path.resolve("components/messaging/chat-loi-action.tsx"), "utf8"), {
  compilerOptions: { jsx: ts.JsxEmit.ReactJSX, module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
}).outputText;
new Function("require", "exports", compiled)((id: string) => id.endsWith(".css") ? {} : id === "../icon" ? { Icon: () => null } : nodeRequire(id), component.exports);
const render = (loi: MessagingLoiSummary) => renderToStaticMarkup(createElement(component.exports.ChatLoiAction, { loi, busy: false, onStart: () => undefined }));

describe("chat completed LOI access", () => {
  const id = "10000000-0000-4000-8000-000000000001";
  it("links directly to final read-only terms", () => {
    const html = render({ available: true, id, status: "TERMS_ALIGNED" });
    expect(html).toContain("Completed LOI");
    expect(html).toContain("Both parties can view the final terms. This LOI is read-only.");
    expect(html).toContain("View completed LOI");
    expect(html).toContain(`href="/negotiations/${id}"`);
    expect(html).not.toContain("Continue your proposal");
  });
  it("preserves open and start actions before completion", () => {
    expect(render({ available: true, id, status: "AWAITING_SELLER_RESPONSE" })).toContain("Open LOI");
    expect(render({ available: true, canCreate: true, status: null })).toContain("Start LOI");
    expect(render({ available: false })).toBe("");
  });
});
