"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import {
  createSellerProperty,
  grantBadge,
  hideBuyerProfile,
  previousBuyerAvatarVariant,
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
import { requireApprovedSellerAccess } from "./access";

function safeSellerNext(formData: FormData) {
  const next = formData.get("next");
  return typeof next === "string" && next.startsWith("/seller/") ? next : null;
}

export async function submitBuyerProfile(formData: FormData) {
  const { data: buyer } = await saveBuyerProfile(formData, "PUBLISH");

  revalidatePath("/buyer/profile");
  revalidatePath(`/buyers/${buyer.id}`);
  redirect("/buyer/profile");
}

export async function shuffleBuyerAvatar(_formData: FormData) {
  const { data } = await shuffleBuyerAvatarVariant();
  revalidatePath("/buyer/profile");
  if (data.buyerProfileId) revalidatePath(`/buyers/${data.buyerProfileId}`);
  redirect("/buyer/profile?edit=profile");
}

export async function previousBuyerAvatar(_formData: FormData) {
  const { data } = await previousBuyerAvatarVariant();
  revalidatePath("/buyer/profile");
  if (data.buyerProfileId) revalidatePath(`/buyers/${data.buyerProfileId}`);
  redirect("/buyer/profile?edit=profile");
}

export async function regenerateBuyerPublicAlias(_formData: FormData) {
  const { data } = await regenerateBuyerAlias();
  revalidatePath("/buyer/profile");
  revalidatePath(`/buyers/${data.buyerProfileId}`);
  redirect("/buyer/profile?edit=profile");
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
  await requireApprovedSellerAccess();
  const propertyId = formData.get("propertyId");

  if (typeof propertyId !== "string") {
    throw new Error("Property is required.");
  }

  await sendInvite(formData);
  revalidatePath("/seller/invites");
  revalidatePath(`/seller/properties/${propertyId}/edit`);
  revalidatePath("/buyer/notifications");
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
