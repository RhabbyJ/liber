import { INVITE_EXPIRATION_DAYS } from "./maintenance";

const actionableInviteStatuses = new Set(["SENT", "VIEWED"]);

type InviteValidityInput = {
  expiresAt?: Date | string | null;
  sentAt: Date | string;
  status: string;
};

export function inviteDeadline(invite: Pick<InviteValidityInput, "expiresAt" | "sentAt">) {
  if (invite.expiresAt) return new Date(invite.expiresAt);
  return new Date(new Date(invite.sentAt).getTime() + INVITE_EXPIRATION_DAYS * 86_400_000);
}

export function inviteIsExpired(invite: InviteValidityInput, now = new Date()) {
  return actionableInviteStatuses.has(invite.status) && inviteDeadline(invite).getTime() <= now.getTime();
}

export function effectiveInviteStatus(invite: InviteValidityInput, now = new Date()) {
  return inviteIsExpired(invite, now) ? "EXPIRED" : invite.status;
}

export function assertInviteParticipants(args: {
  buyerUserId?: string;
  propertyOwnerUserId: string;
  sellerId: string;
}) {
  if (args.propertyOwnerUserId !== args.sellerId) {
    throw new Error("Seller must own property before sending invites.");
  }
  if (args.buyerUserId === args.sellerId) {
    throw new Error("Sellers cannot invite their own buyer profile.");
  }
}
