import { describe, expect, it } from "vitest";
import {
  buyerAliasForDisplay,
  buyerAliasFromSeed,
  buyerAliases,
  normalizeBuyerAlias,
  randomBuyerAlias,
} from "./buyer-alias";

describe("buyer aliases", () => {
  it("accepts only curated privacy-safe aliases", () => {
    expect(normalizeBuyerAlias("Maple Haven")).toBe("Maple Haven");
    expect(normalizeBuyerAlias("  maple   haven ")).toBe("Maple Haven");
    expect(normalizeBuyerAlias("Julie P.")).toBeNull();
    expect(normalizeBuyerAlias("Cash Buyer")).toBeNull();
    expect(normalizeBuyerAlias("https://example.com/avatar.svg")).toBeNull();
  });

  it("derives a stable alias for buyers without a saved alias", () => {
    const first = buyerAliasFromSeed("buyer-user-id");
    const second = buyerAliasFromSeed("buyer-user-id");

    expect(first).toBe(second);
    expect(buyerAliases).toContain(first);
  });

  it("falls back from stale display names to a generated alias", () => {
    expect(buyerAliasForDisplay("Private buyer", "buyer-user-id")).toBe(buyerAliasFromSeed("buyer-user-id"));
  });

  it("does not return the excluded currently displayed alias when regenerating", () => {
    const current = buyerAliasFromSeed("buyer-user-id");
    const next = randomBuyerAlias(current);

    expect(next).not.toBe(current);
    expect(buyerAliases).toContain(next);
  });
});
