import type { InviteDTO } from "./marketplace-dtos";

/**
 * Display status of an invite. "Withdrawn" covers seller, admin, block,
 * suspension, and property-identity withdrawals.
 */
export type InviteStatusLabel = InviteDTO["status"];

export type InviteView = InviteDTO;

/** Statuses a seller can still withdraw: awaiting a reply or accepted and messageable. */
export const openInviteStatuses: readonly InviteStatusLabel[] = ["Sent", "Viewed", "Accepted"];

export function isOpenInvite(status: InviteStatusLabel) {
  return openInviteStatuses.includes(status);
}

export function inviteStatusTone(status: InviteStatusLabel): "active" | "pending" | "declined" | "closed" {
  if (status === "Accepted") return "active";
  if (status === "Sent" || status === "Viewed") return "pending";
  if (status === "Declined") return "declined";
  return "closed";
}
