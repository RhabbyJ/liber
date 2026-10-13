import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import ts from "typescript";
import { describe, expect, it } from "vitest";
import { publicNamePreview } from "../lib/public-identity";

function renderIdentityPreview(name: string) {
  const source = readFileSync(path.resolve("components/signup-wizard.tsx"), "utf8");
  const parsed = ts.createSourceFile("signup-wizard.tsx", source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
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

describe("signup wizard interaction ownership", () => {
  it("keeps React as the only signup state-machine owner", () => {
    const source = readFileSync(path.resolve("components/signup-wizard.tsx"), "utf8");

    expect(source).not.toContain("SIGNUP_WIZARD_FALLBACK");
    expect(source).not.toContain("dangerouslySetInnerHTML");
    expect(source).not.toMatch(/\.addEventListener\(/);
    expect(source).toContain("onSubmit={handleSubmit}");
    expect(source).not.toContain("onKeyDown={handleKeyDown}");
    expect(source).not.toContain("function handleKeyDown");
  });

  it("starts role-prefilled buyer and seller entries on step one", () => {
    const source = readFileSync(path.resolve("components/signup-wizard.tsx"), "utf8");

    expect(source).toContain("const startingStep = initialStep ?? 0;");
    expect(source).not.toContain("initialRole ? 1 : 0");
    expect(source).toContain('const [role, setRole] = useState<Role>(initialRole ?? "buyer")');
  });

  it("uses two clear UI steps without changing the submitted account fields", () => {
    const wizard = readFileSync(path.resolve("components/signup-wizard.tsx"), "utf8");
    const page = readFileSync(path.resolve("app/signup/page.tsx"), "utf8");

    expect(wizard).toContain("const total = 2;");
    expect(wizard).toContain("How will you use Liber?");
    expect(wizard).toContain("Create your account");
    expect(wizard).toContain('name="name"');
    expect(wizard).toContain('name="email"');
    expect(wizard).toContain('name="password"');
    expect(wizard).not.toContain("STEP_LABELS");
    expect(wizard).not.toContain("signup-summary");
    expect(page).toContain('notice && status !== "invalid-role" ? 1 : 0');
    expect(page).not.toContain("parseStep(step)");
  });

  it("uses the generated flow artwork instead of generic buyer and seller icons", () => {
    const wizard = readFileSync(path.resolve("components/signup-wizard.tsx"), "utf8");
    const illustration = readFileSync(path.resolve("components/signup-illustration.tsx"), "utf8");

    expect(wizard).toContain("SignupHeroIllustration");
    expect(wizard).toContain("SignupRoleIllustration");
    expect(wizard).toContain("Publish demand sellers can find");
    expect(wizard).toContain("signup-steps");
    expect(illustration).toContain('src="/images/flows/signup-hero-2d.webp"');
    expect(illustration).toContain("roleArtwork[role]");
    expect(illustration).not.toContain("<svg");
  });
});
