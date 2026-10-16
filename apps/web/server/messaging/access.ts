// Session guards and the eligibility SQL every messaging operation rechecks.
import { Prisma, prisma } from "@liber/db";
import { hasRole } from "../authz";
import { getSessionUser } from "../session";
import { MessagingError, messagingNotFound, messagingUnavailable } from "./errors";
import { assertMessagingV1EnabledForPair } from "./feature";
import { inviteDeadlineIsCurrent, PUBLIC_BLOCKED_CONVERSATION_STATE } from "./policy";
import type { ConversationParticipantRoleValue, ConversationStatusValue } from "./types";

export const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export type ConversationAccessRow = {
  buyer_display_name: string;
  buyer_profile_active: boolean;
  buyer_user_active: boolean;
  buyer_user_id: string;
  buyer_email: string;
  closed_reason: string | null;
  conversation_id: string;
  conversation_status: ConversationStatusValue;
  invite_expires_at: Date | null;
  invite_id: string;
  invite_property_identity_version: number;
  invite_status: string;
  inbox_moderation_revision: string;
  last_message_at: Date;
  moderation_updated_at: Date | null;
  last_read_message_id: string | null;
  last_read_at: Date | null;
  muted_at: Date | null;
  other_avatar_variant: string | null;
  other_name?: string | null;
  other_user_id: string;
  participant_count: number;
  participant_created_at: Date;
  participant_role: ConversationParticipantRoleValue;
  pair_blocked: boolean;
  property_approved: boolean;
  property_test_approved?: boolean;
  property_identity_current: boolean;
  property_identity_version: number;
  property_snapshot: unknown;
  seller_access_approved: boolean;
  seller_email: string;
  seller_user_active: boolean;
  seller_user_id: string;
};

export async function requireMessagingUser() {
  const currentUser = await getSessionUser();
  if (!currentUser) throw new MessagingError("AUTHENTICATION_REQUIRED", "Authentication required.", 401);
  return currentUser;
}

export async function requireAdminUser() {
  const currentUser = await requireMessagingUser();
  if (!hasRole(currentUser, "ADMIN")) throw messagingNotFound();
  return currentUser;
}

async function loadConversationAccess(
  client: Pick<typeof prisma, "$queryRaw">,
  conversationId: string,
  userId: string,
) {
  return (await loadConversationAccessRows(client, userId, { conversationId, limit: 1 }))[0] ?? null;
}

