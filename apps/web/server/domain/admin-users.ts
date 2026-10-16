import "server-only";

import { prisma, type Prisma } from "@liber/db";
import { userModerationSchema } from "@liber/validators";
import { z } from "zod";
import type { ActionFeedbackState } from "../../lib/action-feedback";
import { queueAuthOperation } from "../auth-operations";
import { normalizeInput } from "../normalize-input";
import { checkRateLimit } from "../rate-limit";
import { reviewSellerAccessCommand } from "../seller-access-review";
import { requireSessionRole } from "../session";
import { cursorPage, cursorPageArgs } from "./shared";

export async function listUsers(cursor?: string) {
  const admin = await requireSessionRole("ADMIN");
  const rows = await prisma.user.findMany({
    include: { sellerAccess: { select: { status: true } } },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    ...cursorPageArgs(cursor, "uuid"),
  });
  const { items: users, nextCursor } = cursorPage(rows);
  return {
    ok: true,
    nextCursor,
    data: users.map((user) => ({
      id: user.id,
      isCurrentUser: user.id === admin.id,
      name: user.name || user.email,
      roles: user.roles,
      sellerAccessStatus: user.sellerAccess?.status ?? null,
      status: user.status,
    })),
  };
}

export async function reviewSellerAccess(input: unknown) {
  return reviewSellerAccessCommand(input);
}

type UserModeration =
  | { allowed: false; feedback: ActionFeedbackState }
  | { allowed: true; admin: { id: string }; reason?: string; userId: string };

async function authorizeUserModeration(input: unknown): Promise<UserModeration> {
  const admin = await requireSessionRole("ADMIN");
  const limit = await checkRateLimit(`admin-moderation:${admin.id}`, 30, 60 * 60_000);
  if (!limit.allowed) return { allowed: false, feedback: { ok: false, message: "Moderation limit reached. Try again later." } };
  const parsed = userModerationSchema.safeParse(normalizeInput(input));
  if (!parsed.success || !z.uuid().safeParse(parsed.data.userId).success) {
    return { allowed: false, feedback: { ok: false, message: "Choose a user and keep the reason under 500 characters." } };
  }
  return { allowed: true, admin, reason: parsed.data.reason, userId: parsed.data.userId };
}

// Suspension, reinstatement, and invite creation lock the user row first, then the
// buyer profile, seller access, and properties.
async function lockAccountStatus(tx: Prisma.TransactionClient, userId: string) {
  const [account] = await tx.$queryRaw<Array<{ status: string }>>`
    SELECT status::text AS status FROM public."User" WHERE id = ${userId}::uuid FOR UPDATE
  `;
  return account?.status ?? null;
}

export async function suspendUser(input: unknown): Promise<ActionFeedbackState> {
  const authorized = await authorizeUserModeration(input);
  if (!authorized.allowed) return authorized.feedback;
  const { admin, reason, userId } = authorized;
  return prisma.$transaction(async (tx) => {
    const status = await lockAccountStatus(tx, userId);
    if (!status) return { ok: false, message: "This user is no longer available. Refresh the users list." };
    if (status === "SUSPENDED") return { ok: true, message: "This account is already suspended. No changes were needed." };
    await tx.user.update({
      where: { id: userId },
      data: { status: "SUSPENDED", suspendedAt: new Date() },
    });
    // An admin-hidden profile stays HIDDEN so reinstatement cannot undo that decision.
    await tx.buyerProfile.updateMany({
      where: { userId, visibilityStatus: { not: "HIDDEN" } },
      data: { visibilityStatus: "SUSPENDED" },
    });
    await tx.sellerAccess.updateMany({
      where: { userId },
      data: { status: "SUSPENDED" },
    });
    await tx.sellerProperty.updateMany({
      where: { ownerUserId: userId },
      data: { flaggedForReviewAt: new Date(), status: "ARCHIVED" },
    });
    await tx.invite.updateMany({
      where: {
        OR: [
          { sellerId: userId },
          { buyerProfile: { userId } },
        ],
        status: { in: ["SENT", "VIEWED", "ACCEPTED"] },
      },
      data: { status: "WITHDRAWN" },
    });
    const authOperationId = await queueAuthOperation(tx, userId, "BAN_USER", "Superseded by suspension before it ran.");
    await tx.adminAuditLog.create({
      data: {
        action: "suspend_user",
        actorUserId: admin.id,
        metadata: { reason, authOperationId },
        targetId: userId,
        targetType: "user",
      },
    });
    return { ok: true, message: "User suspended. Their Supabase sign-in is blocked once the queued Auth update runs." };
  });
}

