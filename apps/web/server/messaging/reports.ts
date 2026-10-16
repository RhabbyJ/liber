// Participant message reports and the report-driven, audited admin moderation queue.
import { Prisma, prisma } from "@liber/db";
import { requireAdminUser, requireConversationAccess, requireMessagingUser, UUID_PATTERN } from "./access";
import { blockPairInTransaction } from "./blocks-and-mutes";
import { normalizeOptionalText, normalizeRequiredText } from "./content";
import { decodeAdminReportListCursor, encodeAdminReportListCursor } from "./cursor";
import { MessagingError, messagingNotFound, messagingUnavailable } from "./errors";
import { lockPair } from "./locks";
import { messageColumns, propertySnapshot, type MessageRow } from "./message-rows";
import type { MessageReportInput, ResolveMessageReportInput } from "./types";

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

export async function reportMessage(input: MessageReportInput) {
  const currentUser = await requireMessagingUser();
  if (!UUID_PATTERN.test(input.messageId)) throw messagingNotFound();
  return prisma.$transaction(async (tx) => {
    const [initialMessage] = await tx.$queryRaw<MessageRow[]>(Prisma.sql`
      SELECT ${messageColumns()}
      FROM public."Message" message
      WHERE message.id = ${input.messageId}::uuid
    `);
    if (!initialMessage) throw messagingNotFound();
    const initialAccess = await requireConversationAccess(tx, initialMessage.conversation_id, currentUser.id);
    await lockPair(tx, initialAccess.seller_user_id, initialAccess.buyer_user_id);
    const access = await requireConversationAccess(tx, initialMessage.conversation_id, currentUser.id);
    const [message] = await tx.$queryRaw<MessageRow[]>(Prisma.sql`
      SELECT ${messageColumns()}
      FROM public."Message" message
      WHERE message.id = ${input.messageId}::uuid
        AND message."conversationId" = ${initialMessage.conversation_id}::uuid
    `);
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
