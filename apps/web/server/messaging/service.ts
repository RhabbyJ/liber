import { Prisma, prisma } from "@liber/db";
import { buyerAliasForDisplay } from "../../lib/buyer-alias";
import { hasRole } from "../authz";
import { INVITE_EXPIRATION_DAYS } from "../maintenance";
import { checkRateLimit } from "../rate-limit";
import { getSessionUser } from "../session";
import { normalizeMessageBody, visibleMessageBody } from "./content";
import {
  decodeAdminReportListCursor,
  decodeConversationListCursor,
  decodeMessageCursor,
  encodeAdminReportListCursor,
  encodeConversationListCursor,
  encodeMessageCursor,
} from "./cursor";
import { MessagingError, messagingInviteUnavailable, messagingNotFound, messagingUnavailable } from "./errors";
import {
  assertMessagingV1EnabledForPair,
  messagingV1ConversationScopeForUser,
  messagingV1EnabledForPair,
} from "./feature";
import {
  assertConversationCanSend,
  MESSAGE_ATTEMPT_LIMIT_PER_MINUTE,
  MESSAGE_CONVERSATION_LIMIT_PER_HOUR,
  MESSAGE_USER_LIMIT_PER_24_HOURS,
  PUBLIC_BLOCKED_CONVERSATION_STATE,
  SELLER_FOLLOW_UP_COOLDOWN_MS,
  UNREAD_MESSAGE_EMAIL_DELAY_MS,
} from "./policy";
import { resolveMessagingTemplate } from "./templates";
import type {
  ConversationMessageDTO,
  ConversationMessagePage,
  ConversationParticipantRoleValue,
  ConversationStatusValue,
  ConversationSummaryDTO,
  ConversationThreadDTO,
  MessageReportInput,
  PropertySnapshotDTO,
  ResolveMessageReportInput,
  SendConversationMessageInput,
} from "./types";

const MESSAGE_PAGE_SIZE = 50;
const SAFETY_NOTICE = "Keep messages about the property, viewing logistics, timing, and legitimate purchase-readiness questions. Do not ask about protected personal characteristics. This conversation is not an offer, contract, escrow instruction, or payment request.";
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

type TransactionClient = Prisma.TransactionClient;

type ConversationAccessRow = {
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
  invite_sent_at: Date;
  invite_status: string;
  inbox_moderation_revision: string;
  last_message_at: Date;
  moderation_updated_at: Date | null;
  last_read_message_id: string | null;
  last_read_at: Date | null;
  muted_at: Date | null;
  other_user_id: string;
  participant_count: number;
  participant_created_at: Date;
  participant_role: ConversationParticipantRoleValue;
  pair_blocked: boolean;
  property_approved: boolean;
  property_identity_current: boolean;
  property_identity_version: number;
  property_snapshot: unknown;
  seller_access_approved: boolean;
  seller_email: string;
  seller_user_active: boolean;
  seller_user_id: string;
};

type MessageRow = {
  body: string;
  client_message_id: string;
  conversation_id: string;
  created_at: Date;
  id: string;
  kind: "FREE_TEXT" | "GUIDED" | "INVITE" | "SYSTEM";
  moderation_status: "ALLOWED" | "FLAGGED" | "REDACTED";
  sender_user_id: string | null;
  template_key: string | null;
  template_version: number | null;
};

type ConversationSummaryRow = {
  [Key in keyof MessageRow]: MessageRow[Key] | null;
} & { summary_conversation_id: string; unread_count: number };

