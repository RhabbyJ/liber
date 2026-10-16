// Inbox listing, thread reads and message history pages.
import { Prisma, prisma } from "@liber/db";
import { resolveAvatarVariant } from "../../lib/avatar-variant";
import { publicNameForDisplay } from "../public-identity";
import { TEST_PROPERTY_LABEL } from "../synthetic-property-review";
import {
  canCurrentParticipantSend,
  currentParticipantIsActive,
  effectiveConversationState,
  loadConversationAccessRows,
  requireConversationAccess,
  requireMessagingUser,
  UUID_PATTERN,
  type ConversationAccessRow,
} from "./access";
import {
  decodeConversationListCursor,
  decodeMessageCursor,
  encodeConversationListCursor,
  encodeMessageCursor,
} from "./cursor";
import { MessagingError, messagingNotFound } from "./errors";
import {
  messagingV1ConversationScopeForUser,
  messagingV1EnabledForPair,
} from "./feature";
import { messageColumns, messageDto, messageMarker, propertySnapshot, type MessageRow } from "./message-rows";
import { inviteDeadlineIsCurrent } from "./policy";
import type {
  ConversationMessagePage,
  ConversationSummaryDTO,
  ConversationThreadDTO,
} from "./types";

const MESSAGE_PAGE_SIZE = 50;
const SAFETY_NOTICE = "Keep messages about the property, viewing logistics, timing, and legitimate purchase-readiness questions. Do not ask about protected personal characteristics. This conversation is not an offer, contract, escrow instruction, or payment request.";

type ConversationSummaryRow = {
  [Key in keyof MessageRow]: MessageRow[Key] | null;
} & { summary_conversation_id: string; unread_count: number };

export async function listConversations(input: { cursor?: string; pageSize?: number } = {}) {
  const currentUser = await requireMessagingUser();
  const scope = messagingV1ConversationScopeForUser(currentUser.id);
  if (!scope) {
    throw new MessagingError("UNAVAILABLE", "Messaging is unavailable.", 404);
  }
  const pageSize = input.pageSize ?? 25;
  if (!Number.isInteger(pageSize) || pageSize < 1 || pageSize > 50) {
    throw new MessagingError("INVALID_INPUT", "Conversation page size is invalid.", 400);
  }
  if (input.cursor && input.cursor.length > 2_048) {
    throw new MessagingError("INVALID_INPUT", "Invalid conversation cursor.", 400);
  }
  const cursor = input.cursor
    ? decodeConversationListCursor(input.cursor, currentUser.id)
    : null;
  if (scope.counterpartyUserIds?.length === 0) {
    return { items: [], pageInfo: { hasMore: false, moderationRevision: null, nextCursor: null } };
  }
  const accessRows = (await loadConversationAccessRows(prisma, currentUser.id, {
    before: cursor ? { id: cursor.id, lastMessageAt: new Date(cursor.lastMessageAt) } : undefined,
    counterpartyUserIds: scope.counterpartyUserIds,
    limit: pageSize + 1,
  }))
    .filter((access) => access.participant_count === 2)
    .filter((access) => messagingV1EnabledForPair(access.seller_user_id, access.buyer_user_id))
    .filter(currentParticipantIsActive);
  const hasMore = accessRows.length > pageSize;
  const pageAccessRows = hasMore ? accessRows.slice(0, pageSize) : accessRows;
  const summaries = await loadConversationSummaryRows(
    prisma,
    pageAccessRows.map((access) => access.conversation_id),
    currentUser.id,
  );
  const summaryByConversationId = new Map(
    summaries.map((summary) => [summary.summary_conversation_id, summary] as const),
  );
  const items = pageAccessRows.flatMap((access) => {
    const summary = summaryByConversationId.get(access.conversation_id);
    return summary ? [conversationSummaryDto(access, summary, currentUser.id)] : [];
  });
  const lastAccess = pageAccessRows.at(-1);
  return {
    items,
    pageInfo: {
      hasMore,
      moderationRevision: pageAccessRows[0]?.inbox_moderation_revision ?? null,
      nextCursor: hasMore && lastAccess
        ? encodeConversationListCursor({
            id: lastAccess.conversation_id,
            lastMessageAt: lastAccess.last_message_at.toISOString(),
            userId: currentUser.id,
          })
        : null,
    },
  };
}

