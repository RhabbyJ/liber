import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

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

  it("uses original inline graphics instead of generic buyer and seller icons", () => {
    const wizard = readFileSync(path.resolve("components/signup-wizard.tsx"), "utf8");
    const illustration = readFileSync(path.resolve("components/signup-illustration.tsx"), "utf8");

    expect(wizard).toContain("SignupHeroIllustration");
    expect(wizard).toContain("SignupRoleIllustration");
    expect(illustration).toContain('viewBox="0 0 220 128"');
    expect(illustration).toContain('viewBox="0 0 66 48"');
  });
});
