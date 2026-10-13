import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import ts from "typescript";
import { describe, expect, it } from "vitest";
import { publicNamePreview } from "../lib/public-identity";

const read = (file: string) => readFileSync(path.resolve(file), "utf8");

function renderIdentityPreview(name: string) {
  const source = read("components/signup-form.tsx");
  const parsed = ts.createSourceFile("signup-form.tsx", source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const preview = parsed.statements.find((statement) => ts.isFunctionDeclaration(statement) && statement.name?.text === "SignupIdentityPreview");
  if (!preview) throw new Error("Missing signup identity preview");
  const compiled = ts.transpileModule(`export ${preview.getText(parsed)}`, {
    compilerOptions: { jsx: ts.JsxEmit.ReactJSX, module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const exports: { SignupIdentityPreview?: (props: { name: string }) => ReturnType<typeof createElement> } = {};
  const avatarInputs: Array<{ name: string | null; seed: string }> = [];
  const avatar = (props: { name: string | null; seed: string; alt: string }) => {
    avatarInputs.push({ name: props.name, seed: props.seed });
    return createElement("span", { "aria-label": props.alt });
  };
  new Function("require", "exports", "publicNamePreview", "GeneratedAvatar", compiled)(createRequire(import.meta.url), exports, publicNamePreview, avatar);
  return { html: renderToStaticMarkup(createElement(exports.SignupIdentityPreview!, { name })), avatarInputs };
}

describe("signup public identity preview", () => {
  it.each([
    ["Robert Jones", "Robert J."],
    ["Élodie D’Arcy", "Élodie D."],
    ["李 王强", "李 王."],
    ["राहुल सिंह", "राहुल सिं."],
  ])("previews %s without passing the full name to the avatar", (name, publicName) => {
    const { html, avatarInputs } = renderIdentityPreview(name);
    expect(html).toContain(publicName);
    expect(html).not.toContain(name);
    expect(html).toContain("Code assigned at signup");
    expect(avatarInputs).toEqual([{ name: publicName, seed: publicName }]);
  });

  it.each(["", "Robert", "Robert #admin"])("does not fabricate a public name or uniqueness code for %s", (name) => {
    const { html, avatarInputs } = renderIdentityPreview(name);
    expect(html).toContain("Your public identity");
    expect(html).toContain("Code assigned at signup");
    expect(html).not.toMatch(/#[A-Z0-9]{4,}/);
    expect(avatarInputs).toEqual([{ name: null, seed: "signup" }]);
  });
});

describe("signup form", () => {
  it("keeps React as the only signup state owner", () => {
    const source = read("components/signup-form.tsx");

    expect(source).not.toContain("dangerouslySetInnerHTML");
    expect(source).not.toMatch(/\.addEventListener\(/);
    expect(source).toContain("onSubmit={handleSubmit}");
  });

  it("asks for buyer, seller, or both once, inline, and keeps a URL-prefilled role selected", () => {
    const source = read("components/signup-form.tsx");

    expect(source).toContain("How will you use Liber?");
    expect(source).toContain('const [role, setRole] = useState<Role>(initialRole ?? "buyer")');
    expect(source.match(/name="role"/g)).toHaveLength(1);
    expect(source).toContain("Publish demand sellers can find and invite.");
  });

  it("submits the unchanged account fields through the signup server action", () => {
    const source = read("components/signup-form.tsx");

    expect(source).toContain("action={signupWithPassword}");
    expect(source).toContain('name="name"');
    expect(source).toContain('name="email"');
    expect(source).toContain('name="password"');
    expect(source).toContain('name="next"');
    expect(source).toContain("12+ characters");
  });

  it("renders log in, signup, and email confirmation on the shared split auth page", () => {
    expect(read("app/signup/signup-view.tsx")).toContain('<AuthShell title="Create account">');
    expect(read("app/login/login-view.tsx")).toContain('<AuthShell context={context} title="Log in">');
    expect(read("app/signup/verify/page.tsx")).toContain("<AuthShell");
  });

  it("keeps password login on the single native API post", () => {
    const loginForm = read("components/login-form.tsx");

    expect(loginForm).toContain('action="/api/auth/login"');
    expect(loginForm).toContain('method="post"');
    expect(loginForm).not.toContain("fetch(");
    expect(loginForm).not.toContain("signInWithPassword");
    expect(loginForm).not.toContain("server/");
  });

  it("reveals the password step on the client without asking whether an account exists", () => {
    const loginForm = read("components/login-form.tsx");

    expect(loginForm).toContain('setStep("password")');
    expect(loginForm).not.toMatch(/\/api\/(auth|users?)\/(exists|lookup|check)/);
  });
});
