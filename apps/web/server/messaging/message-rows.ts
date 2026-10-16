// The qualified Message projection, its DTO mapping, and message lookups.
import { Prisma, prisma } from "@liber/db";
import { visibleMessageBody } from "./content";
import { MessagingError } from "./errors";
import type { ConversationMessageDTO, PropertySnapshotDTO } from "./types";

export type MessageRow = {
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

export function propertySnapshot(value: unknown): PropertySnapshotDTO {
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
        : typeof snapshot.title === "string" && snapshot.title.trim() ? snapshot.title : "Seller's property",
  };
}

export function messageDto(message: MessageRow, viewerUserId: string): ConversationMessageDTO {
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

export function messageColumns() {
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

export async function messageMarker(client: Pick<typeof prisma, "$queryRaw">, conversationId: string, messageId: string) {
  const [row] = await client.$queryRaw<Array<{ created_at: Date; id: string }>>(Prisma.sql`
    SELECT id, "createdAt" AS created_at
    FROM public."Message"
    WHERE id = ${messageId}::uuid AND "conversationId" = ${conversationId}::uuid
  `);
  if (!row) throw new MessagingError("INVALID_INPUT", "Message marker is invalid.", 400);
  return row;
}
