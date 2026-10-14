import { describe, expect, it } from "vitest";
import { currentCoverImageId } from "./property-cover";

describe("owner property cover photo", () => {
  it("uses the first image of the current identity version", () => {
    expect(currentCoverImageId({
      identityVersion: 3,
      images: [
        { id: "old", propertyIdentityVersion: 2 },
        { id: "first-current", propertyIdentityVersion: 3 },
        { id: "second-current", propertyIdentityVersion: 3 },
      ],
    })).toBe("first-current");
  });

  it("never falls back to photos of an earlier identity", () => {
    expect(currentCoverImageId({ identityVersion: 2, images: [{ id: "old", propertyIdentityVersion: 1 }] })).toBeUndefined();
    expect(currentCoverImageId({ identityVersion: 1 })).toBeUndefined();
  });
});
