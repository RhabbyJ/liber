import "server-only";

import { prisma, type Prisma } from "@liber/db";
import { respondToInviteSchema } from "@liber/validators";
import { z } from "zod";
import type { ActionFeedbackState } from "../../lib/action-feedback";
import { MessagingError } from "../messaging/errors";
import { lockAndAssertInvitePairAvailable } from "../messaging/service";
import { normalizeInput } from "../normalize-input";
import { checkRateLimit } from "../rate-limit";
import { requireSessionRole } from "../session";
import { inviteFromDb, inviteModerationMessages, labelSyntheticInvites } from "./invite-projection";

export async function listBuyerInvites() {
  const user = await requireSessionRole("BUYER");
  const buyer = await prisma.buyerProfile.findUnique({ where: { userId: user.id }, select: { id: true } });
  if (!buyer) return { ok: true, data: [] };
  const validInviteIds = await prisma.$queryRaw<Array<{ id: string }>>`
    SELECT invite.id
    FROM public."Invite" invite
    WHERE invite."buyerProfileId" = ${buyer.id}
      AND app_private.is_invite_property_access_valid(invite.id, ${user.id}::uuid)
  `;
  const invites = await prisma.invite.findMany({
    where: { id: { in: validInviteIds.map((invite) => invite.id) } },
    include: {
      buyerProfile: { select: { displayName: true, userId: true, user: { select: { name: true } } } },
      conversation: {
        select: {
          id: true,
          messages: inviteModerationMessages,
        },
      },
      property: {
        select: {
          addressLine1: true,
          city: true,
          identityVersion: true,
          ownershipVerificationStatus: true,
          propertyType: true,
          condition: true,
          features: true,
          price: true,
          bedrooms: true,
          bathrooms: true,
          squareFeet: true,
          description: true,
          images: { select: { id: true, propertyIdentityVersion: true } },
        },
      },
    },
    orderBy: { sentAt: "desc" },
  });
  return { ok: true, data: await labelSyntheticInvites(invites.map(inviteFromDb), invites) };
}

export async function respondToInvite(input: unknown) {
  const user = await requireSessionRole("BUYER");
  const data = respondToInviteSchema.parse(normalizeInput(input));
  const changed = await prisma.$transaction(async (tx) => {
    const invite = await tx.invite.findFirst({
      where: { id: data.inviteId, buyerProfile: { userId: user.id } },
      select: { buyerProfileId: true, propertyId: true, sellerId: true },
    });
    if (!invite) return 0;

    await lockAndAssertInvitePairAvailable(tx, invite.sellerId, user.id);
    const locked = await tx.$queryRaw<Array<{ id: string; status: string }>>`
      SELECT id, status::text AS status
      FROM public."Invite"
      WHERE id = ${data.inviteId}
      FOR UPDATE
    `;
    if (locked.length !== 1) return 0;

    // Idempotent: repeating the same response must not fail the buyer UI.
    if (locked[0]?.status === data.response) return 1;

    const updated = await tx.$executeRaw`
      UPDATE public."Invite"
      SET status = CAST(${data.response} AS public."InviteStatus"),
          "respondedAt" = now(),
          "updatedAt" = now()
      WHERE id = ${data.inviteId}
        AND status IN ('SENT', 'VIEWED')
        AND "expiresAt" > now()
        AND app_private.is_invite_property_access_valid(id, ${user.id}::uuid)
    `;
    if (updated === 1 && data.response === "ACCEPTED") {
      await tx.$executeRaw`
        UPDATE public."Conversation"
        SET status = 'ACTIVE'::public."ConversationStatus",
            "updatedAt" = now()
        WHERE "inviteId" = ${data.inviteId}
          AND status = 'AWAITING_BUYER'::public."ConversationStatus"
      `;
    }
    if (updated === 1) {
      await tx.notification.create({ data: inviteResponseNotification(invite, data.inviteId, data.response) });
    }
    return updated;
  });
  if (changed !== 1) {
    const current = await prisma.invite.findFirst({
      where: { id: data.inviteId, buyerProfile: { userId: user.id } },
      select: { status: true },
    });
    if (current?.status === data.response) {
      return { ok: true, data };
    }
    throw new Error("Invite cannot be changed after response, identity change, or expiration.");
  }
  return { ok: true, data };
}

// Seller copy of a buyer's response; like other seller invite notices it carries the buyer profile.
function inviteResponseNotification(
  invite: { buyerProfileId: string; propertyId: string; sellerId: string },
  inviteId: string,
  response: "ACCEPTED" | "DECLINED",
) {
  const accepted = response === "ACCEPTED";
  return {
    body: accepted
      ? "A buyer accepted your property invite. Continue in your private conversation."
      : "A buyer declined your property invite. The conversation is now read-only.",
    metadata: { buyerProfileId: invite.buyerProfileId, inviteId, propertyId: invite.propertyId },
    title: accepted ? "Invite accepted" : "Invite declined",
    type: accepted ? "invite_accepted" : "invite_declined",
    userId: invite.sellerId,
  };
}

export async function listSellerInvites() {
  const seller = await requireSessionRole("SELLER");
  const invites = await prisma.invite.findMany({
    where: { sellerId: seller.id },
    include: {
      buyerProfile: { select: { displayName: true, userId: true, user: { select: { name: true } } } },
      conversation: {
        select: {
          id: true,
          messages: inviteModerationMessages,
        },
      },
      property: { select: { addressLine1: true, city: true, identityVersion: true, ownershipVerificationStatus: true, propertyType: true } },
    },
    orderBy: { sentAt: "desc" },
  });
  return { ok: true, data: await labelSyntheticInvites(invites.map(inviteFromDb), invites) };
}

