"use server";

import type { InviteSendFormState } from "../lib/invite-send-form";
import { inviteSendFeedback } from "./invite-send-errors";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import {
  createSellerProperty,
  grantBadge,
  hideBuyerProfile,
  regenerateBuyerAlias,
  reviewDocument,
  reviewSellerAccess,
  revokeBadge,
  sendInvite,
  setBuyerAvatarVariant,
  shuffleBuyerAvatarVariant,
  suspendUser,
  updateSellerProperty,
} from "./contracts";
import { saveBuyerProfile } from "./buyer/commands";
import type { BuyerInviteResponseState } from "../lib/buyer-invite-response";
import type { SellerAccessReviewFormState } from "../lib/seller-access-review-form";
import type { BadgeReviewFormState } from "../lib/badge-review-form";
import { badgeReviewErrorMessage } from "./verification/badge-review";
import {
  buyerProfileFormMessage,
  type BuyerProfileFormState,
} from "../lib/buyer-profile-form";

function safeSellerNext(formData: FormData) {
  const next = formData.get("next");
  return typeof next === "string" && next.startsWith("/seller/") ? next : null;
}

export async function submitBuyerProfile(
  _state: BuyerProfileFormState,
  formData: FormData,
): Promise<BuyerProfileFormState> {
  let buyer: Awaited<ReturnType<typeof saveBuyerProfile>>["data"];

  try {
    ({ data: buyer } = await saveBuyerProfile(formData, "PUBLISH"));
  } catch (error) {
    const message = buyerProfileFormMessage(error);
    if (message) return { message };
    throw error;
  }

  revalidatePath("/buyer/profile");
  revalidatePath(`/buyers/${buyer.id}`);
  const status = formData.get("profileIntent") === "save" ? "saved" : "published";
  redirect(`/buyer/profile?status=${status}`);
}

export async function setBuyerAvatar(formData: FormData) {
  const avatarVariant = formData.get("avatarVariant");
  if (typeof avatarVariant !== "string") throw new Error("Choose one of the available avatars.");
  const { data } = await setBuyerAvatarVariant(avatarVariant);
  revalidatePath("/buyer/profile");
  if (data.buyerProfileId) revalidatePath(`/buyers/${data.buyerProfileId}`);
  redirect("/buyer/profile");
}

export async function shuffleBuyerAvatar() {
  const { data } = await shuffleBuyerAvatarVariant();
  revalidatePath("/buyer/profile");
  if (data.buyerProfileId) revalidatePath(`/buyers/${data.buyerProfileId}`);
  redirect("/buyer/profile");
}

export async function regenerateBuyerPublicAlias() {
  const { data } = await regenerateBuyerAlias();
  revalidatePath("/buyer/profile");
  revalidatePath(`/buyers/${data.buyerProfileId}`);
  redirect("/buyer/profile");
}

export async function respondToBuyerInvite(
  _state: BuyerInviteResponseState,
  formData: FormData,
): Promise<BuyerInviteResponseState> {
  const { respondToBuyerInviteCommand } = await import("./buyer/invite-response");
  const result = await respondToBuyerInviteCommand(formData);
  if (!result.ok) return result;
  revalidatePath("/buyer/invites");
  revalidatePath("/buyer/profile");
  revalidatePath("/messages");
  revalidatePath("/seller/invites");
  redirect(result.next);
}

export async function blockBuyerProfile(formData: FormData) {
  const buyerProfileId = formData.get("buyerProfileId");
  if (typeof buyerProfileId !== "string") throw new Error("This profile is unavailable.");
  const { blockUserByBuyerProfile } = await import("./messaging/service");
  await blockUserByBuyerProfile({ buyerProfileId });
  revalidatePath("/");
  redirect("/");
}

export async function blockInviteConversation(formData: FormData) {
  const conversationId = formData.get("conversationId");
  if (typeof conversationId !== "string") throw new Error("This conversation is unavailable.");
  const { blockConversationUser } = await import("./messaging/service");
  await blockConversationUser({ conversationId, reason: "Invite block" });
  revalidatePath("/buyer/invites");
  revalidatePath("/messages");
  redirect("/buyer/invites?status=blocked");
}

