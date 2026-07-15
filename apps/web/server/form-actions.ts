"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import {
  createSellerProperty,
  grantBadge,
  hideBuyerProfile,
  regenerateBuyerAlias,
  respondToInvite,
  reviewDocument,
  reviewSellerAccess,
  revokeBadge,
  sendInvite,
  shuffleBuyerAvatarVariant,
  suspendUser,
  updateSellerProperty,
} from "./contracts";
import { saveBuyerProfile } from "./buyer/commands";
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

export async function respondToBuyerInvite(formData: FormData) {
  await respondToInvite(formData);
  revalidatePath("/buyer/invites");
  revalidatePath("/buyer/profile");
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
}

export async function submitInvite(formData: FormData) {
  const propertyId = formData.get("propertyId");

  if (typeof propertyId !== "string") {
    throw new Error("Property is required.");
  }

  const { data: invite } = await sendInvite(formData);
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

export async function submitBadgeGrant(formData: FormData) {
  await grantBadge(formData);
  revalidatePath("/admin/badges");
  revalidatePath("/buyer/notifications");
}

export async function submitBadgeRevoke(formData: FormData) {
  await revokeBadge(formData);
  revalidatePath("/admin/badges");
  revalidatePath("/buyer/notifications");
}

export async function submitUserSuspension(formData: FormData) {
  await suspendUser(formData);
  revalidatePath("/admin/users");
}

export async function submitSellerAccessReview(formData: FormData) {
  await reviewSellerAccess(formData);
  revalidatePath("/admin/users");
  revalidatePath("/seller/search");
}

export async function submitProfileHide(formData: FormData) {
  await hideBuyerProfile(formData);
  revalidatePath("/admin/buyer-profiles");
}
