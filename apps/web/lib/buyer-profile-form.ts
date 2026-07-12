import { ZodError } from "zod";

export type BuyerProfileFormState = {
  message: string;
};

const EXPECTED_PROFILE_ERRORS = new Set([
  "A market is required for the selected service area.",
  "Budget range is required before publishing.",
  "Buyer criteria are required before publishing.",
  "Choose an active Liber service area before publishing your profile.",
  "Purchase type and seeking property type are required before publishing.",
  "This profile is controlled by admin review and cannot be published.",
  "Unsupported service area for this market.",
]);

export function buyerProfileFormMessage(error: unknown) {
  if (error instanceof ZodError) {
    return error.issues[0]?.message ?? "Review the highlighted profile fields and try again.";
  }

  if (error instanceof Error && EXPECTED_PROFILE_ERRORS.has(error.message)) return error.message;
  return null;
}
