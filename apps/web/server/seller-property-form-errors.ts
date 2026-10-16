import { z } from "zod";
import {
  SELLER_PROPERTY_INLINE_FIELDS,
  type SellerPropertyFormField,
  type SellerPropertyFormState,
} from "../lib/seller-property-form";

const inlineFields = new Set<string>(SELLER_PROPERTY_INLINE_FIELDS);

// Only validation failures and known domain failures become browser copy.
// Unknown errors and framework redirects must keep reaching Next's error
// handling without exposing internals.
export function sellerPropertyFormFeedback(error: unknown): SellerPropertyFormState | null {
  if (error instanceof z.ZodError) {
    const fieldErrors: NonNullable<SellerPropertyFormState["fieldErrors"]> = {};
    let hasHiddenFieldIssue = false;
    for (const issue of error.issues) {
      const field = issue.path[0];
      if (isInlineField(field)) fieldErrors[field] ??= issue.message;
      else hasHiddenFieldIssue = true;
    }
    return {
      fieldErrors,
      message: hasHiddenFieldIssue
        ? "Some property details are missing or out of date. Refresh the page and try again."
        : "Check the highlighted fields and try again.",
    };
  }
  if (error instanceof Error && error.message === "Property not found.") {
    return { message: "This property is no longer available to your account. Return to your properties and try again." };
  }
  return null;
}

function isInlineField(field: unknown): field is SellerPropertyFormField {
  return typeof field === "string" && inlineFields.has(field);
}
