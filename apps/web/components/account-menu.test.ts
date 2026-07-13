import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

describe("account menu", () => {
  it("uses the account avatar and exposes only profile and POST sign out actions", () => {
    const source = readFileSync(path.resolve("components/account-menu.tsx"), "utf8");

    expect(source).toContain("<GeneratedAvatar");
    expect(source).toContain("Your profile");
    expect(source).toContain('action="/logout" method="post"');
    expect(source).toContain("Sign out");
    expect(source).toContain('role="menu"');
    expect(source).not.toContain('href="/logout"');
  });
});
