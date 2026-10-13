import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import ts from "typescript";
import { describe, expect, it } from "vitest";
import * as avatarVariant from "../lib/avatar-variant";
import { publicIdentityInitials } from "../lib/public-identity";

const nativeRequire = createRequire(import.meta.url);
const compiled = ts.transpileModule(readFileSync(path.resolve("components/generated-avatar.tsx"), "utf8"), {
  compilerOptions: { jsx: ts.JsxEmit.ReactJSX, module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;
const mocks: Record<string, unknown> = {
  "../lib/avatar-variant": avatarVariant,
  "./icon": { Icon: () => createElement("span", { "data-icon": "user" }) },
};
const avatarModule: { GeneratedAvatar?: typeof import("./generated-avatar").GeneratedAvatar } = {};
new Function("require", "exports", compiled)((id: string) => mocks[id] ?? nativeRequire(id), avatarModule);

function render(name: string, variant = "avatarka:animals:3") {
  return renderToStaticMarkup(createElement(avatarModule.GeneratedAvatar!, { name, seed: "account", variant }));
}

describe("initials avatars", () => {
  it("renders only initials without surname, identifier, or remote image requests", () => {
    const html = render("Julie P. #ABCDEF123456");
    expect(html).toContain(">JP</span>");
    expect(html).not.toContain("ABCDEF123456");
    expect(html).not.toContain("<img");
    expect(html).toBe(render("Julie P. #ABCDEF123456"));
  });

  it("draws the same grapheme initials that the accessible label announces", () => {
    expect(publicIdentityInitials("राहुल सिं. #ABCDEF123456")).toBe("रासिं");
    expect(render("राहुल सिं. #ABCDEF123456")).toContain(">रासिं</span>");
  });

  it("color selection preserves initials", () => {
    expect(render("Julie P.", "avatarka:animals:0")).not.toBe(render("Julie P.", "avatarka:animals:1"));
    expect(render("Julie P.", "avatarka:animals:1")).toContain(">JP</span>");
  });
});
