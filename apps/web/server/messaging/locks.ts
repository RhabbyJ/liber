// Messaging lock order: pair advisory lock -> Invite row -> Conversation row ->
// sender quota advisory lock. Callers acquire them in that order.
import type { Prisma } from "@liber/db";
import { messagingNotFound } from "./errors";

export type TransactionClient = Prisma.TransactionClient;

export async function lockPair(tx: TransactionClient, firstUserId: string, secondUserId: string) {
  const key = [firstUserId, secondUserId].sort().join(":");
  await tx.$queryRaw`
    SELECT pg_advisory_xact_lock(hashtextextended(${'messaging-pair:' + key}, 0)) IS NULL AS locked
  `;
}

export async function lockConversation(tx: TransactionClient, conversationId: string) {
  const rows = await tx.$queryRaw<Array<{ id: string }>>`
    SELECT id FROM public."Conversation" WHERE id = ${conversationId}::uuid FOR UPDATE
  `;
  if (rows.length !== 1) throw messagingNotFound();
}

export async function lockInvite(tx: TransactionClient, inviteId: string) {
  const rows = await tx.$queryRaw<Array<{ id: string }>>`
    SELECT id FROM public."Invite" WHERE id = ${inviteId} FOR UPDATE
  `;
  if (rows.length !== 1) throw messagingNotFound();
}

export async function lockMessageSender(tx: TransactionClient, userId: string) {
  await tx.$queryRaw`
    SELECT pg_advisory_xact_lock(hashtextextended(${'messaging-sender:' + userId}, 0)) IS NULL AS locked
  `;
}
