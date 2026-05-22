import { describe, expect, it } from "vitest";
import { safeInternalPath } from "./redirect";

describe("safeInternalPath", () => {
  it("keeps normal internal paths", () => {
    expect(safeInternalPath("/buyer/profile")).toBe("/buyer/profile");
    expect(safeInternalPath("/login?next=%2Fbuyer%2Fprofile")).toBe("/login?next=%2Fbuyer%2Fprofile");
  });

  it("falls back for non-internal or malformed paths", () => {
    const encodedBackslash = new URL("https://liber.test/login?next=/%5Cevil.com").searchParams.get("next");

    expect(safeInternalPath(null)).toBe("/");
    expect(safeInternalPath("https://evil.com")).toBe("/");
    expect(safeInternalPath("//evil.com")).toBe("/");
    expect(safeInternalPath(encodedBackslash)).toBe("/");
    expect(safeInternalPath("/\\evil.com")).toBe("/");
    expect(safeInternalPath("/https://evil.com")).toBe("/");
  });

  it("supports a custom fallback", () => {
    expect(safeInternalPath("//evil.com", "")).toBe("");
  });
});