export async function getConversationThread(conversationId: string) {
  const currentUser = await requireMessagingUser();
  const access = await requireConversationAccess(prisma, conversationId, currentUser.id);
  const [summary, messagePage] = await Promise.all([
    conversationSummary(prisma, access, currentUser.id),
    queryConversationMessages({ conversationId }, currentUser.id),
  ]);
  const effective = effectiveConversationState(access);
  const canSend = canCurrentParticipantSend(access, effective.status);
  const imageIds = await authorizedPropertyImageIds(prisma, access);

  return {
    ...summary,
    canSend,
    imageIds,
    items: messagePage.items,
    moderationRevision: access.moderation_updated_at?.toISOString() ?? null,
    pageInfo: messagePage.pageInfo,
    safetyNotice: SAFETY_NOTICE,
    sellerFollowUpAvailableAt: null,
  } satisfies ConversationThreadDTO;
}

export async function authorizeConversationAccess(conversationId: string) {
  const currentUser = await requireMessagingUser();
  await requireConversationAccess(prisma, conversationId, currentUser.id);
}

export async function listConversationMessages(
  input: { after?: string; conversationId: string; cursor?: string; pageSize?: number },
): Promise<ConversationMessagePage> {
  const currentUser = await requireMessagingUser();
  await requireConversationAccess(prisma, input.conversationId, currentUser.id);
  return queryConversationMessages(input, currentUser.id);
}

async function queryConversationMessages(
  input: { after?: string; conversationId: string; cursor?: string; pageSize?: number },
  currentUserId: string,
): Promise<ConversationMessagePage> {
  const pageSize = input.pageSize ?? MESSAGE_PAGE_SIZE;
  if (!Number.isInteger(pageSize) || pageSize < 1 || pageSize > 100) {
    throw new MessagingError("INVALID_INPUT", "Message page size is invalid.", 400);
  }

  if (input.cursor && input.after) {
    throw new MessagingError("INVALID_INPUT", "Use either cursor or after, not both.", 400);
  }

  let rows: MessageRow[];
  let hasMore = false;
  let nextCursor: string | null = null;
  let afterAnchorId: string | null = null;

  if (input.after) {
    const anchor = await afterMessageMarker(prisma, input.conversationId, input.after);
    afterAnchorId = anchor.id;
    const results = await prisma.$queryRaw<MessageRow[]>(Prisma.sql`
      SELECT ${messageColumns()}
      FROM public."Message" message
      WHERE message."conversationId" = ${input.conversationId}::uuid
        AND (
          message."createdAt" > ${anchor.created_at}
          OR (message."createdAt" = ${anchor.created_at} AND message.id > ${anchor.id}::uuid)
        )
      ORDER BY message."createdAt" ASC, message.id ASC
      LIMIT ${pageSize + 1}
    `);
    hasMore = results.length > pageSize;
    rows = hasMore ? results.slice(0, pageSize) : results;
  } else if (input.cursor) {
    const cursor = decodeMessageCursor(input.cursor, input.conversationId);
    const cursorAt = new Date(cursor.createdAt);
    const results = await prisma.$queryRaw<MessageRow[]>(Prisma.sql`
      SELECT ${messageColumns()}
      FROM public."Message" message
      WHERE message."conversationId" = ${input.conversationId}::uuid
        AND (
          message."createdAt" < ${cursorAt}
          OR (message."createdAt" = ${cursorAt} AND message.id < ${cursor.id}::uuid)
        )
      ORDER BY message."createdAt" DESC, message.id DESC
      LIMIT ${pageSize + 1}
    `);
    hasMore = results.length > pageSize;
    rows = (hasMore ? results.slice(0, pageSize) : results).reverse();
    const oldest = rows[0];
    nextCursor = hasMore && oldest
      ? encodeMessageCursor({
          conversationId: input.conversationId,
          createdAt: oldest.created_at.toISOString(),
          id: oldest.id,
        })
      : null;
  } else {
    const results = await prisma.$queryRaw<MessageRow[]>(Prisma.sql`
      SELECT ${messageColumns()}
      FROM public."Message" message
      WHERE message."conversationId" = ${input.conversationId}::uuid
      ORDER BY message."createdAt" DESC, message.id DESC
      LIMIT ${pageSize + 1}
    `);
    hasMore = results.length > pageSize;
    rows = (hasMore ? results.slice(0, pageSize) : results).reverse();
    const oldest = rows[0];
    nextCursor = hasMore && oldest
      ? encodeMessageCursor({
          conversationId: input.conversationId,
          createdAt: oldest.created_at.toISOString(),
          id: oldest.id,
        })
      : null;
  }

  const items = rows.map((message) => messageDto(message, currentUserId));
  return {
    items,
    pageInfo: {
      hasMore,
      newestMessageId: items.at(-1)?.id ?? afterAnchorId,
      nextCursor,
    },
  };
}

