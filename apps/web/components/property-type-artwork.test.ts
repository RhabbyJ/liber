import { existsSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { propertyPhotoSrc } from "../lib/property-photos";
import { propertyTypeOptions } from "../lib/property-types";

describe("property type photos", () => {
  it("ships optimized listing photos for every v1 property type", () => {
    for (const option of propertyTypeOptions) {
      const sources = new Set(Array.from({ length: 40 }, (_, index) => propertyPhotoSrc(option.label, `seed-${index}`)));
      expect(sources.size, `${option.value} should rotate between photos`).toBeGreaterThan(1);
      for (const source of sources) {
        const asset = path.resolve("public", source.slice(1));
        expect(existsSync(asset), `${source} should exist`).toBe(true);
        expect(statSync(asset).size, `${source} should be web-sized`).toBeLessThan(300_000);
      }
    }
  });

  it("keeps the same photo for the same seed and falls back to houses", () => {
    expect(propertyPhotoSrc("Condo", "buyer-1")).toBe(propertyPhotoSrc("CONDO", "buyer-1"));
    expect(propertyPhotoSrc(undefined, "x")).toMatch(/\/images\/homes\/house-\d\.webp$/);
  });
});
