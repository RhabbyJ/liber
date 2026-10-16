import "server-only";

import { prisma, type Prisma } from "@liber/db";
import { buyerProfileModerationSchema } from "@liber/validators";
import { z } from "zod";
import type { ActionFeedbackState } from "../../lib/action-feedback";
import { withOwnerTestPreapproval } from "../../lib/test-preapproval";
import { withdrawOpenBuyerInvites } from "../buyer/open-invites";
import { publicationFieldsSelect, publicationGap } from "../buyer/publication";
import { normalizeInput } from "../normalize-input";
import { checkRateLimit } from "../rate-limit";
import { requireSessionRole } from "../session";
import { activeTestPreapprovalProfileIds } from "../test-preapproval";
import { buyerFromDb, buyerInclude } from "./buyer-projection";
import { inviteFromDb, inviteModerationMessages, labelSyntheticInvites } from "./invite-projection";
import {
  inviteIdSchema,
  inviteWithdrawalFeedback,
  inviteWithdrawnBuyerNotice,
  withdrawInviteInTransaction,
} from "./invites";
import { auditMetadataField, cursorPage, cursorPageArgs } from "./shared";

const adminInviteWithdrawalSchema = inviteIdSchema.extend({ reason: z.string().trim().min(1).max(500) });

export async function listAdminBuyerProfiles(cursor?: string) {
  await requireSessionRole("ADMIN");
  const rows = await prisma.buyerProfile.findMany({
    include: { ...buyerInclude, user: { select: { avatarVariant: true, name: true, email: true } } },
    orderBy: [{ updatedAt: "desc" }, { id: "desc" }],
    ...cursorPageArgs(cursor, "rowId"),
  });
  const { items: buyers, nextCursor } = cursorPage(rows);
  const documents = buyers.length
    ? await prisma.verificationDocument.findMany({
        where: {
          buyerProfileId: { in: buyers.map((buyer) => buyer.id) },
          reviewStatus: "APPROVED",
        },
        orderBy: { reviewedAt: "desc" },
        select: {
          documentType: true,
          fileSha256: true,
          id: true,
          buyerProfileId: true,
          originalFilename: true,
        },
      })
    : [];
  const documentsByBuyer = new Map<string, typeof documents>();
  for (const document of documents) {
    if (!document.buyerProfileId) continue;
    documentsByBuyer.set(document.buyerProfileId, [
      ...(documentsByBuyer.get(document.buyerProfileId) ?? []),
      document,
    ]);
  }
  const testPreapprovalIds = await activeTestPreapprovalProfileIds(prisma, buyers.map((buyer) => buyer.id));

  return {
    ok: true,
    nextCursor,
    data: buyers.map((buyer) => ({
      ...withOwnerTestPreapproval(buyerFromDb(buyer), testPreapprovalIds),
      accountName: buyer.user.name,
      accountEmail: buyer.user.email,
      approvedDocuments: documentsByBuyer.get(buyer.id) ?? [],
      moderationStatus: buyer.visibilityStatus,
    })),
  };
}

const moderationLimitReached: ActionFeedbackState = { ok: false, message: "Moderation limit reached. Try again later." };
const profileUnavailable: ActionFeedbackState = { ok: false, message: "This buyer profile is no longer available. Refresh the list." };

type ProfileModeration =
  | { allowed: false; feedback: ActionFeedbackState }
  | { allowed: true; admin: { id: string }; data: { buyerProfileId: string; reason?: string } };

async function authorizeProfileModeration(input: unknown): Promise<ProfileModeration> {
  const admin = await requireSessionRole("ADMIN");
  const limit = await checkRateLimit(`admin-moderation:${admin.id}`, 30, 60 * 60_000);
  if (!limit.allowed) return { allowed: false, feedback: moderationLimitReached };
  const parsed = buyerProfileModerationSchema.safeParse(normalizeInput(input));
  if (!parsed.success) {
    return { allowed: false, feedback: { ok: false, message: "Choose a buyer profile and keep the reason under 500 characters." } };
  }
  return { allowed: true, admin, data: parsed.data };
}

/**
 * Locks the owning account, then the profile: the order suspension and buyer saves use,
 * so moderation serializes with them instead of deadlocking.
 */
async function lockProfileForModeration(tx: Prisma.TransactionClient, buyerProfileId: string) {
  const target = await tx.buyerProfile.findUnique({ where: { id: buyerProfileId }, select: { userId: true } });
  if (!target) return null;
  const [owner] = await tx.$queryRaw<Array<{ status: string }>>`
    SELECT status::text AS status FROM public."User" WHERE id = ${target.userId}::uuid FOR SHARE
  `;
  const [profile] = await tx.$queryRaw<Array<{ visibility: string }>>`
    SELECT "visibilityStatus"::text AS visibility
    FROM public."BuyerProfile"
    WHERE id = ${buyerProfileId}
    FOR UPDATE
  `;
  return profile ? { ownerStatus: owner?.status ?? null, userId: target.userId, visibility: profile.visibility } : null;
}

/**
 * Hides a profile from sellers and previews and withdraws its open invites (their
 * conversations close read-only). The prior visibility is audited so unhide can restore it.
 */
export async function hideBuyerProfile(input: unknown): Promise<ActionFeedbackState> {
  const authorized = await authorizeProfileModeration(input);
  if (!authorized.allowed) return authorized.feedback;
  const { admin, data } = authorized;
  return prisma.$transaction(async (tx) => {
    const profile = await lockProfileForModeration(tx, data.buyerProfileId);
    if (!profile) return profileUnavailable;
    if (profile.visibility === "HIDDEN") return { ok: true, message: "This profile is already hidden. No changes were needed." };
    const withdrawnInvites = await withdrawOpenBuyerInvites(tx, data.buyerProfileId);
    await tx.buyerProfile.update({ where: { id: data.buyerProfileId }, data: { visibilityStatus: "HIDDEN" } });
    await tx.adminAuditLog.create({
      data: {
        action: "hide_buyer_profile",
        actorUserId: admin.id,
        metadata: { previousVisibility: profile.visibility, reason: data.reason, withdrawnInvites },
        targetId: data.buyerProfileId,
        targetType: "buyer_profile",
      },
    });
    return { ok: true, message: "Profile hidden from sellers and previews. The buyer can’t edit or republish it until you unhide it." };
  });
}

