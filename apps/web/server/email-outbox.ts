import { prisma } from "@liber/db";
import { sendInviteEmail, sendLoiUpdateEmail, sendUnreadMessageEmail, type EmailResult } from "./email";
import { loiV1EnabledForPair } from "./loi/feature";
import { messagingV1EnabledForPair } from "./messaging/feature";

const MAX_ATTEMPTS = 5;
const LEASE_MS = 2 * 60_000;
const LOI_OUTBOX_KEY_PATTERN = /^loi-update:([0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}):([0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12})$/i;

type ClaimedEmailJob = {
  id: string;
  type: string;
  attempts: number;
  idempotencyKey: string;
  inviteId: string | null;
  messageConversationId: string | null;
  messageRecipientUserId: string | null;
  loiNegotiationId: string | null;
  loiRevisionId: string | null;
  loiRecipientUserId: string | null;
};

export async function processEmailOutbox(limit = 10, workerId = `email_${crypto.randomUUID()}`) {
  const jobs = await claimEmailJobs(limit, workerId);
  let sent = 0;
  let failed = 0;
  let cancelled = 0;

  for (const job of jobs) {
    try {
      const delivery = await prepareEmailDelivery(job);
      if (!delivery.deliverable) {
        await prisma.emailOutbox.updateMany({
          where: { id: job.id, status: "SENDING", workerId },
          data: {
            lastError: delivery.reason,
            leaseUntil: null,
            lockedAt: null,
            nextAttemptAt: null,
            status: "CANCELLED",
            workerId: null,
          },
        });
        cancelled += 1;
        continue;
      }
      const result = await delivery.send();
      if (result.provider === "mock" && process.env.NODE_ENV !== "development" && process.env.NODE_ENV !== "test") {
        throw new Error(result.reason || "Email provider is not configured.");
      }
      await prisma.emailOutbox.updateMany({
        where: { id: job.id, status: "SENDING", workerId },
        data: {
          lastError: null,
          leaseUntil: null,
          lockedAt: null,
          nextAttemptAt: null,
          providerMessageId: result.id ?? (result.provider === "mock" ? "development-mock" : null),
          sentAt: new Date(),
          status: "SENT",
          workerId: null,
        },
      });
      sent += 1;
    } catch (error) {
      const message = error instanceof Error ? error.message : "Email job failed.";
      const retryDelayMs = Math.min(60, 2 ** job.attempts) * 60_000;
      await prisma.emailOutbox.updateMany({
        where: { id: job.id, status: "SENDING", workerId },
        data: {
          lastError: message,
          leaseUntil: null,
          lockedAt: null,
          nextAttemptAt: job.attempts >= MAX_ATTEMPTS ? null : new Date(Date.now() + retryDelayMs),
          status: "FAILED",
          workerId: null,
        },
      });
      failed += 1;
    }
  }

  await prisma.workerHeartbeat.upsert({
    where: { worker: "email-outbox" },
    update: { lastRunAt: new Date(), metadata: { cancelled, failed, processed: jobs.length, sent } },
    create: { worker: "email-outbox", lastRunAt: new Date(), metadata: { cancelled, failed, processed: jobs.length, sent } },
  });
  return { cancelled, failed, processed: jobs.length, sent };
}

export async function claimEmailJobs(limit: number, workerId: string): Promise<ClaimedEmailJob[]> {
  const leaseUntil = new Date(Date.now() + LEASE_MS);
  return prisma.$queryRaw<ClaimedEmailJob[]>`
    WITH candidates AS (
      SELECT id
      FROM public."EmailOutbox"
      WHERE attempts < ${MAX_ATTEMPTS}
        AND (
          (status IN ('PENDING', 'FAILED') AND ("nextAttemptAt" IS NULL OR "nextAttemptAt" <= now()))
          OR (status = 'SENDING' AND ("leaseUntil" IS NULL OR "leaseUntil" <= now()))
        )
      ORDER BY "createdAt" ASC
      FOR UPDATE SKIP LOCKED
      LIMIT ${limit}
    )
    UPDATE public."EmailOutbox" job
    SET
      attempts = job.attempts + 1,
      status = 'SENDING',
      "lockedAt" = now(),
      "leaseUntil" = ${leaseUntil},
      "workerId" = ${workerId},
      "updatedAt" = now()
    FROM candidates
    WHERE job.id = candidates.id
    RETURNING
      job.id,
      job.type,
      job.attempts,
      job."inviteId" AS "inviteId",
      job."messageConversationId" AS "messageConversationId",
      job."messageRecipientUserId" AS "messageRecipientUserId",
      job."loiNegotiationId" AS "loiNegotiationId",
      job."loiRevisionId" AS "loiRevisionId",
      job."loiRecipientUserId" AS "loiRecipientUserId",
      job."idempotencyKey" AS "idempotencyKey"
  `;
}