export async function submitSellerProperty(formData: FormData) {
  const { data: property } = await createSellerProperty(formData);
  const next = safeSellerNext(formData);

  revalidatePath("/seller/properties");
  revalidatePath("/admin/documents");
  redirect(next ?? `/seller/properties/${property.id}/edit`);
}

export async function submitSellerPropertyUpdate(formData: FormData) {
  await updateSellerProperty(formData);
  const propertyId = formData.get("propertyId");

  if (typeof propertyId !== "string") {
    throw new Error("Property is required.");
  }

  revalidatePath("/seller/properties");
  revalidatePath(`/seller/properties/${propertyId}/edit`);
  revalidatePath("/admin/documents");
  redirect("/seller/properties");
}

export async function submitInvite(
  _state: InviteSendFormState,
  formData: FormData,
): Promise<InviteSendFormState> {
  const propertyId = formData.get("propertyId");

  if (typeof propertyId !== "string" || !propertyId.trim()) {
    return { message: "Choose a property before sending your invite." };
  }

  let invite;
  try {
    ({ data: invite } = await sendInvite(formData));
  } catch (error) {
    const feedback = inviteSendFeedback(error);
    if (feedback) return {
      ...feedback,
      values: {
        propertyId: propertyId.slice(0, 200),
        termsAccepted: ["true", "on"].includes(String(formData.get("termsAccepted"))),
      },
    };
    throw error;
  }
  revalidatePath("/seller/invites");
  revalidatePath(`/seller/properties/${propertyId}/edit`);
  revalidatePath("/buyer/notifications");
  if (invite.conversationAvailable && invite.conversationId) {
    redirect(`/messages/${invite.conversationId}`);
  }
  redirect("/seller/invites");
}

export async function submitDocumentReview(formData: FormData) {
  await reviewDocument(formData);
  revalidatePath("/admin/documents");
  revalidatePath("/buyer/notifications");
}

export async function submitBadgeGrant(
  _state: BadgeReviewFormState,
  formData: FormData,
): Promise<BadgeReviewFormState> {
  try {
    await grantBadge(formData);
  } catch (error) {
    const message = badgeReviewErrorMessage(error, "grant");
    if (message) return { ok: false, message };
    throw error;
  }
  revalidatePath("/admin/badges");
  revalidatePath("/buyer/badges");
  revalidatePath("/buyer/profile");
  revalidatePath("/buyer/notifications");
  revalidatePath("/");
  return { ok: true, message: "Badge granted. The buyer's verification status has been updated." };
}

export async function submitBadgeRevoke(
  _state: BadgeReviewFormState,
  formData: FormData,
): Promise<BadgeReviewFormState> {
  try {
    await revokeBadge(formData);
  } catch (error) {
    const message = badgeReviewErrorMessage(error, "revoke");
    if (message) return { ok: false, message };
    throw error;
  }
  revalidatePath("/admin/badges");
  revalidatePath("/buyer/badges");
  revalidatePath("/buyer/profile");
  revalidatePath("/buyer/notifications");
  revalidatePath("/");
  return { ok: true, message: "Badge revoked. It no longer counts as active verification." };
}

export async function submitUserSuspension(formData: FormData) {
  await suspendUser(formData);
  revalidatePath("/admin/users");
}

export async function submitSellerAccessReview(
  _state: SellerAccessReviewFormState,
  formData: FormData,
): Promise<SellerAccessReviewFormState> {
  const result = await reviewSellerAccess(formData);
  if (!result.ok) return result;
  revalidatePath("/admin/users");
  revalidatePath("/");
  const status = result.data.status.toLowerCase();
  return {
    ok: true,
    message: result.changed
      ? `Seller directory access ${status}.`
      : `Seller directory access is already ${status}. No changes were needed.`,
  };
}

export async function submitProfileHide(formData: FormData) {
  await hideBuyerProfile(formData);
  revalidatePath("/admin/buyer-profiles");
}
