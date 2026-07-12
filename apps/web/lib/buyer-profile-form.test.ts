import { updateBuyerProfileSchema } from "@liber/validators";
import { describe, expect, it } from "vitest";
import { buyerProfileFormMessage } from "./buyer-profile-form";

describe("buyer profile form errors", () => {
  it("returns a useful validation message for expected input errors", () => {
    const result = updateBuyerProfileSchema.safeParse({ budgetMin: 900_000, budgetMax: 500_000 });
    expect(result.success).toBe(false);
    if (result.success) return;

    expect(buyerProfileFormMessage(result.error)).toBe("Budget minimum cannot exceed budget maximum.");
  });

  it("returns known publication errors without exposing unknown failures", () => {
    expect(buyerProfileFormMessage(new Error("Budget range is required before publishing."))).toBe(
      "Budget range is required before publishing.",
    );
    expect(buyerProfileFormMessage(new Error("database connection string"))).toBeNull();
  });
});
