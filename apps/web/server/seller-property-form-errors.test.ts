import { createSellerPropertySchema, updateSellerPropertySchema } from "@liber/validators";
import { describe, expect, it } from "vitest";
import { sellerPropertyFormFeedback } from "./seller-property-form-errors";

function validationError(schema: typeof createSellerPropertySchema | typeof updateSellerPropertySchema, input: unknown) {
  const result = schema.safeParse(input);
  if (result.success) throw new Error("Expected validation to fail.");
  return result.error;
}

describe("seller property form errors", () => {
  it("puts each validation message next to its own field", () => {
    const error = validationError(createSellerPropertySchema, {
      bathrooms: "2.5",
      description: "x".repeat(2001),
      ownershipConfirmed: true,
      price: "2,5",
      propertyType: "HOME",
      state: "C",
    });

    expect(sellerPropertyFormFeedback(error)).toEqual({
      fieldErrors: {
        bathrooms: "Enter bathrooms as a whole number, like 2. Half baths can't be saved.",
        description: "Shorten the notes to 2,000 characters.",
        price: "Enter the asking price in dollars, like 925,000.",
        state: "Enter the 2-letter state, like CA.",
      },
      message: "Check the highlighted fields and try again.",
    });
  });

  it("asks for a refresh when a hidden or stale control fails", () => {
    const error = validationError(updateSellerPropertySchema, { ownershipConfirmed: true, propertyType: "MULTIFAMILY" });

    expect(sellerPropertyFormFeedback(error)).toEqual({
      fieldErrors: {},
      message: "Some property details are missing or out of date. Refresh the page and try again.",
    });
  });

  it("explains a property that is no longer available", () => {
    expect(sellerPropertyFormFeedback(new Error("Property not found."))?.message).toContain("no longer available");
  });

  it("leaves unknown failures and framework redirects to Next", () => {
    expect(sellerPropertyFormFeedback(new Error("database connection string"))).toBeNull();
    expect(sellerPropertyFormFeedback(Object.assign(new Error("NEXT_REDIRECT"), { digest: "NEXT_REDIRECT;replace;/login;307;" }))).toBeNull();
  });
});
