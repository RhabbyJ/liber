import { describe, expect, it } from "vitest";
import {
  avatarVariantFromSeed,
  normalizeAvatarVariant,
  randomAvatarVariant,
  resolveAvatarVariant,
} from "./avatar-variant";

describe("buyer avatar variants", () => {
  it("accepts only allowlisted Boring Avatars tokens", () => {
    expect(normalizeAvatarVariant("boring:beam:liber:0")).toBe("boring:beam:liber:0");
    expect(normalizeAvatarVariant("dog:purple:0")).toBeNull();
    expect(normalizeAvatarVariant("boring:beam:https://example.com/avatar.svg:0")).toBeNull();
    expect(normalizeAvatarVariant("boring:geometric:liber:0")).toBeNull();
    expect(normalizeAvatarVariant("boring:beam:liber:-1")).toBeNull();
  });

  it("derives a stable default avatar for accounts without a saved token", () => {
    const first = avatarVariantFromSeed("buyer-user-id");
    const second = avatarVariantFromSeed("buyer-user-id");

    expect(first).toBe(second);
    expect(normalizeAvatarVariant(first)).toBe(first);
  });

  it("resolves stale tokens to a Boring Avatars fallback", () => {
    const resolved = resolveAvatarVariant("cat:purple:1", "buyer-user-id");

    expect(resolved.value).toBe(avatarVariantFromSeed("buyer-user-id"));
    expect(resolved.colors.length).toBeGreaterThan(0);
  });

  it("does not return the excluded currently displayed avatar when shuffling", () => {
    const current = avatarVariantFromSeed("buyer-user-id");
    const shuffled = randomAvatarVariant(current);

    expect(shuffled).not.toBe(current);
    expect(normalizeAvatarVariant(shuffled)).toBe(shuffled);
  });
});
