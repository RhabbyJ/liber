import { describe, expect, it } from "vitest";
import {
  avatarVariantFromSeed,
  normalizeAvatarVariant,
  previousAvatarVariant,
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
    expect(resolved.seed).toBe(`buyer-user-id:${resolved.salt}`);
  });

  it("does not return the excluded currently displayed avatar when shuffling", () => {
    const current = avatarVariantFromSeed("buyer-user-id");
    const shuffled = randomAvatarVariant(current);

    expect(shuffled).not.toBe(current);
    expect(normalizeAvatarVariant(shuffled)).toBe(shuffled);
  });

  it("steps backward through allowed animal avatars", () => {
    expect(previousAvatarVariant("avatarka:animals:4")).toBe("avatarka:animals:3");
    expect(previousAvatarVariant("avatarka:animals:0")).toBe("avatarka:animals:31");
  });
});
