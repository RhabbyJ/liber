import { describe, expect, it } from "vitest";
import { createInitialsAvatar } from "../lib/initials-avatar";
import { publicIdentityInitials } from "../lib/public-identity";

describe("local DiceBear initials avatars", () => {
  function svg(name: string, variant = "avatarka:animals:3") {
    return createInitialsAvatar(name, "account", variant);
  }
  it("renders only initials without surname, identifier, or remote image requests", () => {
    const result = svg("Julie P. #ABCDEF123456");
    expect(result).toContain(">JP</text>");
    expect(result).not.toContain("ABCDEF123456");
    expect(result).not.toContain("dicebear.com/api");
    expect(result).toBe(svg("Julie P. #ABCDEF123456"));
  });
  it("draws the same grapheme initials that the accessible label announces", () => {
    expect(publicIdentityInitials("राहुल सिं. #ABCDEF123456")).toBe("रासिं");
    expect(svg("राहुल सिं. #ABCDEF123456")).toContain(">रासिं</text>");
  });
  it("color selection preserves initials", () => {
    expect(svg("Julie P.", "avatarka:animals:0")).not.toBe(svg("Julie P.", "avatarka:animals:1"));
    expect(svg("Julie P.", "avatarka:animals:1")).toContain(">JP</text>");
  });
});
