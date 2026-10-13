import { z } from "zod";
import type { InviteSendFormState } from "../lib/invite-send-form";
import { MessagingError } from "./messaging/errors";

type InviteSendErrorCode = "DUPLICATE" | "OWNERSHIP_REQUIRED" | "PROPERTY_UNAVAILABLE" | "SELF_INVITE" | "DAILY_LIMIT" | "ACCESS_REQUIRED";

export class InviteSendError extends Error {
  constructor(
    readonly code: InviteSendErrorCode,
    message: string,
    readonly context: { propertyId?: string; conversationId?: string } = {},
  ) {
    super(message);
    this.name = "InviteSendError";
  }
}

const sentInvites = { href: "/seller/invites", label: "View sent invites" };
const buyerSearch = { href: "/seller/search", label: "Back to buyers" };

// Only known domain failures become browser copy. Unknown errors and framework
// redirects must keep reaching Next's error handling without exposing internals.
export function inviteSendFeedback(error: unknown): InviteSendFormState | null {
  if (error instanceof InviteSendError) {
    switch (error.code) {
      case "DUPLICATE":
        return {
          message: "You already sent an invite to this buyer for this property. Open the existing conversation to continue, or choose a different property for a new invite.",
          action: error.context.conversationId
            ? { href: `/messages/${encodeURIComponent(error.context.conversationId)}`, label: "Open existing conversation" }
            : sentInvites,
        };
      case "OWNERSHIP_REQUIRED":
        return {
          message: "This property needs current ownership approval before you can invite buyers. Review its documents and authority confirmation, then wait for admin approval.",
          action: error.context.propertyId
            ? { href: `/seller/properties/${encodeURIComponent(error.context.propertyId)}/edit`, label: "Review property verification" }
            : { href: "/seller/properties", label: "Manage properties" },
        };
      case "PROPERTY_UNAVAILABLE":
        return { message: "This property is no longer available to your account. Choose a property you own, or refresh your property list.", action: { href: "/seller/properties", label: "Manage properties" } };
      case "SELF_INVITE":
        return { message: "You cannot invite your own buyer profile. Choose another buyer from the directory.", action: buyerSearch };
      case "DAILY_LIMIT":
        return { message: "You have sent 25 invites in the last 24 hours. Wait until an earlier send is more than 24 hours old before sending another. You can continue existing conversations now.", action: sentInvites };
      case "ACCESS_REQUIRED":
        return { message: "Seller directory access must be approved before you can send invites. Check your access status and ask an admin to review it.", action: { href: "/seller/search", label: "View access status" } };
    }
  }
  if (error instanceof z.ZodError) {
    if (error.issues.some((issue) => issue.path[0] === "termsAccepted")) {
      return { message: "Confirm the manual-invite terms before sending your invite." };
    }
    return { message: "Some invite details are missing or out of date. Choose a property and confirm the terms. If this repeats, refresh the page and try again." };
  }
  if (error instanceof MessagingError) {
    if (error.code === "RATE_LIMITED") return { message: "You are sending requests too quickly. Wait before trying again; you can check your sent invites in the meantime.", action: sentInvites };
    if (error.code === "INVALID_INPUT") return { message: "The invitation details are out of date. Refresh this page and try again." };
    if (error.code === "UNAVAILABLE" || error.code === "NOT_FOUND") {
      return { message: "This buyer is unavailable for invitations. Return to the directory and choose another buyer.", action: buyerSearch };
    }
  }
  if (error instanceof Error) {
    if (error.message === "Seller directory access is pending admin approval.") {
      return inviteSendFeedback(new InviteSendError("ACCESS_REQUIRED", error.message));
    }
    if (error.message === "Rate limit reached. Try again later.") {
      return { message: "You are sending requests too quickly. Wait before trying again; you can check your sent invites in the meantime.", action: sentInvites };
    }
    if (error.message === "Test-approved properties can only invite the designated demo buyer.") {
      return { message: "This test-approved property can invite only the designated demo buyer. Choose that demo buyer, or use a property with genuine ownership approval.", action: buyerSearch };
    }
  }
  return null;
}
