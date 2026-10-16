import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { createElement, isValidElement, type ReactElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import ts from "typescript";
import { describe, expect, it, vi } from "vitest";

type ErrorPageProps = { error: unknown; retry: () => void };

const errorModule = { exports: {} as { default: (props: ErrorPageProps) => ReactElement } };
const compiled = ts.transpileModule(readFileSync(path.resolve("app/error.tsx"), "utf8"), {
  compilerOptions: { esModuleInterop: true, jsx: ts.JsxEmit.ReactJSX, module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;
new Function("require", "exports", compiled)(createRequire(import.meta.url), errorModule.exports);
const ErrorPage = errorModule.exports.default;

function findButton(node: ReactNode): ReactElement<{ onClick: () => void }> | null {
  if (!isValidElement<{ children?: ReactNode }>(node)) return null;
  if (node.type === "button") return node as ReactElement<{ onClick: () => void }>;
  const children = Array.isArray(node.props.children) ? node.props.children : [node.props.children];
  for (const child of children) {
    const button = findButton(child);
    if (button) return button;
  }
  return null;
}

describe("route error boundary", () => {
  it("retries by refetching through Next's retry, not the render-only reset", () => {
    const retry = vi.fn();
    findButton(ErrorPage({ error: new Error("boom"), retry }))?.props.onClick();

    expect(retry).toHaveBeenCalledTimes(1);
  });

  it("shows a server error digest as the support reference", () => {
    const error = Object.assign(new Error("Server Components render error"), { digest: "1234567890" });
    const markup = renderToStaticMarkup(createElement(ErrorPage, { error, retry: () => undefined }));

    expect(markup).toContain("Support reference: 1234567890");
    expect(markup).not.toContain("Server Components render error");
  });

  it.each([null, "a thrown string", { digest: 42 }])("renders without a reference when %j is thrown", (thrown) => {
    const markup = renderToStaticMarkup(createElement(ErrorPage, { error: thrown, retry: () => undefined }));

    expect(markup).toContain("Something went wrong");
    expect(markup).not.toContain("Support reference");
  });
});