async function conversationSummary(
  client: Pick<typeof prisma, "$queryRaw">,
  access: ConversationAccessRow,
  userId: string,
): Promise<ConversationSummaryDTO> {
  const [row] = await loadConversationSummaryRows(client, [access.conversation_id], userId);
  if (!row) throw messagingNotFound();
  return conversationSummaryDto(access, row, userId);
}

async function loadConversationSummaryRows(
  client: Pick<typeof prisma, "$queryRaw">,
  conversationIds: string[],
  userId: string,
) {
  if (conversationIds.length === 0) return [];
  const ids = conversationIds.map((id) => Prisma.sql`${id}::uuid`);
  return client.$queryRaw<ConversationSummaryRow[]>(Prisma.sql`
    SELECT
      conversation.id AS summary_conversation_id,
      ${messageColumns()},
      unread.unread_count
    FROM public."Conversation" conversation
    JOIN public."ConversationParticipant" participant
      ON participant."conversationId" = conversation.id
      AND participant."userId" = ${userId}::uuid
    LEFT JOIN LATERAL (
      SELECT latest.*
      FROM public."Message" latest
      WHERE latest."conversationId" = conversation.id
      ORDER BY latest."createdAt" DESC, latest.id DESC
      LIMIT 1
    ) message ON true
    CROSS JOIN LATERAL (
      SELECT count(*)::integer AS unread_count
      FROM public."Message" unread_message
      WHERE unread_message."conversationId" = conversation.id
        AND unread_message."senderUserId" IS DISTINCT FROM ${userId}::uuid
        AND (
          participant."lastReadAt" IS NULL
          OR unread_message."createdAt" > participant."lastReadAt"
          OR (
            unread_message."createdAt" = participant."lastReadAt"
            AND (
              participant."lastReadMessageId" IS NULL
              OR unread_message.id > participant."lastReadMessageId"
            )
          )
        )
    ) unread
    WHERE conversation.id IN (${Prisma.join(ids)})
  `);
}

function conversationSummaryDto(
  access: ConversationAccessRow,
  row: ConversationSummaryRow,
  userId: string,
): ConversationSummaryDTO {
  const latest = row?.id ? row as MessageRow : null;
  const effective = effectiveConversationState(access);
  const snapshot = propertySnapshot(access.property_snapshot);
  return {
    closedReason: effective.closedReason,
    counterpartyAvatarVariant: resolveAvatarVariant(access.other_avatar_variant, access.other_user_id).value,
    counterpartyLabel: publicNameForDisplay(access.other_name, access.other_user_id),
    id: access.conversation_id,
    invite: { id: access.invite_id, status: effective.inviteStatus },
    lastMessage: latest ? messageDto(latest, userId) : null,
    lastMessageAt: access.last_message_at.toISOString(),
    muted: Boolean(access.muted_at),
    participantRole: access.participant_role,
    property: { ...snapshot, ...(access.property_test_approved ? { ownershipStatus: TEST_PROPERTY_LABEL } : {}), identityCurrent: access.property_identity_current },
    status: effective.status,
    unreadCount: Number(row?.unread_count ?? 0),
  };
}

async function authorizedPropertyImageIds(client: Pick<typeof prisma, "$queryRaw">, access: ConversationAccessRow) {
  if (
    !access.property_identity_current
    || !access.property_approved
    || !access.seller_access_approved
    || !access.seller_user_active
    || !access.buyer_user_active
    || !access.buyer_profile_active
    || access.pair_blocked
  ) return [];
  if (access.participant_role === "BUYER") {
    const eligible = access.invite_status === "ACCEPTED"
      || (["SENT", "VIEWED"].includes(access.invite_status) && inviteDeadlineIsCurrent(access.invite_expires_at));
    if (!eligible) return [];
  }
  const rows = await client.$queryRaw<Array<{ id: string }>>(Prisma.sql`
    SELECT image.id
    FROM public."PropertyImage" image
    JOIN public."Invite" invite ON invite."propertyId" = image."propertyId"
    WHERE invite.id = ${access.invite_id}
      AND image."propertyIdentityVersion" = ${access.property_identity_version}
    ORDER BY image."sortOrder" ASC, image.id ASC
  `);
  return rows.map((row) => row.id);
}

async function afterMessageMarker(
  client: Pick<typeof prisma, "$queryRaw">,
  conversationId: string,
  value: string,
) {
  if (UUID_PATTERN.test(value)) return messageMarker(client, conversationId, value);
  const cursor = decodeMessageCursor(value, conversationId);
  const marker = await messageMarker(client, conversationId, cursor.id);
  if (marker.created_at.toISOString() !== cursor.createdAt) {
    throw new MessagingError("INVALID_INPUT", "Message marker is invalid.", 400);
  }
  return marker;
}
