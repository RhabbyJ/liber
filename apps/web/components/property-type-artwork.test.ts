import { existsSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { propertyTypeOptions } from "../lib/property-types";

const assetBySubtype = {
  HOME: "house-2d.webp",
  CONDO: "condo-2d.webp",
  TOWNHOUSE: "townhouse-2d.webp",
  MANUFACTURED: "manufactured-2d.webp",
  LAND: "land-2d.webp",
} as const;

const emojiBySubtype = {
  HOME: "house-emoji.webp",
  CONDO: "condo-emoji.webp",
  TOWNHOUSE: "townhouse-emoji.webp",
  MANUFACTURED: "manufactured-emoji.webp",
  LAND: "land-emoji.webp",
} as const;

describe("property type artwork", () => {
  it("ships one optimized image for every v1 property type", () => {
    expect(Object.keys(assetBySubtype)).toEqual(propertyTypeOptions.map((option) => option.value));
    expect(Object.keys(emojiBySubtype)).toEqual(propertyTypeOptions.map((option) => option.value));

    for (const filename of [...Object.values(assetBySubtype), ...Object.values(emojiBySubtype)]) {
      const asset = path.resolve("public/images/property-types", filename);
      expect(existsSync(asset), `${filename} should exist`).toBe(true);
      expect(statSync(asset).size, `${filename} should be web-sized`).toBeLessThan(100_000);
    }
  });
});
