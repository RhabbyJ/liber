import { prisma } from "@liber/db";
import { sendInviteEmail, sendUnreadMessageEmail, type EmailResult } from "./email";
import { messagingV1EnabledForPair } from "./messaging/feature";

const MAX_ATTEMPTS = 5;
const LEASE_MS = 2 * 60_000;

type ClaimedEmailJob = {
  id: string;
  type: string;
  attempts: number;
  idempotencyKey: string;
  inviteId: string | null;
  messageConversationId: string | null;
  messageRecipientUserId: string | null;
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

  throw new Error(`Unsupported email job type: ${job.type}`);
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
