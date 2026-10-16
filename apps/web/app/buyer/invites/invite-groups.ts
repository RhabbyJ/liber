import type { InviteView } from "../../../lib/invite-status";

const groupOrder = [
  { key: "awaiting", statuses: ["Sent", "Viewed"], title: "Awaiting your reply" },
  { key: "accepted", statuses: ["Accepted"], title: "Accepted" },
  { key: "closed", statuses: ["Declined", "Expired", "Withdrawn"], title: "Closed" },
] as const;

/** Invites needing a reply first, then accepted, then closed; each group keeps the server's newest-first order. */
export function groupBuyerInvites(invites: InviteView[]) {
  return groupOrder
    .map((group) => ({
      invites: invites.filter((invite) => (group.statuses as readonly string[]).includes(invite.status)),
      key: group.key,
      title: group.title,
    }))
    .filter((group) => group.invites.length > 0);
}
