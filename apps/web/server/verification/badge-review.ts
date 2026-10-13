import { ZodError } from "zod";

const expectedGrantErrors = new Map([
  ["Buyer profile not found.", "This buyer profile is no longer available. Refresh the badges page."],
  ["This badge requires approved document evidence.", "Approve a matching document in Admin → Documents, then select it here before granting this badge."],
  ["Badge evidence must be an approved document for this buyer.", "Select an approved document belonging to this buyer. Pending or rejected documents cannot support a badge."],
  ["Approved evidence is not compatible with this badge.", "Choose evidence that matches the badge: a pre-approval letter, proof of funds, or identity document."],
]);

export function badgeReviewErrorMessage(error: unknown, operation: "grant" | "revoke") {
  if (error instanceof ZodError) {
    return operation === "grant"
      ? "Choose a buyer, badge type, and approved document, then try again."
      : "Choose an available badge to revoke, then try again.";
  }
  if (error instanceof Error && error.message === "Rate limit reached. Try again later.") {
    return "The admin review limit has been reached. Wait before trying again.";
  }
  if (operation === "grant" && error instanceof Error) return expectedGrantErrors.get(error.message) ?? null;
  if (operation === "revoke" && error instanceof Error && error.name === "PrismaClientKnownRequestError"
    && "code" in error && error.code === "P2025") {
    return "This badge is no longer available. Refresh the badges page.";
  }
  return null;
}