type AdminMessageReportRow = {
  category: string;
  conversation_id: string;
  created_at: Date;
  details: string | null;
  evidence_body_snapshot: string;
  evidence_context: unknown;
  id: string;
  invite_id: string;
  invite_status: string;
  message_created_at: Date;
  message_id: string;
  message_kind: string;
  message_moderation_status: string;
  prior_block_count: number;
  prior_report_count: number;
  property_snapshot: unknown;
  reported_label: string;
  reporter_label: string;
  resolution: string | null;
  status: string;
  status_rank: number;
};

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
  const [summary, sellerFollowUpCount, messagePage] = await Promise.all([
    conversationSummary(prisma, access, currentUser.id),
    countSellerFollowUps(prisma, access),
    queryConversationMessages({ conversationId }, currentUser.id),
  ]);
  const effective = effectiveConversationState(access);
  const canSend = canCurrentParticipantSend(access, effective.status, sellerFollowUpCount);
  const imageIds = await authorizedPropertyImageIds(prisma, access);

  return {
    ...summary,
    canSend,
    imageIds,
    items: messagePage.items,
    moderationRevision: access.moderation_updated_at?.toISOString() ?? null,
    pageInfo: messagePage.pageInfo,
    safetyNotice: SAFETY_NOTICE,
    sellerFollowUpAvailableAt: access.participant_role === "SELLER"
      && effective.status === "AWAITING_BUYER"
      && sellerFollowUpCount === 0
      ? new Date(access.invite_sent_at.getTime() + SELLER_FOLLOW_UP_COOLDOWN_MS).toISOString()
      : null,
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

export async function sendConversationMessage(input: SendConversationMessageInput) {
  const currentUser = await requireMessagingUser();
  assertUuid(input.clientMessageId, "Client message ID");
  const attemptLimit = await checkRateLimit(
    `message-send:${currentUser.id}`,
    MESSAGE_ATTEMPT_LIMIT_PER_MINUTE,
    60_000,
  );
  if (!attemptLimit.allowed) {
    throw new MessagingError("RATE_LIMITED", "Message limit reached. Try again later.", 429);
  }

  return prisma.$transaction(async (tx) => {
    const initial = await requireConversationAccess(tx, input.conversationId, currentUser.id);
    await lockPair(tx, initial.seller_user_id, initial.buyer_user_id);
    await lockInvite(tx, initial.invite_id);
    await lockConversation(tx, input.conversationId);
    const access = await requireConversationAccess(tx, input.conversationId, currentUser.id);

    const [existing] = await tx.$queryRaw<MessageRow[]>`
      SELECT ${messageColumns()}
      FROM public."Message" message
      WHERE message."conversationId" = ${input.conversationId}::uuid
        AND message."clientMessageId" = ${input.clientMessageId}::uuid
    `;
    if (existing) {
      if (existing.sender_user_id !== currentUser.id) throw messagingUnavailable();
      return { data: messageDto(existing, currentUser.id), idempotent: true };
    }

    const [hasBlock, sellerFollowUpCount] = await Promise.all([
      pairHasBlock(tx, access.seller_user_id, access.buyer_user_id),
      countSellerFollowUps(tx, access),
    ]);
    const template = input.kind === "GUIDED"
      ? resolveMessagingTemplate({
          key: input.templateKey ?? "",
          role: access.participant_role,
          use: access.participant_role === "SELLER" && access.conversation_status === "AWAITING_BUYER"
            ? "SELLER_FOLLOW_UP"
            : access.participant_role === "BUYER" ? "QUICK_REPLY" : undefined,
          version: input.templateVersion ?? 0,
        })
      : null;
    const body = template ? template.text : normalizeMessageBody(input.body ?? "");

    assertConversationCanSend({
      kind: input.kind,
      participantRole: access.participant_role,
      state: {
        buyerProfileActive: access.buyer_profile_active,
        buyerUserActive: access.buyer_user_active,
        conversationStatus: access.conversation_status,
        hasBlock,
        inviteExpiresAt: access.invite_expires_at,
        inviteSentAt: access.invite_sent_at,
        inviteStatus: inviteStatusValue(access.invite_status),
        propertyApproved: access.property_approved,
        propertyIdentityCurrent: access.property_identity_current,
        sellerAccessApproved: access.seller_access_approved,
        sellerFollowUpCount,
        sellerUserActive: access.seller_user_active,
      },
      templateUse: template?.uses.includes("SELLER_FOLLOW_UP") ? "SELLER_FOLLOW_UP" : template?.uses[0],
    });

    await lockMessageSender(tx, currentUser.id);
    const now = new Date();
    const [conversationUsage, userUsage] = await Promise.all([
      tx.$queryRaw<Array<{ count: number }>>`
        SELECT count(*)::integer AS count
        FROM public."Message"
        WHERE "conversationId" = ${input.conversationId}::uuid
          AND kind IN ('GUIDED'::public."MessageKind", 'FREE_TEXT'::public."MessageKind")
          AND "createdAt" >= ${new Date(now.getTime() - 60 * 60_000)}
      `,
      tx.$queryRaw<Array<{ count: number }>>`
        SELECT count(*)::integer AS count
        FROM public."Message"
        WHERE "senderUserId" = ${currentUser.id}::uuid
          AND kind IN ('GUIDED'::public."MessageKind", 'FREE_TEXT'::public."MessageKind")
          AND "createdAt" >= ${new Date(now.getTime() - 24 * 60 * 60_000)}
      `,
    ]);
    if (
      Number(conversationUsage[0]?.count ?? 0) >= MESSAGE_CONVERSATION_LIMIT_PER_HOUR
      || Number(userUsage[0]?.count ?? 0) >= MESSAGE_USER_LIMIT_PER_24_HOURS
    ) {
      throw new MessagingError("RATE_LIMITED", "Message limit reached. Try again later.", 429);
    }

    const [created] = await tx.$queryRaw<MessageRow[]>`
      INSERT INTO public."Message" AS message (
        "conversationId", "senderUserId", kind, "templateKey", "templateVersion",
        body, "clientMessageId", "moderationStatus", "createdAt"
      ) VALUES (
        ${input.conversationId}::uuid,
        ${currentUser.id}::uuid,
        CAST(${input.kind} AS public."MessageKind"),
        ${template?.key ?? null},
        ${template?.version ?? null},
        ${body},
        ${input.clientMessageId}::uuid,
        'ALLOWED'::public."MessageModerationStatus",
        ${now}
      )
      RETURNING ${messageColumns()}
    `;
    if (!created) throw new Error("Message insert returned no row.");

    await queueUnreadMessageEmail(tx, access, currentUser.id, created.id, now);
    await tx.adminAuditLog.create({
      data: {
        action: "message_sent",
        actorUserId: currentUser.id,
        metadata: {
          kind: input.kind,
          ...(template ? { templateKey: template.key, templateVersion: template.version } : {}),
        },
        targetId: created.id,
        targetType: "message",
      },
    });

    return { data: messageDto(created, currentUser.id), idempotent: false };
  });
}

export async function markConversationRead(
  input: { conversationId: string; lastReadMessageId: string },
) {
  const currentUser = await requireMessagingUser();
  return prisma.$transaction(async (tx) => {
    const initial = await requireConversationAccess(tx, input.conversationId, currentUser.id);
    await lockPair(tx, initial.seller_user_id, initial.buyer_user_id);
    await lockInvite(tx, initial.invite_id);
    await lockConversation(tx, input.conversationId);
    const access = await requireConversationAccess(tx, input.conversationId, currentUser.id);
    const marker = await messageMarker(tx, input.conversationId, input.lastReadMessageId);

    const advancesReadState = markerIsNewer(marker, access.last_read_at, access.last_read_message_id);
    if (advancesReadState) {
      await tx.$executeRaw`
        UPDATE public."ConversationParticipant"
        SET "lastReadMessageId" = ${marker.id}::uuid,
            "lastReadAt" = ${marker.created_at}
        WHERE "conversationId" = ${input.conversationId}::uuid
          AND "userId" = ${currentUser.id}::uuid
      `;
    }
    if (access.participant_role === "BUYER" && access.invite_status === "SENT") {
      await tx.$executeRaw`
        UPDATE public."Invite"
        SET status = 'VIEWED', "viewedAt" = COALESCE("viewedAt", now()), "updatedAt" = now()
        WHERE id = ${access.invite_id} AND status = 'SENT'
      `;
    }
    const effectiveReadMarker = advancesReadState
      ? marker
      : { created_at: access.last_read_at!, id: access.last_read_message_id! };
    if (!await hasUnreadNotifiableMessage(tx, input.conversationId, currentUser.id, effectiveReadMarker)) {
      await cancelUnreadMessageEmail(tx, input.conversationId, currentUser.id, "Conversation was read.");
    }
    return { data: { lastReadMessageId: effectiveReadMarker.id } };
  });
}

export async function setConversationMuted(
  input: { conversationId: string; muted: boolean },
) {
  const currentUser = await requireMessagingUser();
  return prisma.$transaction(async (tx) => {
    const initial = await requireConversationAccess(tx, input.conversationId, currentUser.id);
    await lockPair(tx, initial.seller_user_id, initial.buyer_user_id);
    const access = await requireConversationAccess(tx, input.conversationId, currentUser.id);
    await tx.$executeRaw`
      UPDATE public."ConversationParticipant"
      SET "mutedAt" = ${input.muted ? new Date() : null}
      WHERE "conversationId" = ${input.conversationId}::uuid
        AND "userId" = ${currentUser.id}::uuid
    `;
    if (input.muted) {
      await cancelUnreadMessageEmail(tx, input.conversationId, currentUser.id, "Conversation notifications were muted.");
    }
    return { data: { muted: input.muted, role: access.participant_role } };
  });
}

export async function blockConversationUser(
  input: { conversationId: string; reason?: string },
) {
  const currentUser = await requireMessagingUser();
  return prisma.$transaction(async (tx) => {
    const initial = await requireConversationAccess(tx, input.conversationId, currentUser.id);
    await lockPair(tx, initial.seller_user_id, initial.buyer_user_id);
    const access = await requireConversationAccess(tx, input.conversationId, currentUser.id);
    const conversationsClosed = await blockPairInTransaction(
      tx,
      currentUser.id,
      access.other_user_id,
      input.reason,
    );
    await tx.adminAuditLog.create({
      data: {
        action: "conversation_user_blocked",
        actorUserId: currentUser.id,
        metadata: { conversationsClosed },
        targetId: input.conversationId,
        targetType: "conversation",
      },
    });
    return { data: { blocked: true } };
  });
}

export async function reportMessage(input: MessageReportInput) {
  const currentUser = await requireMessagingUser();
  if (!UUID_PATTERN.test(input.messageId)) throw messagingNotFound();
  return prisma.$transaction(async (tx) => {
    const [initialMessage] = await tx.$queryRaw<MessageRow[]>`
      SELECT ${messageColumns()}
      FROM public."Message" message
      WHERE message.id = ${input.messageId}::uuid
    `;
    if (!initialMessage) throw messagingNotFound();
    const initialAccess = await requireConversationAccess(tx, initialMessage.conversation_id, currentUser.id);
    await lockPair(tx, initialAccess.seller_user_id, initialAccess.buyer_user_id);
    const access = await requireConversationAccess(tx, initialMessage.conversation_id, currentUser.id);
    const [message] = await tx.$queryRaw<MessageRow[]>`
      SELECT ${messageColumns()}
      FROM public."Message" message
      WHERE message.id = ${input.messageId}::uuid
        AND message."conversationId" = ${initialMessage.conversation_id}::uuid
    `;
    if (!message) throw messagingNotFound();
    if (!message.sender_user_id || message.sender_user_id === currentUser.id || message.kind === "SYSTEM") {
      throw messagingUnavailable();
    }
    const details = normalizeOptionalText(input.details, 2_000, "Report details");
    const rows = await tx.$queryRaw<Array<{ id: string; status: string }>>`
      INSERT INTO public."MessageReport" (
        "reporterUserId", "reportedUserId", "conversationId", "messageId",
        category, details, "evidenceBodySnapshot", "evidenceContext", status,
        "createdAt", "updatedAt"
      ) VALUES (
        ${currentUser.id}::uuid,
        ${message.sender_user_id}::uuid,
        ${message.conversation_id}::uuid,
        ${message.id}::uuid,
        CAST(${input.category} AS public."MessageReportCategory"),
        ${details},
        ${message.body},
        '{}'::jsonb,
        'OPEN'::public."MessageReportStatus",
        now(), now()
      )
      ON CONFLICT ("reporterUserId", "messageId") DO NOTHING
      RETURNING id, status::text AS status
    `;
    const existing = rows[0] ?? (await tx.$queryRaw<Array<{ id: string; status: string }>>`
      SELECT id, status::text AS status
      FROM public."MessageReport"
      WHERE "reporterUserId" = ${currentUser.id}::uuid
        AND "messageId" = ${message.id}::uuid
    `)[0];
    const reportId = existing?.id;
    if (!reportId) throw new Error("Message report insert returned no row.");
    const conversationsClosed = input.block
      ? await blockPairInTransaction(tx, currentUser.id, access.other_user_id, "Blocked while reporting a message.")
      : 0;
    await tx.adminAuditLog.create({
      data: {
        action: "message_reported",
        actorUserId: currentUser.id,
        metadata: { blocked: Boolean(input.block), category: input.category, conversationsClosed },
        targetId: reportId,
        targetType: "message_report",
      },
    });
    return { data: { blocked: Boolean(input.block), id: reportId, status: existing?.status ?? "OPEN" } };
  });
}

export async function listAdminMessageReports(input: { cursor?: string; pageSize?: number } = {}) {
  const admin = await requireAdminUser();
  const pageSize = input.pageSize ?? 25;
  if (!Number.isInteger(pageSize) || pageSize < 1 || pageSize > 50) {
    throw new MessagingError("INVALID_INPUT", "Report page size is invalid.", 400);
  }
  if (input.cursor && input.cursor.length > 2_048) {
    throw new MessagingError("INVALID_INPUT", "Invalid report cursor.", 400);
  }
  const cursor = input.cursor ? decodeAdminReportListCursor(input.cursor) : null;
  const rows = await loadAdminMessageReportRows(prisma, {
    after: cursor ? {
      createdAt: new Date(cursor.createdAt),
      id: cursor.id,
      statusRank: cursor.statusRank,
    } : undefined,
    limit: pageSize + 1,
  });
  const hasMore = rows.length > pageSize;
  const pageRows = hasMore ? rows.slice(0, pageSize) : rows;
  await prisma.adminAuditLog.create({
    data: {
      action: "message_report_queue_viewed",
      actorUserId: admin.id,
      metadata: { count: pageRows.length, reportIds: pageRows.map((row) => row.id) },
      targetId: "queue",
      targetType: "message_report",
    },
  });
  const lastRow = pageRows.at(-1);
  return {
    items: pageRows.map(adminMessageReportDto),
    pageInfo: {
      hasMore,
      nextCursor: hasMore && lastRow
        ? encodeAdminReportListCursor({
            createdAt: lastRow.created_at.toISOString(),
            id: lastRow.id,
            statusRank: lastRow.status_rank,
          })
        : null,
    },
  };
}

export async function getAdminMessageReport(reportId: string) {
  const admin = await requireAdminUser();
  if (!UUID_PATTERN.test(reportId)) throw messagingNotFound();
  const [row] = await loadAdminMessageReportRows(prisma, { limit: 1, reportId });
  if (!row) throw messagingNotFound();
  await prisma.adminAuditLog.create({
    data: {
      action: "message_report_evidence_viewed",
      actorUserId: admin.id,
      metadata: {},
      targetId: reportId,
      targetType: "message_report",
    },
  });
  return { data: adminMessageReportDto(row) };
}

export async function resolveMessageReport(input: ResolveMessageReportInput) {
  const admin = await requireAdminUser();
  if (!UUID_PATTERN.test(input.reportId)) throw messagingNotFound();
  const resolution = input.status === "IN_REVIEW"
    ? null
    : normalizeRequiredText(input.resolution, 2_000, "Resolution");
  if (input.redactMessage && input.status !== "ACTIONED") {
    throw new MessagingError("INVALID_INPUT", "Only an actioned report can redact a message.", 400);
  }
  return prisma.$transaction(async (tx) => {
    const reports = await tx.$queryRaw<Array<{ message_id: string }>>`
      SELECT "messageId" AS message_id
      FROM public."MessageReport"
      WHERE id = ${input.reportId}::uuid
      FOR UPDATE
    `;
    const report = reports[0];
    if (!report) throw messagingNotFound();
    await tx.$executeRaw`
      UPDATE public."MessageReport"
      SET status = CAST(${input.status} AS public."MessageReportStatus"),
          resolution = ${resolution},
          "reviewedByUserId" = ${admin.id}::uuid,
          "reviewedAt" = now(),
          "updatedAt" = now()
      WHERE id = ${input.reportId}::uuid
    `;
    if (input.redactMessage) {
      await tx.$executeRaw`
        UPDATE public."Message"
        SET "moderationStatus" = 'REDACTED'::public."MessageModerationStatus"
        WHERE id = ${report.message_id}::uuid
      `;
    }
    await tx.adminAuditLog.create({
      data: {
        action: "message_report_resolved",
        actorUserId: admin.id,
        metadata: { redacted: Boolean(input.redactMessage), status: input.status },
        targetId: input.reportId,
        targetType: "message_report",
      },
    });
    return { data: { id: input.reportId, redacted: Boolean(input.redactMessage), status: input.status } };
  });
}

async function requireMessagingUser() {
  const currentUser = await getSessionUser();
  if (!currentUser) throw new MessagingError("AUTHENTICATION_REQUIRED", "Authentication required.", 401);
  return currentUser;
}

async function requireAdminUser() {
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

async function loadConversationAccessRows(
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
      invite."sentAt" AS invite_sent_at,
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

async function requireConversationAccess(
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

function currentParticipantIsActive(access: ConversationAccessRow) {
  return access.participant_role === "SELLER"
    ? access.seller_user_active
    : access.buyer_user_active;
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
    counterpartyLabel: access.participant_role === "SELLER"
      ? buyerAliasForDisplay(access.buyer_display_name, access.buyer_user_id)
      : "Property seller",
    id: access.conversation_id,
    invite: { id: access.invite_id, status: effective.inviteStatus },
    lastMessage: latest ? messageDto(latest, userId) : null,
    lastMessageAt: access.last_message_at.toISOString(),
    muted: Boolean(access.muted_at),
    participantRole: access.participant_role,
    property: { ...snapshot, identityCurrent: access.property_identity_current },
    status: effective.status,
    unreadCount: Number(row?.unread_count ?? 0),
  };
}

function effectiveConversationState(access: ConversationAccessRow) {
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
  const deadline = access.invite_expires_at
    ?? new Date(access.invite_sent_at.getTime() + INVITE_EXPIRATION_DAYS * 86_400_000);
  if (deadline.getTime() <= Date.now()) {
    return { closedReason: "INVITE_EXPIRED", inviteStatus: "Expired", status: "READ_ONLY" as const };
  }
  return {
    closedReason: access.closed_reason,
    inviteStatus: access.invite_status === "VIEWED" ? "Viewed" : "Sent",
    status: access.conversation_status,
  };
}

function canCurrentParticipantSend(
  access: ConversationAccessRow,
  status: ConversationStatusValue,
  sellerFollowUpCount: number,
) {
  if (status === "ACTIVE") return true;
  if (status !== "AWAITING_BUYER") return false;
  if (access.participant_role === "BUYER") return true;
  return sellerFollowUpCount === 0
    && Date.now() >= access.invite_sent_at.getTime() + SELLER_FOLLOW_UP_COOLDOWN_MS;
}

async function countSellerFollowUps(client: Pick<typeof prisma, "$queryRaw">, access: ConversationAccessRow) {
  const [row] = await client.$queryRaw<Array<{ count: number }>>(Prisma.sql`
    SELECT count(*)::integer AS count
    FROM public."Message"
    WHERE "conversationId" = ${access.conversation_id}::uuid
      AND "senderUserId" = ${access.seller_user_id}::uuid
      AND kind = 'GUIDED'::public."MessageKind"
  `);
  return Number(row?.count ?? 0);
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
    const deadline = access.invite_expires_at
      ?? new Date(access.invite_sent_at.getTime() + INVITE_EXPIRATION_DAYS * 86_400_000);
    const eligible = access.invite_status === "ACCEPTED"
      || (["SENT", "VIEWED"].includes(access.invite_status) && deadline.getTime() > Date.now());
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

function propertySnapshot(value: unknown): PropertySnapshotDTO {
  const snapshot = value && typeof value === "object" ? value as Record<string, unknown> : {};
  return {
    identityVersion: typeof snapshot.propertyIdentityVersion === "number"
      ? snapshot.propertyIdentityVersion
      : typeof snapshot.identityVersion === "number" ? snapshot.identityVersion : null,
    location: typeof snapshot.location === "string" ? snapshot.location : "",
    ownershipStatus: typeof snapshot.ownershipVerificationStatus === "string"
      ? snapshot.ownershipVerificationStatus
      : typeof snapshot.ownershipStatus === "string" ? snapshot.ownershipStatus : "",
    title: snapshot.contextUnavailable === true
      ? "Property context unavailable"
      : typeof snapshot.addressLine1 === "string" && snapshot.addressLine1.trim()
        ? snapshot.addressLine1
        : typeof snapshot.title === "string" && snapshot.title.trim() ? snapshot.title : "Private property",
  };
}

function messageDto(message: MessageRow, viewerUserId: string): ConversationMessageDTO {
  return {
    body: visibleMessageBody(message.body, message.moderation_status),
    createdAt: message.created_at.toISOString(),
    id: message.id,
    kind: message.kind,
    moderationStatus: message.moderation_status,
    sender: message.kind === "SYSTEM" || !message.sender_user_id
      ? "SYSTEM"
      : message.sender_user_id === viewerUserId ? "YOU" : "COUNTERPARTY",
    templateKey: message.template_key,
    templateVersion: message.template_version,
  };
}

function messageColumns() {
  return Prisma.sql`
    message.id,
    message."conversationId" AS conversation_id,
    message."senderUserId" AS sender_user_id,
    message.kind::text AS kind,
    message."templateKey" AS template_key,
    message."templateVersion" AS template_version,
    message.body,
    message."clientMessageId" AS client_message_id,
    message."moderationStatus"::text AS moderation_status,
    message."createdAt" AS created_at
  `;
}

async function pairHasBlock(client: Pick<typeof prisma, "$queryRaw">, firstUserId: string, secondUserId: string) {
  const [row] = await client.$queryRaw<Array<{ blocked: boolean }>>(Prisma.sql`
    SELECT EXISTS (
      SELECT 1 FROM public."UserBlock" block
      WHERE (block."blockerUserId" = ${firstUserId}::uuid AND block."blockedUserId" = ${secondUserId}::uuid)
         OR (block."blockerUserId" = ${secondUserId}::uuid AND block."blockedUserId" = ${firstUserId}::uuid)
    ) AS blocked
  `);
  return row?.blocked === true;
}

export async function usersHaveMessagingBlock(
  client: Pick<typeof prisma, "$queryRaw">,
  firstUserId: string,
  secondUserId: string,
) {
  return pairHasBlock(client, firstUserId, secondUserId);
}

export async function lockAndAssertInvitePairAvailable(
  tx: TransactionClient,
  firstUserId: string,
  secondUserId: string,
) {
  await lockPair(tx, firstUserId, secondUserId);
  if (await pairHasBlock(tx, firstUserId, secondUserId)) {
    throw messagingInviteUnavailable();
  }
}

async function lockPair(tx: TransactionClient, firstUserId: string, secondUserId: string) {
  const key = [firstUserId, secondUserId].sort().join(":");
  await tx.$queryRaw`
    SELECT pg_advisory_xact_lock(hashtextextended(${'messaging-pair:' + key}, 0)) IS NULL AS locked
  `;
}

async function lockConversation(tx: TransactionClient, conversationId: string) {
  const rows = await tx.$queryRaw<Array<{ id: string }>>`
    SELECT id FROM public."Conversation" WHERE id = ${conversationId}::uuid FOR UPDATE
  `;
  if (rows.length !== 1) throw messagingNotFound();
}

async function lockInvite(tx: TransactionClient, inviteId: string) {
  const rows = await tx.$queryRaw<Array<{ id: string }>>`
    SELECT id FROM public."Invite" WHERE id = ${inviteId} FOR UPDATE
  `;
  if (rows.length !== 1) throw messagingNotFound();
}

async function lockMessageSender(tx: TransactionClient, userId: string) {
  await tx.$queryRaw`
    SELECT pg_advisory_xact_lock(hashtextextended(${'messaging-sender:' + userId}, 0)) IS NULL AS locked
  `;
}

async function messageMarker(client: Pick<typeof prisma, "$queryRaw">, conversationId: string, messageId: string) {
  const [row] = await client.$queryRaw<Array<{ created_at: Date; id: string }>>(Prisma.sql`
    SELECT id, "createdAt" AS created_at
    FROM public."Message"
    WHERE id = ${messageId}::uuid AND "conversationId" = ${conversationId}::uuid
  `);
  if (!row) throw new MessagingError("INVALID_INPUT", "Message marker is invalid.", 400);
  return row;
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

function markerIsNewer(
  marker: { created_at: Date; id: string },
  lastReadAt: Date | null,
  lastReadMessageId: string | null,
) {
  if (!lastReadAt || !lastReadMessageId) return true;
  const dateComparison = marker.created_at.getTime() - lastReadAt.getTime();
  return dateComparison > 0 || (dateComparison === 0 && marker.id > lastReadMessageId);
}

async function hasUnreadNotifiableMessage(
  client: Pick<typeof prisma, "$queryRaw">,
  conversationId: string,
  recipientUserId: string,
  marker: { created_at: Date; id: string },
) {
  const [row] = await client.$queryRaw<Array<{ unread: boolean }>>(Prisma.sql`
    SELECT EXISTS (
      SELECT 1
      FROM public."Message" message
      WHERE message."conversationId" = ${conversationId}::uuid
        AND message."senderUserId" IS NOT NULL
        AND message."senderUserId" <> ${recipientUserId}::uuid
        AND message.kind IN ('GUIDED'::public."MessageKind", 'FREE_TEXT'::public."MessageKind")
        AND (
          message."createdAt" > ${marker.created_at}
          OR (message."createdAt" = ${marker.created_at} AND message.id > ${marker.id}::uuid)
        )
    ) AS unread
  `);
  return row?.unread === true;
}

async function blockPairInTransaction(
  tx: TransactionClient,
  blockerUserId: string,
  blockedUserId: string,
  reason?: string,
) {
  const [result] = await tx.$queryRaw<Array<{ count: number }>>`
    SELECT count(*)::integer AS count
    FROM public."Conversation" conversation
    WHERE conversation.status <> 'BLOCKED'::public."ConversationStatus"
      AND EXISTS (
        SELECT 1 FROM public."ConversationParticipant" first_participant
        WHERE first_participant."conversationId" = conversation.id
          AND first_participant."userId" = ${blockerUserId}::uuid
      )
      AND EXISTS (
        SELECT 1 FROM public."ConversationParticipant" second_participant
        WHERE second_participant."conversationId" = conversation.id
          AND second_participant."userId" = ${blockedUserId}::uuid
      )
  `;

  await tx.$executeRaw`
    INSERT INTO public."UserBlock" ("blockerUserId", "blockedUserId", reason, "createdAt")
    VALUES (${blockerUserId}::uuid, ${blockedUserId}::uuid, ${normalizeOptionalText(reason, 500, "Block reason")}, now())
    ON CONFLICT ("blockerUserId", "blockedUserId") DO NOTHING
  `;
  await tx.$executeRaw`
    WITH frozen AS (
      UPDATE public."LoiNegotiation"
      SET status = 'READ_ONLY'::public."LoiNegotiationStatus",
          "closedReason" = 'PARTICIPANTS_BLOCKED'::public."LoiClosedReason",
          "closedAt" = now(),
          "updatedAt" = now()
      WHERE status NOT IN (
        'TERMS_ALIGNED'::public."LoiNegotiationStatus",
        'DECLINED'::public."LoiNegotiationStatus",
        'WITHDRAWN'::public."LoiNegotiationStatus",
        'EXPIRED'::public."LoiNegotiationStatus",
        'READ_ONLY'::public."LoiNegotiationStatus"
      )
        AND (
          ("buyerUserId" = ${blockerUserId}::uuid AND "sellerUserId" = ${blockedUserId}::uuid)
          OR ("buyerUserId" = ${blockedUserId}::uuid AND "sellerUserId" = ${blockerUserId}::uuid)
        )
      RETURNING id, "currentRevisionId"
    )
    INSERT INTO public."LoiEvent" (
      id, "negotiationId", "revisionId", type, "clientActionId", metadata, "createdAt"
    )
    SELECT gen_random_uuid(), frozen.id, frozen."currentRevisionId",
      'FROZEN'::public."LoiEventType", gen_random_uuid(), '{}'::jsonb, now()
    FROM frozen
  `;
  await tx.$executeRaw`
    DELETE FROM public."LoiDraft" draft
    USING public."LoiNegotiation" negotiation
    WHERE draft."negotiationId" = negotiation.id
      AND negotiation.status = 'READ_ONLY'::public."LoiNegotiationStatus"
      AND negotiation."closedReason" = 'PARTICIPANTS_BLOCKED'::public."LoiClosedReason"
      AND (
        (negotiation."buyerUserId" = ${blockerUserId}::uuid AND negotiation."sellerUserId" = ${blockedUserId}::uuid)
        OR (negotiation."buyerUserId" = ${blockedUserId}::uuid AND negotiation."sellerUserId" = ${blockerUserId}::uuid)
      )
  `;
  await tx.emailOutbox.updateMany({
    where: {
      loiNegotiation: {
        OR: [
          { buyerUserId: blockerUserId, sellerUserId: blockedUserId },
          { buyerUserId: blockedUserId, sellerUserId: blockerUserId },
        ],
      },
      status: { in: ["PENDING", "FAILED"] },
      type: "LOI_UPDATE",
    },
    data: { lastError: "The participants are no longer eligible.", nextAttemptAt: null, status: "CANCELLED" },
  });
  return Number(result?.count ?? 0);
}

async function queueUnreadMessageEmail(
  tx: TransactionClient,
  access: ConversationAccessRow,
  senderUserId: string,
  messageId: string,
  now: Date,
) {
  const recipientUserId = senderUserId === access.seller_user_id ? access.buyer_user_id : access.seller_user_id;
  const recipientEmail = senderUserId === access.seller_user_id ? access.buyer_email : access.seller_email;
  const [recipient] = await tx.$queryRaw<Array<{ created_at: Date; last_read_at: Date | null; muted_at: Date | null }>>`
    SELECT "createdAt" AS created_at, "lastReadAt" AS last_read_at, "mutedAt" AS muted_at
    FROM public."ConversationParticipant"
    WHERE "conversationId" = ${access.conversation_id}::uuid
      AND "userId" = ${recipientUserId}::uuid
  `;
  if (!recipient || recipient.muted_at) return;
  const unreadBatchStart = recipient.last_read_at ?? recipient.created_at;
  const [existing] = await tx.$queryRaw<Array<{ id: string }>>`
    SELECT id FROM public."EmailOutbox"
    WHERE type = 'MESSAGE_UNREAD'
      AND "messageConversationId" = ${access.conversation_id}::uuid
      AND "messageRecipientUserId" = ${recipientUserId}::uuid
      AND "createdAt" > ${unreadBatchStart}
      AND status IN ('PENDING', 'SENDING', 'SENT', 'FAILED')
    LIMIT 1
  `;
  if (existing) return;
  await tx.emailOutbox.create({
    data: {
      idempotencyKey: `message-unread:${access.conversation_id}:${recipientUserId}:${messageId}`,
      messageConversationId: access.conversation_id,
      messageRecipientUserId: recipientUserId,
      nextAttemptAt: new Date(now.getTime() + UNREAD_MESSAGE_EMAIL_DELAY_MS),
      payload: {},
      status: "PENDING",
      subject: "You have an unread Liber message",
      templateName: "message-unread",
      to: recipientEmail,
      type: "MESSAGE_UNREAD",
    },
  });
}

async function cancelUnreadMessageEmail(
  client: Pick<typeof prisma, "$executeRaw">,
  conversationId: string,
  recipientUserId: string,
  reason: string,
) {
  await client.$executeRaw(Prisma.sql`
    UPDATE public."EmailOutbox"
    SET status = 'CANCELLED'::public."EmailOutboxStatus",
        "lastError" = ${reason},
        "nextAttemptAt" = NULL,
        "lockedAt" = NULL,
        "leaseUntil" = NULL,
        "workerId" = NULL,
        "updatedAt" = now()
    WHERE type = 'MESSAGE_UNREAD'
      AND "messageConversationId" = ${conversationId}::uuid
      AND "messageRecipientUserId" = ${recipientUserId}::uuid
      AND status IN ('PENDING', 'FAILED', 'SENDING')
  `);
}

async function loadAdminMessageReportRows(
  client: Pick<typeof prisma, "$queryRaw">,
  options: {
    after?: { createdAt: Date; id: string; statusRank: number };
    limit?: number;
    reportId?: string;
  } = {},
) {
  const statusRank = Prisma.sql`CASE report.status WHEN 'OPEN' THEN 0 WHEN 'IN_REVIEW' THEN 1 ELSE 2 END`;
  const predicates: Prisma.Sql[] = [];
  if (options.reportId) predicates.push(Prisma.sql`report.id = ${options.reportId}::uuid`);
  if (options.after) {
    predicates.push(Prisma.sql`(
      ${statusRank} > ${options.after.statusRank}
      OR (
        ${statusRank} = ${options.after.statusRank}
        AND (
          report."createdAt" < ${options.after.createdAt}
          OR (
            report."createdAt" = ${options.after.createdAt}
            AND report.id < ${options.after.id}::uuid
          )
        )
      )
    )`);
  }
  const reportFilter = predicates.length > 0
    ? Prisma.sql`WHERE ${Prisma.join(predicates, " AND ")}`
    : Prisma.empty;
  return client.$queryRaw<AdminMessageReportRow[]>(Prisma.sql`
    SELECT
      report.id,
      report.category::text AS category,
      report.status::text AS status,
      ${statusRank} AS status_rank,
      report."conversationId" AS conversation_id,
      report."messageId" AS message_id,
      report.details,
      report.resolution,
      report."evidenceBodySnapshot" AS evidence_body_snapshot,
      report."evidenceContext" AS evidence_context,
      report."createdAt" AS created_at,
      COALESCE(report."evidenceContext" ->> 'messageKind', 'FREE_TEXT') AS message_kind,
      COALESCE(report."evidenceContext" ->> 'moderationStatus', 'ALLOWED') AS message_moderation_status,
      COALESCE(
        (report."evidenceContext" ->> 'messageCreatedAt')::timestamp,
        report."createdAt"
      ) AS message_created_at,
      conversation."propertySnapshot" AS property_snapshot,
      invite.id AS invite_id,
      invite.status::text AS invite_status,
      CASE
        WHEN report."reporterUserId" = invite."sellerId" THEN 'Property seller'
        ELSE 'Buyer participant'
      END AS reporter_label,
      CASE
        WHEN report."reportedUserId" = invite."sellerId" THEN 'Property seller'
        ELSE 'Buyer participant'
      END AS reported_label,
      (
        SELECT count(*)::integer
        FROM public."MessageReport" prior_report
        WHERE prior_report."reportedUserId" = report."reportedUserId"
          AND prior_report."createdAt" < report."createdAt"
      ) AS prior_report_count,
      (
        SELECT count(*)::integer
        FROM public."UserBlock" prior_block
        WHERE prior_block."blockedUserId" = report."reportedUserId"
          AND prior_block."createdAt" < report."createdAt"
      ) AS prior_block_count
    FROM public."MessageReport" report
    JOIN public."Conversation" conversation ON conversation.id = report."conversationId"
    JOIN public."Invite" invite ON invite.id = conversation."inviteId"
    ${reportFilter}
    ORDER BY
      ${statusRank},
      report."createdAt" DESC,
      report.id DESC
    LIMIT ${options.limit ?? 25}
  `);
}

function adminMessageReportDto(row: AdminMessageReportRow) {
  const snapshot = propertySnapshot(row.property_snapshot);
  const capturedEvidence = recordValue(row.evidence_context);
  const capturedMessages = capturedEvidence ? arrayRecords(capturedEvidence.surroundingMessages) : [];
  const surroundingMessages = capturedMessages
    .filter((message) => (textField(message, "messageId") || textField(message, "id")) !== row.message_id)
    .map((message) => {
      const sender = textField(message, "sender");
      const senderLabel = sender === "SYSTEM"
        ? "Liber"
        : sender === "REPORTER" ? row.reporter_label
          : sender === "REPORTED_USER" || sender === "REPORTED" ? row.reported_label
            : textField(message, "senderLabel") || "Participant";
      return {
        body: textField(message, "body"),
        createdAt: dateField(message, "createdAt"),
        id: textField(message, "messageId") || textField(message, "id"),
        kind: textField(message, "kind") || "FREE_TEXT",
        moderationStatus: textField(message, "moderationStatus") || "ALLOWED",
        sender: sender === "SYSTEM" ? "SYSTEM" : "COUNTERPARTY",
        senderLabel,
      };
    });
  return {
    category: row.category,
    conversationId: row.conversation_id,
    createdAt: row.created_at.toISOString(),
    details: row.details,
    id: row.id,
    invite: { id: row.invite_id, status: row.invite_status },
    message: {
      body: row.evidence_body_snapshot,
      createdAt: row.message_created_at.toISOString(),
      id: row.message_id,
      kind: row.message_kind,
      moderationStatus: row.message_moderation_status,
      sender: "COUNTERPARTY",
      senderLabel: row.reported_label,
    },
    messageId: row.message_id,
    priorBlockCount: Number(row.prior_block_count),
    priorReportCount: Number(row.prior_report_count),
    property: snapshot,
    propertyTitle: snapshot.title,
    reportedLabel: row.reported_label,
    reporterLabel: row.reporter_label,
    resolution: row.resolution,
    severity: reportSeverity(row.category),
    status: row.status,
    surroundingMessages,
  };
}

function reportSeverity(category: string) {
  if ([
    "HARASSMENT_OR_THREAT",
    "DISCRIMINATORY_CONTENT",
    "FRAUD_OR_SCAM",
    "OFF_PLATFORM_PAYMENT_REQUEST",
  ].includes(category)) return "HIGH";
  if (["SENSITIVE_INFORMATION_REQUEST", "SPAM"].includes(category)) return "MEDIUM";
  return "LOW";
}

function arrayRecords(value: unknown) {
  return Array.isArray(value)
    ? value.filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === "object" && !Array.isArray(item))
    : [];
}

function recordValue(value: unknown): Record<string, unknown> | null {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function textField(value: Record<string, unknown>, key: string) {
  return typeof value[key] === "string" ? value[key] : "";
}

function dateField(value: Record<string, unknown>, key: string) {
  const candidate = value[key];
  if (candidate instanceof Date) return candidate.toISOString();
  return typeof candidate === "string" && Number.isFinite(new Date(candidate).getTime()) ? candidate : "";
}

function normalizeOptionalText(value: string | undefined, maxLength: number, label: string) {
  if (value === undefined) return null;
  if (!value.trim()) return null;
  const normalized = normalizeMessageBody(value);
  if (Array.from(normalized).length > maxLength) {
    throw new MessagingError("INVALID_INPUT", `${label} is too long.`, 400);
  }
  return normalized;
}

function normalizeRequiredText(value: string | undefined, maxLength: number, label: string) {
  const normalized = normalizeOptionalText(value, maxLength, label);
  if (!normalized) throw new MessagingError("INVALID_INPUT", `${label} is required.`, 400);
  return normalized;
}

function assertUuid(value: string, label: string) {
  if (!UUID_PATTERN.test(value)) {
    throw new MessagingError("INVALID_INPUT", `${label} is invalid.`, 400);
  }
}

function inviteStatusValue(value: string) {
  if (["ACCEPTED", "DECLINED", "EXPIRED", "SENT", "VIEWED", "WITHDRAWN"].includes(value)) {
    return value as "ACCEPTED" | "DECLINED" | "EXPIRED" | "SENT" | "VIEWED" | "WITHDRAWN";
  }
  throw messagingUnavailable();
}
