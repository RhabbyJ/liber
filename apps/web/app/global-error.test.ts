import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

// The Vitest setup keeps JSX untransformed (tsconfig "jsx": "preserve"), so the
// fallback's contract is checked from its source; `next build` compiles it.
const source = readFileSync(path.resolve("app/global-error.tsx"), "utf8");

describe("global error fallback", () => {
  it("is a client boundary that renders its own branded document", () => {
    expect(source.trimStart().startsWith('"use client";')).toBe(true);
    expect(source).toContain('<html lang="en">');
    expect(source).toContain("<body style={styles.body}>");
    expect(source).toContain("<title>Something went wrong · Liber</title>");
    expect(source).toContain("<span style={styles.wordmark}>Liber</span>");
    expect(source).toContain("onClick={retry}");
  });

  it("shows only the digest reference, never the error message", () => {
    expect(source).toContain("Support reference: {digest}");
    expect(source).not.toMatch(/error\.message|error\.stack/);
  });

  it("loads no browser error SDK, stylesheet, or external asset", () => {
    expect(source).not.toContain("@sentry");
    expect(source).not.toMatch(/import\s+["'][^"']+\.css["']/);
    expect(source).not.toMatch(/https?:\/\//);
  });
});
