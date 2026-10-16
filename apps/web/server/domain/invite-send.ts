import "server-only";

import { prisma } from "@liber/db";
import { sendInviteSchema } from "@liber/validators";
import { requireApprovedSellerAccess } from "../access";
import { sellerBuyerSelect } from "../buyer/read-models";
import type { EmailResult } from "../email";
import { InviteSendError } from "../invite-send-errors";
import { inviteExpiresAt } from "../maintenance";
import { normalizeMessageBody } from "../messaging/content";
import { messagingInviteUnavailable } from "../messaging/errors";
import { messagingV1EnabledForPair } from "../messaging/feature";
import { lockAndAssertInvitePairAvailable } from "../messaging/service";
import { resolveMessagingTemplate } from "../messaging/templates";
import { normalizeInput } from "../normalize-input";
import { assertRateLimit } from "../rate-limit";
import { activePrimaryServiceAreaWhere } from "../service-area-matching";
import { assertSyntheticPropertyInvite, TEST_PROPERTY_LABEL } from "../synthetic-property-review";
import { inviteFromDb } from "./invite-projection";

export async function sendInvite(input: unknown) {
  const seller = await requireApprovedSellerAccess();
  await assertRateLimit(`invite-send:${seller.id}`, 30, 60 * 60_000);
  const data = sendInviteSchema.parse(normalizeInput(input));
  const openingTemplate = resolveMessagingTemplate({
    key: data.templateKey,
    role: "SELLER",
    use: "OPENING",
    version: data.templateVersion,
  });
  const openingNote = data.note ? normalizeMessageBody(data.note) : undefined;
  const inviteMessage = openingNote ? `${openingTemplate.text}\n\n${openingNote}` : openingTemplate.text;
  const inviteTitle = "Property invitation";
  const result = await prisma.$transaction(async (tx) => {
    await tx.$queryRaw`
      SELECT pg_advisory_xact_lock(hashtextextended(${seller.id}::text, 0)) IS NULL AS locked
    `;
    // An interactive transaction owns one connection: query it sequentially.
    // node-postgres would queue concurrent queries anyway and pg@9 rejects them.
    const buyer = await tx.buyerProfile.findFirst({
      where: {
        id: data.buyerProfileId,
        visibilityStatus: "ACTIVE",
        user: { status: "ACTIVE" },
        ...activePrimaryServiceAreaWhere(),
      },
      select: sellerBuyerSelect(),
    });
    const property = await tx.sellerProperty.findFirst({ where: { id: data.propertyId, ownerUserId: seller.id } });
    const sentInviteCount = await tx.invite.count({
      where: { sellerId: seller.id, sentAt: { gte: new Date(Date.now() - 86_400_000) } },
    });
    const activeDuplicate = await tx.invite.findFirst({
      where: {
        buyerProfileId: data.buyerProfileId,
        propertyId: data.propertyId,
        sellerId: seller.id,
        status: { in: ["SENT", "VIEWED", "ACCEPTED"] },
      },
      select: { id: true, conversation: { select: { id: true } } },
    });
    const access = await tx.sellerAccess.findFirst({ where: { userId: seller.id, status: "APPROVED" }, select: { id: true } });
    if (!access) throw new InviteSendError("ACCESS_REQUIRED", "Seller directory access must be approved before sending invites.");
    if (!buyer) throw messagingInviteUnavailable();
    await lockAndAssertInvitePairAvailable(tx, seller.id, buyer.userId);
    if (!property) throw new InviteSendError("PROPERTY_UNAVAILABLE", "Seller must own property before sending invites.");
    if (buyer.userId === seller.id) throw new InviteSendError("SELF_INVITE", "Sellers cannot invite their own buyer profile.");
    if (
      property.flaggedForReviewAt
      || property.status !== "READY_FOR_INVITES"
      || property.ownershipVerificationStatus !== "APPROVED"
      || property.authorityAttestedByUserId !== seller.id
      || property.authorityAttestedIdentityVersion !== property.identityVersion
    ) {
      throw new InviteSendError("OWNERSHIP_REQUIRED", "Property must have current ownership approval before sending invites.", { propertyId: property.id });
    }
    if (activeDuplicate) throw new InviteSendError("DUPLICATE", "An active invite already exists for this buyer and property.", {
      conversationId: messagingV1EnabledForPair(seller.id, buyer.userId) ? activeDuplicate.conversation?.id : undefined,
    });
    if (sentInviteCount >= 25) throw new InviteSendError("DAILY_LIMIT", "Seller rolling 24-hour invite limit reached.");
    const syntheticApproved = await assertSyntheticPropertyInvite(tx, property, buyer.userId);

    const created = await tx.invite.create({
      data: {
        buyerProfileId: data.buyerProfileId,
        message: inviteMessage,
        openingNote,
        openingTemplateKey: openingTemplate.key,
        openingTemplateVersion: openingTemplate.version,
        propertyId: data.propertyId,
        propertyIdentityVersion: property.identityVersion,
        sellerId: seller.id,
        title: inviteTitle,
        expiresAt: inviteExpiresAt(),
      },
      include: {
        buyerProfile: {
          select: {
            displayName: true,
            user: { select: { email: true, name: true } },
            userId: true,
          },
        },
        property: {
          select: {
            addressLine1: true,
            city: true,
            identityVersion: true,
            ownershipVerificationStatus: true,
            propertyType: true,
            state: true,
          },
        },
      },
    });
    await tx.notification.create({
      data: {
        body: "A seller sent a property invite.",
        metadata: { inviteId: created.id, propertyId: created.propertyId },
        title: inviteTitle,
        type: "invite_received",
        userId: created.buyerProfile.userId,
      },
    });
    await tx.notification.create({
      data: {
        body: "Your manual invite was sent to the buyer.",
        metadata: { buyerProfileId: created.buyerProfileId, inviteId: created.id, propertyId: created.propertyId },
        title: inviteTitle,
        type: "invite_sent",
        userId: seller.id,
      },
    });
    await tx.emailOutbox.create({
      data: {
        idempotencyKey: `invite-email:${created.id}`,
        inviteId: created.id,
        payload: {},
        status: "PENDING",
        subject: "You have a Liber invitation",
        templateName: "invite",
        to: created.buyerProfile.user.email,
        type: "INVITE",
      },
    });
    await tx.adminAuditLog.create({
      data: {
        action: "invite_sent",
        actorUserId: seller.id,
        metadata: { buyerProfileId: created.buyerProfileId, propertyId: created.propertyId, ...(syntheticApproved ? { syntheticPropertyApproval: true } : {}) },
        targetId: created.id,
        targetType: "invite",
      },
    });
    const [conversation] = await tx.$queryRaw<Array<{ id: string }>>`
      SELECT conversation.id
      FROM public."Conversation" conversation
      WHERE conversation."inviteId" = ${created.id}
        AND (
          SELECT count(*)
          FROM public."ConversationParticipant" participant
          WHERE participant."conversationId" = conversation.id
        ) = 2
        AND (
          SELECT count(*)
          FROM public."ConversationParticipant" participant
          WHERE participant."conversationId" = conversation.id
            AND participant."userId" = ${seller.id}::uuid
            AND participant.role = 'SELLER'::public."ConversationParticipantRole"
        ) = 1
        AND (
          SELECT count(*)
          FROM public."ConversationParticipant" participant
          WHERE participant."conversationId" = conversation.id
            AND participant."userId" = ${created.buyerProfile.userId}::uuid
            AND participant.role = 'BUYER'::public."ConversationParticipantRole"
        ) = 1
        AND (
          SELECT count(*)
          FROM public."Message" message
          WHERE message."conversationId" = conversation.id
            AND message.kind = 'INVITE'::public."MessageKind"
        ) = 1
    `;
    if (!conversation) throw new Error("Invite conversation trigger did not create a conversation.");
    return { conversationId: conversation.id, created, syntheticApproved };
  });
  const email: EmailResult = { provider: "outbox", queued: true };
  const conversationAvailable = messagingV1EnabledForPair(seller.id, result.created.buyerProfile.userId);
  return {
    ok: true,
    data: {
      ...inviteFromDb({ ...result.created, conversation: { id: result.conversationId } }),
      ...(result.syntheticApproved ? { propertyStatus: TEST_PROPERTY_LABEL } : {}),
      conversationAvailable,
      conversationId: conversationAvailable ? result.conversationId : undefined,
      email,
    },
  };
}
