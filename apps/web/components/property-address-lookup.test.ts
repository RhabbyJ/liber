import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

describe("seller property intake", () => {
  it("uses an address-first lookup without turning lookup into the save action", () => {
    const source = readFileSync(path.resolve("components/property-address-lookup.tsx"), "utf8");

    expect(source).toContain('presentation === "intake"');
    expect(source).toContain("Find property");
    expect(source).toContain('onKeyDown={handleLookupKeyDown}');
    expect(source).toContain('<p className="eyebrow">Step 2</p>');
    expect(source).toMatch(/<button className="property-intake-lookup-button"[^>]*type="button">/);
    expect(source).toContain("identityRevisionRef.current");
    expect(source).toContain("lookupInFlightRef.current");
    expect(source).toContain("onKeyDown={handleLookupKeyDown}");
    expect(source).toContain('aria-live="polite"');
  });

  it("keeps final creation, ownership confirmation, and edit presentation intact", () => {
    const createPage = readFileSync(path.resolve("app/seller/properties/new/page.tsx"), "utf8");
    const editPage = readFileSync(path.resolve("app/seller/properties/[propertyId]/edit/page.tsx"), "utf8");

    expect(createPage).toContain('presentation="intake"');
    expect(createPage).toContain('action={submitSellerProperty}');
    expect(createPage).toContain("PropertyHeroIllustration");
    expect(createPage).toContain("OwnershipReviewIllustration");
    expect(createPage).toContain("Address</strong>");
    expect(createPage).toContain("Details</strong>");
    expect(createPage).toContain("Confirm</strong>");
    expect(createPage).toContain('name="ownershipConfirmed" required type="checkbox"');
    expect(createPage).toMatch(/<button className="button primary" type="submit">[\s\S]*?Save and continue/);
    expect(editPage).not.toContain('presentation="intake"');
  });
});
