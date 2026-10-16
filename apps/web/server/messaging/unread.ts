// The Messages nav badge: how many inbox conversations hold unread messages.
import { Prisma, prisma } from "@liber/db";
import { messagingV1ConversationScopeForUser } from "./feature";

/** Counting stops here; the badge shows "99+". */
export const UNREAD_CONVERSATION_COUNT_CAP = 100;

/**
 * Counts conversations the inbox would list for `userId` (two participants and
 * a counterparty inside the enabled cohort) that have a message after the
 * viewer's read marker, using the inbox's own unread rule. Returns null when
 * messaging is not enabled for the viewer. The count is capped so a large
 * backlog stays a bounded, index-only scan.
 */
export async function countUnreadConversations(
  userId: string,
  client: Pick<typeof prisma, "$queryRaw"> = prisma,
): Promise<number | null> {
  const scope = messagingV1ConversationScopeForUser(userId);
  if (!scope) return null;
  if (scope.counterpartyUserIds?.length === 0) return 0;
  const cohortFilter = scope.counterpartyUserIds
    ? Prisma.sql`AND EXISTS (
        SELECT 1
        FROM public."ConversationParticipant" counterparty
        WHERE counterparty."conversationId" = participant."conversationId"
          AND counterparty."userId" <> ${userId}::uuid
          AND counterparty."userId" IN (${Prisma.join(scope.counterpartyUserIds.map((id) => Prisma.sql`${id}::uuid`))})
      )`
    : Prisma.empty;
  const [row] = await client.$queryRaw<Array<{ count: number }>>(Prisma.sql`
    SELECT count(*)::integer AS count
    FROM (
      SELECT 1
      FROM public."ConversationParticipant" participant
      WHERE participant."userId" = ${userId}::uuid
        AND (
          SELECT count(*)
          FROM public."ConversationParticipant" member
          WHERE member."conversationId" = participant."conversationId"
        ) = 2
        ${cohortFilter}
        AND EXISTS (
          SELECT 1
          FROM public."Message" unread_message
          WHERE unread_message."conversationId" = participant."conversationId"
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
        )
      LIMIT ${UNREAD_CONVERSATION_COUNT_CAP}
    ) unread_conversation
  `);
  return Number(row?.count ?? 0);
}
