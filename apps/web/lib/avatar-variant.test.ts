import { describe, expect, it } from "vitest";
import {
  avatarColorCount,
  avatarColorIndex,
  avatarInitials,
  avatarVariantFromSeed,
  normalizeAvatarVariant,
  randomAvatarVariant,
  resolveAvatarVariant,
} from "./avatar-variant";

describe("buyer avatar variants", () => {
  it("accepts only allowlisted animal avatar tokens", () => {
    expect(normalizeAvatarVariant("avatarka:animals:0")).toBe("avatarka:animals:0");
    expect(normalizeAvatarVariant("dog:purple:0")).toBeNull();
    expect(normalizeAvatarVariant("boring:beam:0")).toBeNull();
    expect(normalizeAvatarVariant("boring:beam:liber:0")).toBeNull();
    expect(normalizeAvatarVariant("avatarka:robots:0")).toBeNull();
    expect(normalizeAvatarVariant("avatarka:https://example.com/avatar.svg:0")).toBeNull();
    expect(normalizeAvatarVariant("avatarka:animals:-1")).toBeNull();
    expect(normalizeAvatarVariant("avatarka:animals:99")).toBeNull();
  });

  it("derives a stable default avatar for accounts without a saved token", () => {
    const first = avatarVariantFromSeed("buyer-user-id");
    const second = avatarVariantFromSeed("buyer-user-id");

    expect(first).toBe(second);
    expect(normalizeAvatarVariant(first)).toBe(first);
  });

  it("resolves stale tokens to an animal avatar fallback", () => {
    const resolved = resolveAvatarVariant("cat:purple:1", "buyer-user-id");
    const resolvedPaletteToken = resolveAvatarVariant("boring:beam:liber:0", "buyer-user-id");

    expect(resolved.value).toBe(avatarVariantFromSeed("buyer-user-id"));
    expect(resolvedPaletteToken.value).toBe(avatarVariantFromSeed("buyer-user-id"));
    expect(resolved.seed).toBe(`liber:buyer-avatar:${resolved.salt}`);
  });

  it("renders a saved avatar token identically across private and seller-facing seeds", () => {
    const variant = "avatarka:animals:7";

    expect(resolveAvatarVariant(variant, "private-user-id").seed)
      .toBe(resolveAvatarVariant(variant, "Bright Hearth").seed);
  });

  it("always lands on a different color when shuffling", () => {
    const current = avatarVariantFromSeed("buyer-user-id");

    for (let attempt = 0; attempt < 64; attempt += 1) {
      const shuffled = randomAvatarVariant(current);
      expect(normalizeAvatarVariant(shuffled)).toBe(shuffled);
      expect(avatarColorIndex(shuffled, "")).not.toBe(avatarColorIndex(current, ""));
    }
  });

  it("maps the 32 tokens evenly onto the palette", () => {
    expect(32 % avatarColorCount).toBe(0);
  });
});

describe("avatar initials", () => {
  it.each([
    ["Bluebell Porch", "BP"],
    ["Julie P. #7C4E2A91B6D0", "JP"],
    ["Member #13EBA1C854A3", "M"],
    ["maple", "M"],
    ["Mary-Jane van Dyke", "MD"],
    ["Ana Ruiz (Contractor)", "AR"],
    ["jane.doe@example.com", "JD"],
    ["3rd Street Loft", "3L"],
    ["Émile Zola", "ÉZ"],
    ["E\u0301mile Zola", "ÉZ"],
    ["山田 太郎", "山"],
    ["محمد علي", "م"],
    ["", ""],
    [null, ""],
  ])("%s -> %s", (name, initials) => {
    expect(avatarInitials(name)).toBe(initials);
  });
});