async function inviteDeliveryEmail(inviteId: string) {
  const [result] = await prisma.$queryRaw<Array<{
    current_email: string | null;
    deliverable: boolean;
  }>>`
    SELECT
      buyer_user.email AS current_email,
      app_private.is_invite_deliverable(invite.id) AS deliverable
    FROM public."Invite" invite
    JOIN public."BuyerProfile" buyer ON buyer.id = invite."buyerProfileId"
    JOIN public."User" buyer_user ON buyer_user.id = buyer."userId"
    WHERE invite.id = ${inviteId}
  `;
  return result?.deliverable ? result.current_email?.trim() || null : null;
}

async function prepareEmailDelivery(job: ClaimedEmailJob): Promise<
  | { deliverable: false; reason: string }
  | { deliverable: true; send: () => Promise<EmailResult> }
> {
  if (job.type === "INVITE") {
    const currentEmail = job.inviteId ? await inviteDeliveryEmail(job.inviteId) : null;
    if (!currentEmail) {
      return { deliverable: false, reason: "Invite became ineligible before delivery." };
    }
    return {
      deliverable: true,
      send: () => sendInviteEmail({ to: currentEmail }, job.idempotencyKey),
    };
  }

  if (job.type === "MESSAGE_UNREAD") {
    const currentEmail = job.messageConversationId && job.messageRecipientUserId
      ? await unreadMessageDeliveryEmail(job.messageConversationId, job.messageRecipientUserId)
      : null;
    if (!currentEmail) {
      return { deliverable: false, reason: "Unread message notification became ineligible before delivery." };
    }
    return {
      deliverable: true,
      send: () => sendUnreadMessageEmail({
        conversationId: job.messageConversationId!,
        to: currentEmail,
      }, job.idempotencyKey),
    };
  }

  if (job.type === "LOI_UPDATE") {
    const eventId = loiEventIdFromOutboxKey(job.idempotencyKey, job.loiRecipientUserId);
    const currentEmail = job.loiNegotiationId && job.loiRevisionId && job.loiRecipientUserId && eventId
      ? await loiUpdateDeliveryEmail(job.loiNegotiationId, job.loiRevisionId, job.loiRecipientUserId, eventId)
      : null;
    if (!currentEmail) return { deliverable: false, reason: "LOI update became ineligible before delivery." };
    return {
      deliverable: true,
      send: () => sendLoiUpdateEmail({ negotiationId: job.loiNegotiationId!, to: currentEmail }, job.idempotencyKey),
    };
  }

  throw new Error(`Unsupported email job type: ${job.type}`);
}

function loiEventIdFromOutboxKey(idempotencyKey: string, recipientUserId: string | null) {
  const match = LOI_OUTBOX_KEY_PATTERN.exec(idempotencyKey);
  if (!match || !recipientUserId || match[2]?.toLowerCase() !== recipientUserId.toLowerCase()) return null;
  return match[1]!.toLowerCase();
}