/**
 * Reverses an admin hide. A profile that was live when hidden goes live again if it
 * still meets every publication rule; anything else returns to the buyer as a draft
 * they can republish. Suspended accounts must be reinstated first.
 */
export async function unhideBuyerProfile(input: unknown): Promise<ActionFeedbackState> {
  const authorized = await authorizeProfileModeration(input);
  if (!authorized.allowed) return authorized.feedback;
  const { admin, data } = authorized;
  return prisma.$transaction(async (tx) => {
    // The account lock also keeps a concurrent suspension from being undone.
    const profile = await lockProfileForModeration(tx, data.buyerProfileId);
    if (!profile) return profileUnavailable;
    if (profile.visibility !== "HIDDEN") return { ok: true, message: "This profile isn’t hidden. No changes were needed." };
    if (profile.ownerStatus !== "ACTIVE") {
      return { ok: false, message: "This account is suspended. Reinstate the user before unhiding the profile." };
    }
    const lastHide = await tx.adminAuditLog.findFirst({
      where: { action: "hide_buyer_profile", targetId: data.buyerProfileId, targetType: "buyer_profile" },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      select: { metadata: true },
    });
    const stored = await tx.buyerProfile.findUnique({ where: { id: data.buyerProfileId }, select: publicationFieldsSelect });
    const restored = auditMetadataField(lastHide?.metadata, "previousVisibility") === "ACTIVE" && stored && publicationGap(stored) === null
      ? "ACTIVE"
      : "DRAFT";
    await tx.buyerProfile.update({ where: { id: data.buyerProfileId }, data: { visibilityStatus: restored } });
    await tx.notification.create({
      data: {
        body: restored === "ACTIVE"
          ? "An admin restored your buyer profile. Approved sellers can find it again."
          : "An admin restored your buyer profile. Republish it from your profile when you’re ready.",
        metadata: { buyerProfileId: data.buyerProfileId, visibility: restored },
        title: "Buyer profile restored",
        type: "buyer_profile_unhidden",
        userId: profile.userId,
      },
    });
    await tx.adminAuditLog.create({
      data: {
        action: "unhide_buyer_profile",
        actorUserId: admin.id,
        metadata: { reason: data.reason, restoredVisibility: restored },
        targetId: data.buyerProfileId,
        targetType: "buyer_profile",
      },
    });
    return {
      ok: true,
      message: restored === "ACTIVE"
        ? "Profile unhidden and live to approved sellers again."
        : "Profile unhidden as a draft. The buyer can republish it.",
    };
  });
}

export async function listAdminInvites(cursor?: string) {
  await requireSessionRole("ADMIN");
  const rows = await prisma.invite.findMany({
    include: {
      buyerProfile: { select: { displayName: true, userId: true, user: { select: { name: true } } } },
      conversation: {
        select: {
          messages: inviteModerationMessages,
        },
      },
      property: { select: { addressLine1: true, city: true, identityVersion: true, ownershipVerificationStatus: true, propertyType: true } },
    },
    orderBy: [{ sentAt: "desc" }, { id: "desc" }],
    ...cursorPageArgs(cursor, "rowId"),
  });
  const { items: invites, nextCursor } = cursorPage(rows);
  return { ok: true, nextCursor, data: await labelSyntheticInvites(invites.map(inviteFromDb), invites) };
}

/** Audited moderation withdrawal of any open invite; the reason stays in the audit log. */
export async function withdrawInviteAsAdmin(input: unknown): Promise<ActionFeedbackState> {
  const admin = await requireSessionRole("ADMIN");
  const limit = await checkRateLimit(`admin-moderation:${admin.id}`, 30, 60 * 60_000);
  if (!limit.allowed) return { ok: false, message: "Moderation limit reached. Try again later." };
  const parsed = adminInviteWithdrawalSchema.safeParse(normalizeInput(input));
  if (!parsed.success) return { ok: false, message: "Add an internal reason of up to 500 characters, then try again." };
  const { inviteId, reason } = parsed.data;
  const outcome = await prisma.$transaction(async (tx) => {
    const withdrawal = await withdrawInviteInTransaction(tx, inviteId);
    if (withdrawal.outcome !== "withdrawn") return withdrawal.outcome;
    const { invite } = withdrawal;
    await tx.notification.create({ data: inviteWithdrawnBuyerNotice(invite) });
    await tx.notification.create({
      data: {
        body: "Liber withdrew one of your invites after review. The conversation is now read-only.",
        metadata: { buyerProfileId: invite.buyerProfileId, inviteId: invite.id, propertyId: invite.propertyId },
        title: "Invite withdrawn by Liber",
        type: "invite_withdrawn",
        userId: invite.sellerId,
      },
    });
    await tx.adminAuditLog.create({
      data: {
        action: "admin_withdraw_invite",
        actorUserId: admin.id,
        metadata: {
          buyerProfileId: invite.buyerProfileId,
          previousStatus: invite.previousStatus,
          propertyId: invite.propertyId,
          reason,
          sellerId: invite.sellerId,
        },
        targetId: invite.id,
        targetType: "invite",
      },
    });
    return withdrawal.outcome;
  });
  return inviteWithdrawalFeedback(outcome, "admin");
}
