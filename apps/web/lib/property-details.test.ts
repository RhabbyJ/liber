import { describe, expect, it } from "vitest";
import { propertyFeatureChoices } from "./property-details";

describe("seller property feature choices", () => {
  it("preserves previously saved custom features as selected choices", () => {
    const choices = propertyFeatureChoices(["Original wood beams", "Pool", "pool", "  Fireplace  "]);
    expect(choices.filter((choice) => choice.selected).map((choice) => choice.value)).toEqual(["Pool", "Fireplace", "Original wood beams"]);
    expect(choices.filter((choice) => choice.value.toLowerCase() === "pool")).toHaveLength(1);
  });

  it("does not silently select amenities on a new property", () => {
    expect(propertyFeatureChoices().every((choice) => !choice.selected)).toBe(true);
  });
});