async function loiUpdateDeliveryEmail(negotiationId: string, revisionId: string, recipientUserId: string, eventId: string) {
  const [result] = await prisma.$queryRaw<Array<{ buyer_user_id: string; deliverable: boolean; recipient_email: string | null; seller_user_id: string }>>`
    SELECT negotiation."buyerUserId" AS buyer_user_id,
      negotiation."sellerUserId" AS seller_user_id,
      recipient.email AS recipient_email,
      (
        negotiation."currentRevisionId" = ${revisionId}::uuid
        AND (
          (
            negotiation.status IN ('AWAITING_SELLER_RESPONSE', 'AWAITING_BUYER_RESPONSE')
            AND delivery_event.type IN ('INITIAL_SUBMITTED', 'COUNTER_SUBMITTED')
            AND delivery_event."actorUserId" = current_revision."submittedByUserId"
            AND recipient.id <> current_revision."submittedByUserId"
          )
          OR (
            negotiation.status = 'TERMS_ALIGNED'
            AND delivery_event.type = 'TERMS_ALIGNED'
            AND delivery_event."actorUserId" <> current_revision."submittedByUserId"
            AND recipient.id = current_revision."submittedByUserId"
          )
          OR (
            negotiation.status = 'DECLINED'
            AND delivery_event.type = 'DECLINED'
            AND delivery_event."actorUserId" <> current_revision."submittedByUserId"
            AND recipient.id = current_revision."submittedByUserId"
          )
          OR (
            negotiation.status = 'WITHDRAWN'
            AND delivery_event.type = 'WITHDRAWN'
            AND delivery_event."actorUserId" = current_revision."submittedByUserId"
            AND recipient.id <> current_revision."submittedByUserId"
          )
        )
        AND recipient.status = 'ACTIVE'::public."UserStatus"
        AND counterparty.status = 'ACTIVE'::public."UserStatus"
        AND property.status = 'READY_FOR_INVITES'::public."PropertyStatus"
        AND property."ownershipVerificationStatus" = 'APPROVED'::public."PropertyVerificationStatus"
        AND property."flaggedForReviewAt" IS NULL
        AND property."ownerUserId" = negotiation."sellerUserId"
        AND property."authorityAttestedIdentityVersion" = property."identityVersion"
        AND property."identityVersion" = negotiation."propertyIdentityVersion"
        AND EXISTS (
          SELECT 1 FROM public."User" seller
          JOIN public."SellerAccess" access ON access."userId" = seller.id AND access.status = 'APPROVED'
          WHERE seller.id = negotiation."sellerUserId" AND seller.status = 'ACTIVE'
            AND 'SELLER'::public."UserRole" = ANY(seller.roles)
        )
        AND EXISTS (
          SELECT 1 FROM public."Invite" invite
          JOIN public."BuyerProfile" buyer ON buyer.id = invite."buyerProfileId" AND buyer."visibilityStatus" = 'ACTIVE'
          JOIN public."User" buyer_user ON buyer_user.id = buyer."userId" AND buyer_user.status = 'ACTIVE'
          WHERE invite.id = negotiation."inviteId" AND buyer_user.id = negotiation."buyerUserId"
            AND 'BUYER'::public."UserRole" = ANY(buyer_user.roles)
        )
        AND NOT EXISTS (SELECT 1 FROM public."UserBlock" block WHERE (block."blockerUserId" = negotiation."buyerUserId" AND block."blockedUserId" = negotiation."sellerUserId") OR (block."blockerUserId" = negotiation."sellerUserId" AND block."blockedUserId" = negotiation."buyerUserId"))
      ) AS deliverable
    FROM public."LoiNegotiation" negotiation
    JOIN public."LoiRevision" current_revision ON current_revision.id = negotiation."currentRevisionId"
      AND current_revision."negotiationId" = negotiation.id
    JOIN public."LoiEvent" delivery_event ON delivery_event.id = ${eventId}::uuid
      AND delivery_event."negotiationId" = negotiation.id
      AND delivery_event."revisionId" = current_revision.id
    JOIN public."Invite" current_invite ON current_invite.id = negotiation."inviteId"
      AND current_invite.status = 'ACCEPTED'::public."InviteStatus"
      AND current_invite."propertyIdentityVersion" = negotiation."propertyIdentityVersion"
    JOIN public."Conversation" current_conversation ON current_conversation.id = negotiation."conversationId"
      AND current_conversation."inviteId" = current_invite.id
      AND current_conversation.status = 'ACTIVE'::public."ConversationStatus"
    JOIN public."SellerProperty" property ON property.id = negotiation."propertyId"
    JOIN public."User" recipient ON recipient.id = ${recipientUserId}::uuid
      AND recipient.id IN (negotiation."buyerUserId", negotiation."sellerUserId")
    JOIN public."User" counterparty ON counterparty.id = CASE WHEN recipient.id = negotiation."buyerUserId" THEN negotiation."sellerUserId" ELSE negotiation."buyerUserId" END
    WHERE negotiation.id = ${negotiationId}::uuid
  `;
  if (!result?.deliverable || !loiV1EnabledForPair(result.buyer_user_id, result.seller_user_id)) return null;
  return result.recipient_email?.trim() || null;
}