export const inviteIdSchema = z.object({ inviteId: z.string().trim().min(1).max(200) });

type WithdrawnInvite = {
  buyerProfileId: string;
  buyerUserId: string;
  id: string;
  previousStatus: string;
  propertyId: string;
  sellerId: string;
};

export type InviteWithdrawal =
  | { outcome: "withdrawn"; invite: WithdrawnInvite }
  | { outcome: "already-withdrawn" | "closed" | "not-found" };

/**
 * Withdraws an open invite (SENT/VIEWED before its deadline, or ACCEPTED) inside the
 * caller's transaction. Takes the pair lock before the invite row, like responses and
 * messaging; the status triggers then close the conversation read-only and cancel any
 * queued invite email. Callers write their own notifications and audit row.
 */
export async function withdrawInviteInTransaction(
  tx: Prisma.TransactionClient,
  inviteId: string,
  sellerId?: string,
): Promise<InviteWithdrawal> {
  const invite = await tx.invite.findFirst({
    where: { id: inviteId, ...(sellerId ? { sellerId } : {}) },
    select: { buyerProfile: { select: { userId: true } }, buyerProfileId: true, id: true, propertyId: true, sellerId: true },
  });
  if (!invite) return { outcome: "not-found" };
  try {
    await lockAndAssertInvitePairAvailable(tx, invite.sellerId, invite.buyerProfile.userId);
  } catch (error) {
    // A block between the pair has already withdrawn every open invite.
    if (error instanceof MessagingError && error.code === "UNAVAILABLE") return { outcome: "closed" };
    throw error;
  }
  const [locked] = await tx.$queryRaw<Array<{ status: string }>>`
    SELECT status::text AS status
    FROM public."Invite"
    WHERE id = ${invite.id}
    FOR UPDATE
  `;
  if (!locked) return { outcome: "not-found" };
  if (locked.status === "WITHDRAWN") return { outcome: "already-withdrawn" };
  const updated = await tx.invite.updateMany({
    where: {
      id: invite.id,
      OR: [
        { status: "ACCEPTED" },
        { status: { in: ["SENT", "VIEWED"] }, expiresAt: { gt: new Date() } },
      ],
    },
    data: { status: "WITHDRAWN" },
  });
  if (updated.count !== 1) return { outcome: "closed" };
  return {
    outcome: "withdrawn",
    invite: {
      buyerProfileId: invite.buyerProfileId,
      buyerUserId: invite.buyerProfile.userId,
      id: invite.id,
      previousStatus: locked.status,
      propertyId: invite.propertyId,
      sellerId: invite.sellerId,
    },
  };
}

// Buyer copy: no buyerProfileId, matching the other buyer-side invite notices.
export function inviteWithdrawnBuyerNotice(invite: WithdrawnInvite) {
  return {
    body: "A property invite was withdrawn. Your conversation stays readable but is closed to new messages.",
    metadata: { inviteId: invite.id, propertyId: invite.propertyId },
    title: "Invite withdrawn",
    type: "invite_withdrawn",
    userId: invite.buyerUserId,
  };
}

export function inviteWithdrawalFeedback(outcome: InviteWithdrawal["outcome"], actor: "seller" | "admin"): ActionFeedbackState {
  if (outcome === "withdrawn") {
    return {
      ok: true,
      message: actor === "seller"
        ? "Invite withdrawn. The buyer was notified and the conversation is now read-only."
        : "Invite withdrawn. Both participants were notified and the conversation is now read-only.",
    };
  }
  if (outcome === "already-withdrawn") return { ok: true, message: "This invite was already withdrawn." };
  if (outcome === "closed") return { ok: false, message: "This invite is no longer open, so it can't be withdrawn. Refresh to see its status." };
  return { ok: false, message: "This invite is unavailable. Refresh the list and try again." };
}

export async function withdrawSellerInvite(input: unknown): Promise<ActionFeedbackState> {
  const seller = await requireSessionRole("SELLER");
  const limit = await checkRateLimit(`invite-withdraw:${seller.id}`, 60, 60 * 60_000);
  if (!limit.allowed) return { ok: false, message: "Withdrawal limit reached. Try again later." };
  const parsed = inviteIdSchema.safeParse(normalizeInput(input));
  if (!parsed.success) return { ok: false, message: "Choose an invite to withdraw, then try again." };
  const outcome = await prisma.$transaction(async (tx) => {
    const withdrawal = await withdrawInviteInTransaction(tx, parsed.data.inviteId, seller.id);
    if (withdrawal.outcome !== "withdrawn") return withdrawal.outcome;
    const { invite } = withdrawal;
    await tx.notification.create({ data: inviteWithdrawnBuyerNotice(invite) });
    await tx.adminAuditLog.create({
      data: {
        action: "withdraw_invite",
        actorUserId: seller.id,
        metadata: { buyerProfileId: invite.buyerProfileId, previousStatus: invite.previousStatus, propertyId: invite.propertyId },
        targetId: invite.id,
        targetType: "invite",
      },
    });
    return withdrawal.outcome;
  });
  return inviteWithdrawalFeedback(outcome, "seller");
}
