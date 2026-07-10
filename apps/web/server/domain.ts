import type { AppRole, SessionUser } from "./authz";
import { hasRole, requireRole } from "./authz";
import { assertInviteParticipants } from "./invite-integrity";

type InviteBuyer = {
  userId: string;
  visibility: "active" | "draft" | "hidden";
};

type InviteProperty = {
  ownerUserId: string;
  ownershipVerificationStatus: "NOT_SUBMITTED" | "PENDING" | "APPROVED" | "REJECTED";
};

export const UNVERIFIED_SELLER_INVITE_LIMIT_PER_DAY = 5;
export const VERIFIED_SELLER_INVITE_LIMIT_PER_DAY = 25;

export function assertRouteAllowed(pathname: string, user: SessionUser | null) {
  const requiredRole = requiredRoleForPath(pathname);
  if (!requiredRole && !requiresAuthenticatedUser(pathname)) return;
  if (!user) throw new Error("Authentication required.");
  if (!requiredRole) return;
  if (!hasRole(user, requiredRole)) {
    throw new Error(`Missing required role: ${requiredRole}`);
  }
}

export function requiresAuthenticatedUser(pathname: string) {
  return isPathSegment(pathname, "/buyers") || requiredRoleForPath(pathname) !== null;
}

export function requiredRoleForPath(pathname: string): AppRole | null {
  if (isPathSegment(pathname, "/admin")) return "ADMIN";
  if (isPathSegment(pathname, "/buyer")) return "BUYER";
  if (isPathSegment(pathname, "/seller")) return "SELLER";
  return null;
}

function isPathSegment(pathname: string, prefix: string) {
  return pathname === prefix || pathname.startsWith(`${prefix}/`);
}

export function assertInviteAllowed(args: {
  seller: SessionUser;
  buyer: InviteBuyer;
  property: InviteProperty;
  sentInviteCountToday: number;
}) {
  requireRole(args.seller, "SELLER");
  assertInviteParticipants({
    buyerUserId: args.buyer.userId,
    propertyOwnerUserId: args.property.ownerUserId,
    sellerId: args.seller.id,
  });

  if (args.buyer.visibility !== "active") {
    throw new Error("Buyer profile must be active before receiving invites.");
  }

  const inviteLimit = sellerInviteLimitForProperty(args.property);

  if (args.sentInviteCountToday >= inviteLimit) {
    throw new Error("Seller invite rate limit reached.");
  }
}

export function sellerInviteLimitForProperty(property: InviteProperty) {
  return property.ownershipVerificationStatus === "APPROVED"
    ? VERIFIED_SELLER_INVITE_LIMIT_PER_DAY
    : UNVERIFIED_SELLER_INVITE_LIMIT_PER_DAY;
}