async function unreadMessageDeliveryEmail(conversationId: string, recipientUserId: string) {
  const [result] = await prisma.$queryRaw<Array<{
    buyer_user_id: string;
    deliverable: boolean;
    recipient_email: string | null;
    seller_user_id: string;
  }>>`
    SELECT
      invite."sellerId" AS seller_user_id,
      buyer."userId" AS buyer_user_id,
      recipient_user.email AS recipient_email,
      (
        conversation.status IN ('AWAITING_BUYER', 'ACTIVE')
        AND recipient_user.status = 'ACTIVE'::public."UserStatus"
        AND other_user.status = 'ACTIVE'::public."UserStatus"
        AND recipient."mutedAt" IS NULL
        AND buyer."visibilityStatus" = 'ACTIVE'::public."BuyerVisibilityStatus"
        AND 'BUYER'::public."UserRole" = ANY(buyer_user.roles)
        AND (
          'ADMIN'::public."UserRole" = ANY(seller.roles)
          OR (
            'SELLER'::public."UserRole" = ANY(seller.roles)
            AND seller_access.status = 'APPROVED'::public."SellerAccessStatus"
          )
        )
        AND property."ownerUserId" = invite."sellerId"
        AND property.status = 'READY_FOR_INVITES'::public."PropertyStatus"
        AND property."ownershipVerificationStatus" = 'APPROVED'::public."PropertyVerificationStatus"
        AND property."flaggedForReviewAt" IS NULL
        AND property."authorityAttestedIdentityVersion" = property."identityVersion"
        AND invite."propertyIdentityVersion" = property."identityVersion"
        AND (
          invite.status = 'ACCEPTED'::public."InviteStatus"
          OR (
            invite.status IN ('SENT'::public."InviteStatus", 'VIEWED'::public."InviteStatus")
            AND invite."expiresAt" > now()
          )
        )
        AND NOT EXISTS (
          SELECT 1
          FROM public."UserBlock" block
          WHERE (
            block."blockerUserId" = invite."sellerId"
            AND block."blockedUserId" = buyer."userId"
          ) OR (
            block."blockerUserId" = buyer."userId"
            AND block."blockedUserId" = invite."sellerId"
          )
        )
        AND EXISTS (
          SELECT 1
          FROM public."Message" message
          WHERE message."conversationId" = conversation.id
            AND message."senderUserId" IS NOT NULL
            AND message."senderUserId" <> recipient."userId"
            AND message.kind IN ('GUIDED'::public."MessageKind", 'FREE_TEXT'::public."MessageKind")
            AND (
              recipient."lastReadAt" IS NULL
              OR message."createdAt" > recipient."lastReadAt"
              OR (
                message."createdAt" = recipient."lastReadAt"
                AND (recipient."lastReadMessageId" IS NULL OR message.id > recipient."lastReadMessageId")
              )
            )
        )
      ) AS deliverable
    FROM public."Conversation" conversation
    JOIN public."ConversationParticipant" recipient
      ON recipient."conversationId" = conversation.id
      AND recipient."userId" = ${recipientUserId}::uuid
    JOIN public."ConversationParticipant" other_participant
      ON other_participant."conversationId" = conversation.id
      AND other_participant."userId" <> recipient."userId"
    JOIN public."User" recipient_user ON recipient_user.id = recipient."userId"
    JOIN public."User" other_user ON other_user.id = other_participant."userId"
    JOIN public."Invite" invite ON invite.id = conversation."inviteId"
    JOIN public."BuyerProfile" buyer ON buyer.id = invite."buyerProfileId"
    JOIN public."User" seller ON seller.id = invite."sellerId"
    LEFT JOIN public."SellerAccess" seller_access ON seller_access."userId" = seller.id
    JOIN public."SellerProperty" property ON property.id = invite."propertyId"
    WHERE conversation.id = ${conversationId}::uuid
  `;
  if (
    !result?.deliverable
    || !messagingV1EnabledForPair(result.seller_user_id, result.buyer_user_id)
  ) return null;
  return result.recipient_email?.trim() || null;
}
