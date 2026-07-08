"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import {
  createSellerProperty,
  grantBadge,
  hideBuyerProfile,
  previousBuyerAvatarVariant,
  respondToInvite,
  reviewDocument,
  reviewSellerAccess,
  revokeBadge,
  sendInvite,
  shuffleBuyerAvatarVariant,
  suspendUser,
  updateBuyerProfile,
  updateSellerProperty,
  uploadBuyerVerificationDocumentFile,
  uploadOwnershipDocumentFile,
  uploadPropertyImageFile,
  upsertBuyerCriteria,
} from "./contracts";
import { requireApprovedSellerAccess } from "./access";

function isSubmittedFile(value: FormDataEntryValue): value is File {
  return (
    typeof value === "object" &&
    value !== null &&
    "arrayBuffer" in value &&
    "name" in value &&
    "size" in value &&
    Number(value.size) > 0
  );
}

function safeSellerNext(formData: FormData) {
  const next = formData.get("next");
  return typeof next === "string" && next.startsWith("/seller/") ? next : null;
}

export async function submitBuyerProfile(formData: FormData) {
  formData.set("visibilityStatus", "ACTIVE");
  const { data: buyer } = await updateBuyerProfile(formData);

  // The profile form's home-fit section doubles as the buyer's search criteria.
  formData.set("buyerProfileId", buyer.id);
  formData.set("propertySubtype", "HOME");
  formData.set("priceMin", String(formData.get("budgetMin") ?? ""));
  formData.set("priceMax", String(formData.get("budgetMax") ?? ""));
  await upsertBuyerCriteria(formData);

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

export async function respondToBuyerInvite(formData: FormData) {
  await respondToInvite(formData);
  revalidatePath("/buyer/invites");
  revalidatePath("/buyer/profile");
}

export async function submitBuyerVerificationDocument(formData: FormData) {
  const document = formData.get("document");

  if (!document || !isSubmittedFile(document)) {
    redirect("/buyer/profile?verification=missing");
  }

  await uploadBuyerVerificationDocumentFile(formData.get("documentType"), document);
  revalidatePath("/buyer/badges");
  revalidatePath("/buyer/profile");
  revalidatePath("/admin/documents");
  redirect("/buyer/profile?verification=submitted");
}

export async function submitSellerProperty(formData: FormData) {
  const { data: property } = await createSellerProperty(formData);
  const images = formData.getAll("images").filter(isSubmittedFile);
  const ownershipDocument = formData.get("ownership");
  const next = safeSellerNext(formData);

  await Promise.all(images.map((image) => uploadPropertyImageFile(property.id, image)));

  if (ownershipDocument && isSubmittedFile(ownershipDocument)) {
    await uploadOwnershipDocumentFile(property.id, ownershipDocument);
  }

  revalidatePath("/seller/properties");
  revalidatePath("/admin/documents");
  if (next) redirect(next);
}

export async function submitSellerPropertyUpdate(formData: FormData) {
  await updateSellerProperty(formData);
  const propertyId = formData.get("propertyId");
  const images = formData.getAll("images").filter(isSubmittedFile);
  const ownershipDocument = formData.get("ownership");

  if (typeof propertyId !== "string") {
    throw new Error("Property is required.");
  }

  await Promise.all(images.map((image) => uploadPropertyImageFile(propertyId, image)));

  if (ownershipDocument && isSubmittedFile(ownershipDocument)) {
    await uploadOwnershipDocumentFile(propertyId, ownershipDocument);
  }

  revalidatePath("/seller/properties");
  revalidatePath(`/seller/properties/${propertyId}/edit`);
  revalidatePath("/admin/documents");
}

export async function submitInvite(formData: FormData) {
  await requireApprovedSellerAccess();
  const propertyId = formData.get("propertyId");
  const images = formData.getAll("images").filter(isSubmittedFile);

  if (typeof propertyId !== "string") {
    throw new Error("Property is required.");
  }

  await updateSellerProperty(formData);
  await Promise.all(images.map((image) => uploadPropertyImageFile(propertyId, image)));
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
