import type { Prisma } from "@liber/db";

const OPEN_INVITE_STATUSES = ["SENT", "VIEWED", "ACCEPTED"] as const;

/**
 * Withdraws a buyer profile's open invites when the profile stops being seller-visible
 * (buyer pause or admin hide), as suspension does. The visibility-loss trigger closes
 * their conversations read-only, and messaging treats an ACCEPTED invite as live, so
 * leaving them open would revive dead conversations on republish. Rows lock in id order,
 * like the block trigger; the invite status trigger then closes each conversation.
 */
export async function withdrawOpenBuyerInvites(tx: Prisma.TransactionClient, buyerProfileId: string) {
  const open = await tx.$queryRaw<Array<{ id: string }>>`
    SELECT id
    FROM public."Invite"
    WHERE "buyerProfileId" = ${buyerProfileId}
      AND status IN ('SENT', 'VIEWED', 'ACCEPTED')
    ORDER BY id
    FOR UPDATE
  `;
  if (!open.length) return 0;
  const { count } = await tx.invite.updateMany({
    where: { id: { in: open.map((invite) => invite.id) }, status: { in: [...OPEN_INVITE_STATUSES] } },
    data: { status: "WITHDRAWN" },
  });
  return count;
}
