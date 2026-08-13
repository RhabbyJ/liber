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
  setBuyerAvatarVariant,
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

export async function respondToBuyerInvite(formData: FormData) {
  const intent = typeof formData.get("intent") === "string" ? formData.get("intent") : formData.get("response");
  try {
    if (intent === "QUESTION" || intent === "TOUR" || intent === "LOI") {
      const next = await actOnBuyerInvite(formData, intent);
      revalidatePath("/buyer/invites");
      revalidatePath("/buyer/profile");
      revalidatePath("/messages");
      redirect(next);
    }
    await respondToInvite(formData);
  } catch (error) {
    if (error instanceof Error && error.message.startsWith("Invite cannot be changed")) {
      redirect("/buyer/invites?error=invite-locked");
    }
    throw error;
  }
  revalidatePath("/buyer/invites");
  revalidatePath("/buyer/profile");
  revalidatePath("/messages");
  const response = formData.get("response");
  redirect(response === "DECLINED" ? "/buyer/invites?status=declined" : "/buyer/invites?status=accepted");
}

async function actOnBuyerInvite(formData: FormData, intent: string) {
  const inviteId = formData.get("inviteId");
  const conversationId = formData.get("conversationId");
  if (typeof inviteId !== "string") throw new Error("Invite cannot be changed after response, identity change, or expiration.");

  if (intent === "QUESTION") {
    const rawQuestion = formData.get("question");
    const question = typeof rawQuestion === "string" ? rawQuestion.trim() : "";
    if (!question || question.length > 500) redirect("/buyer/invites?error=question");
    if (typeof conversationId !== "string" || !conversationId) {
      await respondToInvite({ inviteId, response: "ACCEPTED" });
      return "/buyer/invites?status=accepted";
    }
    const { sendConversationMessage } = await import("./messaging/service");
    await sendConversationMessage({
      body: question,
      clientMessageId: crypto.randomUUID(),
      conversationId,
      kind: "FREE_TEXT",
    });
    return `/messages/${encodeURIComponent(conversationId)}`;
  }

  if (intent === "TOUR") {
    if (typeof conversationId !== "string" || !conversationId) {
      await respondToInvite({ inviteId, response: "ACCEPTED" });
      return "/buyer/invites?status=accepted";
    }
    const { sendConversationMessage } = await import("./messaging/service");
    await sendConversationMessage({
      clientMessageId: crypto.randomUUID(),
      conversationId,
      kind: "GUIDED",
      templateKey: "BUYER_SCHEDULE_VIEWING",
      templateVersion: 1,
    });
    return `/messages/${encodeURIComponent(conversationId)}`;
  }

  await respondToInvite({ inviteId, response: "ACCEPTED" });
  try {
    const { createLoiNegotiation } = await import("./loi/service");
    const created = await createLoiNegotiation({ clientActionId: crypto.randomUUID(), inviteId });
    return `/negotiations/${encodeURIComponent(created.id)}`;
  } catch {
    return typeof conversationId === "string" && conversationId
      ? `/messages/${encodeURIComponent(conversationId)}`
      : "/buyer/invites?status=accepted";
  }
}

export async function blockBuyerProfile(formData: FormData) {
  const buyerProfileId = formData.get("buyerProfileId");
  if (typeof buyerProfileId !== "string") throw new Error("This profile is unavailable.");
  const { blockUserByBuyerProfile } = await import("./messaging/service");
  await blockUserByBuyerProfile({ buyerProfileId });
  revalidatePath("/seller/search");
  redirect("/seller/search?status=blocked");
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
