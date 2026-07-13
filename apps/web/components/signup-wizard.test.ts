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
    expect(source).toContain("onKeyDown={handleKeyDown}");
  });

  it("starts role-prefilled buyer and seller entries on step one", () => {
    const source = readFileSync(path.resolve("components/signup-wizard.tsx"), "utf8");

    expect(source).toContain("const startingStep = initialStep ?? 0;");
    expect(source).not.toContain("initialRole ? 1 : 0");
    expect(source).toContain('const [role, setRole] = useState<Role>(initialRole ?? "buyer")');
  });
});
