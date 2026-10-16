import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

// WCAG 2.4.2: every route needs its own <title>, not one shared by the whole site.
// Pages are .tsx (JSX is preserved for Next), so these checks read the route sources.
const source = (file: string) => readFileSync(path.resolve("app", file), "utf8");

describe("page titles", () => {
  it("templates child page titles from the root layout", () => {
    const layout = source("layout.tsx");
    expect(layout).toContain('template: "%s · Liber"');
    expect(layout).toContain('default: "Liber — A buyer-first real estate marketplace"');
  });

  it.each([
    ["login/page.tsx", 'title: "Log in"'],
    ["signup/page.tsx", 'title: "Create account"'],
    ["signup/verify/page.tsx", 'title: "Confirm your email"'],
    ["profile/page.tsx", 'title: "Your profile"'],
    ["forgot-password/page.tsx", 'title: status === "sent" ? "Check your email" : "Reset your password"'],
    ["reset-password/page.tsx", 'title: canReset ? "Choose a new password" : "Reset link expired"'],
  ])("%s declares its own title", (file, title) => {
    const page = source(file);
    expect(page).toMatch(/export (const metadata: Metadata =|async function generateMetadata\()/);
    expect(page).toContain(title);
  });

  // The root page and root not-found share the layout's segment, where the template does not apply.
  it("writes out the full title for root-segment routes", () => {
    expect(source("not-found.tsx")).toContain('title: { absolute: "Page not available · Liber" }');
    const home = source("page.tsx");
    expect(home).toContain("export async function generateMetadata(");
    expect(home).toContain("title: { absolute: `${area ? serviceAreaDisplayLabel(area) : market.label} buyer demand · Liber` }");
  });
});
