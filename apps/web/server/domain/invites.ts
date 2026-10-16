import "server-only";

import { prisma } from "@liber/db";
import { respondToInviteSchema } from "@liber/validators";
import { lockAndAssertInvitePairAvailable } from "../messaging/service";
import { normalizeInput } from "../normalize-input";
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