export async function loadConversationAccessRows(
  client: Pick<typeof prisma, "$queryRaw">,
  userId: string,
  options: {
    before?: { id: string; lastMessageAt: Date };
    conversationId?: string;
    counterpartyUserIds?: string[] | null;
    limit?: number;
  } = {},
) {
  const predicates: Prisma.Sql[] = [];
  if (options.conversationId) {
    predicates.push(Prisma.sql`conversation.id = ${options.conversationId}::uuid`);
  }
  if (options.before) {
    predicates.push(Prisma.sql`(
      conversation."lastMessageAt" < ${options.before.lastMessageAt}
      OR (
        conversation."lastMessageAt" = ${options.before.lastMessageAt}
        AND conversation.id < ${options.before.id}::uuid
      )
    )`);
  }
  if (options.counterpartyUserIds) {
    const counterpartyIds = options.counterpartyUserIds.map((id) => Prisma.sql`${id}::uuid`);
    predicates.push(Prisma.sql`other_participant."userId" IN (${Prisma.join(counterpartyIds)})`);
  }
  const conversationFilter = predicates.length > 0
    ? Prisma.sql`WHERE ${Prisma.join(predicates, " AND ")}`
    : Prisma.empty;
  return client.$queryRaw<ConversationAccessRow[]>(Prisma.sql`
    SELECT
      conversation.id AS conversation_id,
      conversation.status::text AS conversation_status,
      conversation."closedReason"::text AS closed_reason,
      conversation."propertySnapshot" AS property_snapshot,
      conversation."lastMessageAt" AS last_message_at,
      conversation."moderationUpdatedAt" AS moderation_updated_at,
      (
        SELECT encode(
          extensions.digest(
            convert_to(
              coalesce(string_agg(
                revision_conversation.id::text || ':' || revision_conversation."moderationUpdatedAt"::text,
                ',' ORDER BY revision_conversation.id
              ), ''),
              'UTF8'
            ),
            'sha256'
          ),
          'hex'
        )
        FROM public."ConversationParticipant" revision_participant
        JOIN public."Conversation" revision_conversation
          ON revision_conversation.id = revision_participant."conversationId"
        WHERE revision_participant."userId" = ${userId}::uuid
          AND revision_conversation."moderationUpdatedAt" IS NOT NULL
      ) AS inbox_moderation_revision,
      current_participant.role::text AS participant_role,
      current_participant."lastReadMessageId" AS last_read_message_id,
      current_participant."lastReadAt" AS last_read_at,
      current_participant."mutedAt" AS muted_at,
      current_participant."createdAt" AS participant_created_at,
      other_user."avatarVariant" AS other_avatar_variant,
      other_user.name AS other_name,
      other_participant."userId" AS other_user_id,
      participant_count.count::integer AS participant_count,
      EXISTS (
        SELECT 1
        FROM public."UserBlock" block
        WHERE (
          block."blockerUserId" = invite."sellerId"
          AND block."blockedUserId" = buyer."userId"
        ) OR (
          block."blockerUserId" = buyer."userId"
          AND block."blockedUserId" = invite."sellerId"
        )
      ) AS pair_blocked,
      invite.id AS invite_id,
      invite.status::text AS invite_status,
      invite."expiresAt" AS invite_expires_at,
      invite."propertyIdentityVersion" AS invite_property_identity_version,
      invite."sellerId" AS seller_user_id,
      seller.email AS seller_email,
      seller.status = 'ACTIVE'::public."UserStatus" AS seller_user_active,
      buyer."userId" AS buyer_user_id,
      buyer."displayName" AS buyer_display_name,
      (
        buyer."visibilityStatus" = 'ACTIVE'::public."BuyerVisibilityStatus"
        AND 'BUYER'::public."UserRole" = ANY(buyer_user.roles)
      ) AS buyer_profile_active,
      buyer_user.email AS buyer_email,
      buyer_user.status = 'ACTIVE'::public."UserStatus" AS buyer_user_active,
      property."identityVersion" AS property_identity_version,
      EXISTS (
        SELECT 1
        FROM public."AdminAuditLog" audit
        WHERE audit."targetType" = 'invite'
          AND audit."targetId" = invite.id
          AND audit.action = 'invite_sent'
          AND audit.metadata->>'syntheticPropertyApproval' = 'true'
      ) AS property_test_approved,
      invite."propertyIdentityVersion" = property."identityVersion" AS property_identity_current,
      (
        property."ownerUserId" = invite."sellerId"
        AND property.status = 'READY_FOR_INVITES'::public."PropertyStatus"
        AND property."ownershipVerificationStatus" = 'APPROVED'::public."PropertyVerificationStatus"
        AND property."flaggedForReviewAt" IS NULL
        AND property."authorityAttestedIdentityVersion" = property."identityVersion"
      ) AS property_approved,
      (
        'ADMIN'::public."UserRole" = ANY(seller.roles)
        OR (
          'SELLER'::public."UserRole" = ANY(seller.roles)
          AND seller_access.status = 'APPROVED'::public."SellerAccessStatus"
        )
      ) AS seller_access_approved
    FROM public."Conversation" conversation
    JOIN public."ConversationParticipant" current_participant
      ON current_participant."conversationId" = conversation.id
      AND current_participant."userId" = ${userId}::uuid
    JOIN LATERAL (
      SELECT participant."userId"
      FROM public."ConversationParticipant" participant
      WHERE participant."conversationId" = conversation.id
        AND participant."userId" <> ${userId}::uuid
      ORDER BY participant."userId"
      LIMIT 1
    ) other_participant ON true
    JOIN public."User" other_user ON other_user.id = other_participant."userId"
    JOIN LATERAL (
      SELECT count(*) AS count
      FROM public."ConversationParticipant" participant
      WHERE participant."conversationId" = conversation.id
    ) participant_count ON true
    JOIN public."Invite" invite ON invite.id = conversation."inviteId"
    JOIN public."User" seller ON seller.id = invite."sellerId"
    LEFT JOIN public."SellerAccess" seller_access ON seller_access."userId" = seller.id
    JOIN public."BuyerProfile" buyer ON buyer.id = invite."buyerProfileId"
    JOIN public."User" buyer_user ON buyer_user.id = buyer."userId"
    JOIN public."SellerProperty" property ON property.id = invite."propertyId"
    ${conversationFilter}
    ORDER BY conversation."lastMessageAt" DESC, conversation.id DESC
    LIMIT ${options.limit ?? 100}
  `);
}

