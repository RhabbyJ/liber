import type { InviteDTO } from "../../../lib/marketplace-dtos";

const groupOrder = [
  { key: "awaiting", statuses: ["Sent", "Viewed"], title: "Awaiting your reply" },
  { key: "accepted", statuses: ["Accepted"], title: "Accepted" },
  { key: "closed", statuses: ["Declined", "Expired"], title: "Closed" },
] as const;

/** Invites needing a reply first, then accepted, then closed; each group keeps the server's newest-first order. */
export function groupBuyerInvites(invites: InviteDTO[]) {
  return groupOrder
    .map((group) => ({
      invites: invites.filter((invite) => (group.statuses as readonly string[]).includes(invite.status)),
      key: group.key,
      title: group.title,
    }))
    .filter((group) => group.invites.length > 0);
}
