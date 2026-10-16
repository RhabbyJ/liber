import { describe, expect, it } from "vitest";
import { safeInternalPath } from "./redirect";

const SITE = "https://liber.test";

// What a server reads from `?next=...` after URLSearchParams decodes it once.
function nextParam(rawQueryValue: string) {
  return new URL(`${SITE}/login?next=${rawQueryValue}`).searchParams.get("next");
}

// Each of these resolves off-site, or to a different path, under naive handling.
const HOSTILE_NEXT_VALUES = [
  "/\t/evil.example",
  "/\n/evil.example",
  "/\r/evil.example",
  "/\t\n\r/evil.example",
  "/\0/evil.example",
  "/\u007f/evil.example",
  "\t//evil.example",
  "/\\/evil.example",
  "/\t\\evil.example",
  nextParam("/%09/evil.example"),
  nextParam("/%0A/evil.example"),
  nextParam("/%0d/evil.example"),
  nextParam("%2F%2Fevil.example"),
  nextParam("/%5C/evil.example"),
  nextParam("/%255C/evil.example"),
  nextParam("/%2509/evil.example"),
  "/%09/evil.example",
  "/%0a/evil.example",
  "/%0D/evil.example",
  "/%2F/evil.example",
  "/%2f%2fevil.example",
  "/%5Cevil.example",
  "/.//evil.example",
  "/x/..//evil.example",
  "/./%2F/evil.example",
  "/buyer/%2e%2e/admin",
  "/buyer/.%2E/admin",
];

describe("safeInternalPath", () => {
  it("keeps normal internal paths", () => {
    expect(safeInternalPath("/buyer/profile")).toBe("/buyer/profile");
    expect(safeInternalPath("/login?next=%2Fbuyer%2Fprofile")).toBe("/login?next=%2Fbuyer%2Fprofile");
    expect(safeInternalPath("/?market=los-angeles&area=encino")).toBe("/?market=los-angeles&area=encino");
    expect(safeInternalPath("/buyer/profile#documents")).toBe("/buyer/profile#documents");
  });

  it("falls back for non-internal or malformed paths", () => {
    const encodedBackslash = new URL("https://liber.test/login?next=/%5Cevil.com").searchParams.get("next");

    expect(safeInternalPath(null)).toBe("/");
    expect(safeInternalPath("https://evil.com")).toBe("/");
    expect(safeInternalPath("//evil.com")).toBe("/");
    expect(safeInternalPath(encodedBackslash)).toBe("/");
    expect(safeInternalPath("/\\evil.com")).toBe("/");
    expect(safeInternalPath("/https://evil.com")).toBe("/");
    expect(safeInternalPath("/../admin")).toBe("/");
    expect(safeInternalPath("/buyer/../admin")).toBe("/");
    expect(safeInternalPath("/login?next=/../admin")).toBe("/");
    expect(safeInternalPath("/search?discount=100%")).toBe("/");
  });

  it("rejects characters URL parsing strips or reads as a slash", () => {
    // Regression: "/\t/evil.example" passed and `new URL` resolved it to https://evil.example/.
    expect(new URL("/\t/evil.example", SITE).origin).toBe("https://evil.example");

    expect(safeInternalPath("/\t/evil.example")).toBe("/");
    expect(safeInternalPath("/\n/evil.example")).toBe("/");
    expect(safeInternalPath("/\r/evil.example")).toBe("/");
    expect(safeInternalPath(nextParam("/%09/evil.example"))).toBe("/");
    expect(safeInternalPath(nextParam("/%0A/evil.example"))).toBe("/");
    expect(safeInternalPath(nextParam("/%0D/evil.example"))).toBe("/");
  });

  it("rejects values that turn hostile after one more percent-decode", () => {
    expect(safeInternalPath("/%09/evil.example")).toBe("/");
    expect(safeInternalPath("/%2F/evil.example")).toBe("/");
    expect(safeInternalPath("/%5Cevil.example")).toBe("/");
    expect(safeInternalPath("/buyer/%2e%2e/admin")).toBe("/");
  });

  it("rejects dot segments that collapse into a protocol-relative path", () => {
    expect(new URL("/.//evil.example", SITE).pathname).toBe("//evil.example");
    expect(safeInternalPath("/.//evil.example")).toBe("/");
  });

  it("falls back for every hostile next value", () => {
    for (const value of HOSTILE_NEXT_VALUES) {
      expect(safeInternalPath(value, "/fallback"), JSON.stringify(value)).toBe("/fallback");
    }
  });

  it("only ever returns stable same-origin paths for combinations of tricky pieces", () => {
    const pieces = ["/", "\\", "\t", "\n", "\r", " ", ".", "..", "%2F", "%5C", "%09", "%2e", "%", "?", "#", "evil.example"];
    let candidates = ["", "/"];
    const failures: string[] = [];
    for (let depth = 0; depth < 3; depth += 1) {
      candidates = candidates.flatMap((prefix) => pieces.map((piece) => prefix + piece));
      for (const candidate of candidates) {
        const result = safeInternalPath(candidate, "/fallback");
        if (
          new URL(result, SITE).origin !== SITE
          || result.startsWith("//")
          || safeInternalPath(result, "/fallback") !== result
        ) {
          failures.push(`${JSON.stringify(candidate)} -> ${JSON.stringify(result)}`);
        }
      }
    }
    expect(failures).toEqual([]);
  });

  it("returns the parsed form so the checked path is the followed path", () => {
    expect(safeInternalPath("/?area=Los Angeles")).toBe("/?area=Los%20Angeles");
    expect(safeInternalPath("/buyer/./profile")).toBe("/buyer/profile");
    expect(safeInternalPath("/buyer/profile ")).toBe("/buyer/profile");
  });

  it("returns results that survive the next hop's check unchanged", () => {
    for (const value of [
      "/buyer/profile",
      "/login?next=%2Fbuyer%2Fprofile",
      "/?area=Los Angeles",
      "/buyer/./profile",
      "/seller/invite/abc?draft=1#property",
    ]) {
      const result = safeInternalPath(value, "/fallback");
      expect(result).not.toBe("/fallback");
      expect(safeInternalPath(result, "/fallback")).toBe(result);
    }
  });

  it("supports a custom fallback", () => {
    expect(safeInternalPath("//evil.com", "")).toBe("");
    expect(safeInternalPath("/\t/evil.example", "")).toBe("");
  });
});