function restoredPropertyStatus(property: {
  authorityAttestedByUserId: string | null;
  authorityAttestedIdentityVersion: number | null;
  identityVersion: number;
  ownerUserId: string;
  ownershipVerificationStatus: string;
}) {
  if (
    property.ownershipVerificationStatus === "APPROVED"
    && property.authorityAttestedByUserId === property.ownerUserId
    && property.authorityAttestedIdentityVersion === property.identityVersion
  ) return "READY_FOR_INVITES" as const;
  return property.ownershipVerificationStatus === "PENDING" ? "READY_FOR_REVIEW" as const : "DRAFT" as const;
}

/**
 * Reverses a suspension without restoring anything that needs a fresh decision:
 * the buyer profile returns as a draft to republish (or stays hidden after an admin
 * hide), seller-directory access returns to review, withdrawn invites and their
 * read-only conversations stay closed, and the Auth ban is lifted by a queued unban.
 */
export async function reinstateUser(input: unknown): Promise<ActionFeedbackState> {
  const authorized = await authorizeUserModeration(input);
  if (!authorized.allowed) return authorized.feedback;
  const { admin, reason, userId } = authorized;
  return prisma.$transaction(async (tx) => {
    const status = await lockAccountStatus(tx, userId);
    if (!status) return { ok: false, message: "This user is no longer available. Refresh the users list." };
    if (status !== "SUSPENDED") return { ok: true, message: "This account is already active. No changes were needed." };
    await tx.user.update({ where: { id: userId }, data: { status: "ACTIVE", suspendedAt: null } });

    await tx.$queryRaw`SELECT id FROM public."BuyerProfile" WHERE "userId" = ${userId}::uuid FOR UPDATE`;
    const profile = await tx.buyerProfile.findUnique({ where: { userId }, select: { id: true, visibilityStatus: true } });
    let buyerProfileVisibility: "DRAFT" | "HIDDEN" | null = null;
    if (profile?.visibilityStatus === "SUSPENDED") {
      // Suspensions before HIDDEN was preserved overwrote it; the last hide/unhide decision still applies.
      const lastVisibilityDecision = await tx.adminAuditLog.findFirst({
        where: { action: { in: ["hide_buyer_profile", "unhide_buyer_profile"] }, targetId: profile.id, targetType: "buyer_profile" },
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        select: { action: true },
      });
      buyerProfileVisibility = lastVisibilityDecision?.action === "hide_buyer_profile" ? "HIDDEN" : "DRAFT";
      await tx.buyerProfile.update({ where: { id: profile.id }, data: { visibilityStatus: buyerProfileVisibility } });
    }

    const sellerAccess = await tx.sellerAccess.updateMany({
      where: { userId, status: "SUSPENDED" },
      data: { status: "PENDING" },
    });

    // Suspension is the only path that flags properties for review. Lock them so a
    // concurrent document review cannot change the evidence state read below.
    await tx.$queryRaw`
      SELECT id FROM public."SellerProperty"
      WHERE "ownerUserId" = ${userId}::uuid AND "flaggedForReviewAt" IS NOT NULL
      ORDER BY id
      FOR UPDATE
    `;
    const properties = await tx.sellerProperty.findMany({
      where: { ownerUserId: userId, flaggedForReviewAt: { not: null } },
      select: {
        authorityAttestedByUserId: true,
        authorityAttestedIdentityVersion: true,
        id: true,
        identityVersion: true,
        ownerUserId: true,
        ownershipVerificationStatus: true,
        status: true,
      },
    });
    for (const property of properties) {
      await tx.sellerProperty.update({
        where: { id: property.id },
        data: {
          flaggedForReviewAt: null,
          status: property.status === "ARCHIVED" ? restoredPropertyStatus(property) : property.status,
        },
      });
    }

    const authOperationId = await queueAuthOperation(tx, userId, "UNBAN_USER", "Superseded by reinstatement before it ran.");
    await tx.notification.create({
      data: {
        body: [
          "Your Liber account is active again.",
          buyerProfileVisibility === "DRAFT" ? "Republish your buyer profile when you’re ready." : null,
          sellerAccess.count ? "Seller directory access needs a new admin review." : null,
        ].filter(Boolean).join(" "),
        metadata: { buyerProfileVisibility, sellerAccessStatus: sellerAccess.count ? "PENDING" : null },
        title: "Account reinstated",
        type: "account_reinstated",
        userId,
      },
    });
    await tx.adminAuditLog.create({
      data: {
        action: "reinstate_user",
        actorUserId: admin.id,
        metadata: {
          authOperationId,
          buyerProfileVisibility,
          reason,
          restoredPropertyIds: properties.map((property) => property.id),
          sellerAccessStatus: sellerAccess.count ? "PENDING" : null,
        },
        targetId: userId,
        targetType: "user",
      },
    });
    return {
      ok: true,
      message: "User reinstated. Sign-in unblocks when the queued Auth update runs; seller access returns to review.",
    };
  });
}