export async function requireConversationAccess(
  client: Pick<typeof prisma, "$queryRaw">,
  conversationId: string,
  userId: string,
) {
  if (!UUID_PATTERN.test(conversationId)) throw messagingNotFound();
  const access = await loadConversationAccess(client, conversationId, userId);
  if (!access || access.participant_count !== 2) throw messagingNotFound();
  if (!currentParticipantIsActive(access)) throw messagingNotFound();
  assertMessagingV1EnabledForPair(access.seller_user_id, access.buyer_user_id);
  return access;
}

export function currentParticipantIsActive(access: ConversationAccessRow) {
  return access.participant_role === "SELLER"
    ? access.seller_user_active
    : access.buyer_user_active;
}

export function effectiveConversationState(access: ConversationAccessRow) {
  if (access.conversation_status === "BLOCKED" || access.pair_blocked) {
    return PUBLIC_BLOCKED_CONVERSATION_STATE;
  }
  if (!access.property_identity_current) {
    return { closedReason: "PROPERTY_IDENTITY_CHANGED", inviteStatus: "Withdrawn", status: "READ_ONLY" as const };
  }
  if (!access.seller_user_active || !access.buyer_user_active) {
    return { closedReason: "USER_SUSPENDED", inviteStatus: "Unavailable", status: "READ_ONLY" as const };
  }
  if (!access.buyer_profile_active) {
    return { closedReason: "BUYER_INELIGIBLE", inviteStatus: "Unavailable", status: "READ_ONLY" as const };
  }
  if (!access.seller_access_approved) {
    return { closedReason: "SELLER_INELIGIBLE", inviteStatus: "Unavailable", status: "READ_ONLY" as const };
  }
  if (!access.property_approved) {
    return { closedReason: "PROPERTY_INELIGIBLE", inviteStatus: "Withdrawn", status: "READ_ONLY" as const };
  }
  if (access.invite_status === "ACCEPTED") {
    return { closedReason: null, inviteStatus: "Accepted", status: "ACTIVE" as const };
  }
  if (access.invite_status === "DECLINED") {
    return { closedReason: "INVITE_DECLINED", inviteStatus: "Declined", status: "READ_ONLY" as const };
  }
  if (access.invite_status === "EXPIRED") {
    return { closedReason: "INVITE_EXPIRED", inviteStatus: "Expired", status: "READ_ONLY" as const };
  }
  if (access.invite_status === "WITHDRAWN") {
    return { closedReason: "INVITE_WITHDRAWN", inviteStatus: "Withdrawn", status: "READ_ONLY" as const };
  }
  if (!inviteDeadlineIsCurrent(access.invite_expires_at)) {
    return { closedReason: "INVITE_EXPIRED", inviteStatus: "Expired", status: "READ_ONLY" as const };
  }
  return {
    closedReason: access.closed_reason,
    inviteStatus: access.invite_status === "VIEWED" ? "Viewed" : "Sent",
    status: access.conversation_status,
  };
}

export function canCurrentParticipantSend(
  access: ConversationAccessRow,
  status: ConversationStatusValue,
) {
  if (status === "ACTIVE") return true;
  return status === "AWAITING_BUYER" && access.participant_role === "BUYER";
}

export function assertUuid(value: string, label: string) {
  if (!UUID_PATTERN.test(value)) {
    throw new MessagingError("INVALID_INPUT", `${label} is invalid.`, 400);
  }
}

export function inviteStatusValue(value: string) {
  if (["ACCEPTED", "DECLINED", "EXPIRED", "SENT", "VIEWED", "WITHDRAWN"].includes(value)) {
    return value as "ACCEPTED" | "DECLINED" | "EXPIRED" | "SENT" | "VIEWED" | "WITHDRAWN";
  }
  throw messagingUnavailable();
}
