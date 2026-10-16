"use server";

import type { InviteSendFormState } from "../lib/invite-send-form";
import { inviteSendFeedback } from "./invite-send-errors";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import {
  createSellerProperty,
  grantBadge,
  hideBuyerProfile,
  reviewDocument,
  reviewSellerAccess,
  revokeBadge,
  sendInvite,
  setBuyerAvatarVariant,
  suspendUser,
  unhideBuyerProfile,
  updateSellerProperty,
  withdrawInviteAsAdmin,
  withdrawSellerInvite,
} from "./contracts";
import type { ActionFeedbackState } from "../lib/action-feedback";
import { BUYER_PROFILE_REQUIRED, saveBuyerProfile, setBuyerProfileVisibility } from "./buyer/commands";
import type { BuyerInviteResponseState } from "../lib/buyer-invite-response";
import type { SellerAccessReviewFormState } from "../lib/seller-access-review-form";
import type { BadgeReviewFormState } from "../lib/badge-review-form";
import { badgeReviewErrorMessage } from "./verification/badge-review";
import {
  buyerProfileFormMessage,
  type BuyerProfileFormState,
} from "../lib/buyer-profile-form";
import type { SellerPropertyFormState } from "../lib/seller-property-form";
import { sellerPropertyFormFeedback } from "./seller-property-form-errors";

function safeSellerNext(formData: FormData) {
  const next = formData.get("next");
  return typeof next === "string" && next.startsWith("/seller/") ? next : null;
}

function revalidateInviteViews() {
  for (const path of ["/seller/invites", "/seller/notifications", "/buyer/invites", "/buyer/notifications", "/admin/invites", "/messages"]) {
    revalidatePath(path);
  }
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

export async function submitSellerProperty(
  _state: SellerPropertyFormState,
  formData: FormData,
): Promise<SellerPropertyFormState> {
  let property: Awaited<ReturnType<typeof createSellerProperty>>["data"];
  try {
    ({ data: property } = await createSellerProperty(formData));
  } catch (error) {
    const state = sellerPropertyFormFeedback(error);
    if (state) return state;
    throw error;
  }
  const next = safeSellerNext(formData);

  revalidatePath("/seller/properties");
  revalidatePath("/admin/documents");
  redirect(next ?? `/seller/properties/${property.id}/edit`);
}

export async function submitSellerPropertyUpdate(
  _state: SellerPropertyFormState,
  formData: FormData,
): Promise<SellerPropertyFormState> {
  try {
    await updateSellerProperty(formData);
  } catch (error) {
    const state = sellerPropertyFormFeedback(error);
    if (state) return state;
    throw error;
  }
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

export async function submitInviteWithdrawal(
  _state: ActionFeedbackState,
  formData: FormData,
): Promise<ActionFeedbackState> {
  const result = await withdrawSellerInvite(formData);
  if (result.ok) revalidateInviteViews();
  return result;
}

export async function submitAdminInviteWithdrawal(
  _state: ActionFeedbackState,
  formData: FormData,
): Promise<ActionFeedbackState> {
  const result = await withdrawInviteAsAdmin(formData);
  if (result.ok) revalidateInviteViews();
  return result;
}

export async function submitDocumentReview(formData: FormData) {
  const { data } = await reviewDocument(formData);
  revalidatePath("/admin/documents");
  revalidatePath("/buyer/notifications");
  const subject = data.documentType === "OWNERSHIP" ? "property" : "buyer";
  redirect(`/admin/documents?reviewed=${data.decision === "APPROVED" ? "approved" : "rejected"}&subject=${subject}`);
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

function revalidateBuyerProfileViews() {
  for (const path of ["/admin/buyer-profiles", "/admin/badges", "/buyer/profile", "/buyer/invites", "/"]) revalidatePath(path);
}

export async function submitProfileHide(
  _state: ActionFeedbackState,
  formData: FormData,
): Promise<ActionFeedbackState> {
  const result = await hideBuyerProfile(formData);
  if (result.ok) revalidateBuyerProfileViews();
  return result;
}

export async function submitProfileUnhide(
  _state: ActionFeedbackState,
  formData: FormData,
): Promise<ActionFeedbackState> {
  const result = await unhideBuyerProfile(formData);
  if (result.ok) revalidateBuyerProfileViews();
  return result;
}

export async function submitBuyerProfileVisibility(
  _state: ActionFeedbackState,
  formData: FormData,
): Promise<ActionFeedbackState> {
  let result: Awaited<ReturnType<typeof setBuyerProfileVisibility>>;
  try {
    result = await setBuyerProfileVisibility(formData);
  } catch (error) {
    const message = buyerProfileFormMessage(error)
      ?? (error instanceof Error && error.message === BUYER_PROFILE_REQUIRED ? error.message : null);
    if (message) return { ok: false, message };
    throw error;
  }
  revalidatePath("/buyer/profile");
  revalidatePath(`/buyers/${result.buyerProfileId}`);
  revalidatePath("/buyer/invites");
  revalidatePath("/");
  redirect(`/buyer/profile?status=${result.visibilityStatus === "ACTIVE" ? "republished" : "paused"}`);
}
