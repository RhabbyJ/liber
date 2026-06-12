import type { Buyer, Invite, Property } from "../lib/mock-data";
import { buyers } from "../lib/mock-data";
import { formatBadgeType } from "../lib/format";
import type { AppRole, SessionUser } from "./authz";
import { hasRole, requireOwnedResource, requireRole } from "./authz";
import { searchBuyersSchema, type SearchBuyersInput } from "@liber/validators";

export const UNVERIFIED_SELLER_INVITE_LIMIT_PER_DAY = 5;
export const VERIFIED_SELLER_INVITE_LIMIT_PER_DAY = 25;

export function activeBuyerProfiles(source: Buyer[] = buyers) {
  return source.filter((buyer) => buyer.visibility === "active");
}

export function isBadgeActive(badge: Buyer["badges"][number]) {
  return badge.status === "active" && (badge.expiresInDays === undefined || badge.expiresInDays >= 0);
}

export function hasActiveBadge(buyer: Buyer, badgeType: string) {
  const expected = formatBadgeType(badgeType);
  return buyer.badges.some((badge) => badge.label === expected && isBadgeActive(badge));
}

export function searchBuyerDirectory(input: unknown, source: Buyer[] = buyers, options: { excludeUserId?: string } = {}) {
  const filters = searchBuyersSchema.parse(input);
  const results = activeBuyerProfiles(source)
    .filter((buyer) => !options.excludeUserId || buyer.userId !== options.excludeUserId)
    .filter((buyer) => matchesBuyerFilters(buyer, filters));

  return results.sort((a, b) => compareBuyers(a, b, filters.sort));
}

function matchesBuyerFilters(buyer: Buyer, filters: SearchBuyersInput) {
  const centerLat = filters.centerLat;
  const centerLng = filters.centerLng;
  const radiusMiles = filters.radiusMiles;
  const hasRadiusFilter =
    centerLat !== undefined &&
    centerLng !== undefined &&
    radiusMiles !== undefined;
  if (!hasRadiusFilter && filters.city && buyer.city.toLowerCase() !== filters.city.toLowerCase()) return false;
  if (!hasRadiusFilter && filters.state && buyer.state !== filters.state.toUpperCase()) return false;
  if (
    hasRadiusFilter &&
    distanceMiles(centerLat, centerLng, buyer.lat, buyer.lng) > radiusMiles
  ) {
    return false;
  }
  if (filters.propertySubtype && !buyer.propertySubtypes.includes(filters.propertySubtype)) return false;
  if (filters.budgetMax !== undefined && buyer.budgetMin > filters.budgetMax) return false;
  if (!matchesPropertyFit(buyer, filters)) return false;
  if (filters.badges.length > 0 && !filters.badges.every((badge) => hasActiveBadge(buyer, badge))) {
    return false;
  }
  if (filters.condition && !matchesConditionPreference(buyer, filters.condition)) return false;
  if (filters.amenities.length > 0 && !matchesAmenityNeeds(buyer, filters.amenities)) return false;

  return true;
}

function matchesConditionPreference(buyer: Buyer, condition: string) {
  const wanted = condition.trim().toLowerCase();
  if (!wanted) return true;
  if (buyer.criteriaDetails.length === 0) return true;

  // Buyers without a stated condition preference are open to any condition.
  return buyer.criteriaDetails.some((criteria) => {
    const stated = criteria.condition?.trim().toLowerCase();
    return !stated || stated === wanted;
  });
}

function matchesAmenityNeeds(buyer: Buyer, amenities: string[]) {
  const stated = new Set(
    buyer.criteriaDetails
      .flatMap((criteria) => criteria.features ?? [])
      .concat(buyer.criteria)
      .map((feature) => feature.trim().toLowerCase()),
  );

  return amenities.every((amenity) => stated.has(amenity.trim().toLowerCase()));
}

function matchesPropertyFit(buyer: Buyer, filters: SearchBuyersInput) {
  const hasPropertyFitFilter =
    filters.bedrooms !== undefined ||
    filters.bathrooms !== undefined ||
    filters.squareFeet !== undefined ||
    filters.lotSize !== undefined;
  if (!hasPropertyFitFilter) return true;

  return buyer.criteriaDetails.some((criteria) => {
    if (filters.propertySubtype && criteria.propertySubtype !== filters.propertySubtype) return false;
    if (filters.propertyCategory && criteria.propertyCategory !== filters.propertyCategory) return false;
    if (filters.bedrooms !== undefined && criteria.bedroomsMin !== undefined && criteria.bedroomsMin > filters.bedrooms) return false;
    if (filters.bathrooms !== undefined && criteria.bathroomsMin !== undefined && criteria.bathroomsMin > filters.bathrooms) return false;
    if (filters.squareFeet !== undefined && criteria.squareFeetMin !== undefined && criteria.squareFeetMin > filters.squareFeet) return false;
    if (filters.squareFeet !== undefined && criteria.squareFeetMax !== undefined && criteria.squareFeetMax < filters.squareFeet) return false;
    if (filters.lotSize !== undefined && criteria.lotSizeMin !== undefined && criteria.lotSizeMin > filters.lotSize) return false;
    if (filters.lotSize !== undefined && criteria.lotSizeMax !== undefined && criteria.lotSizeMax < filters.lotSize) return false;
    return true;
  });
}

function distanceMiles(lat1: number, lng1: number, lat2: number, lng2: number) {
  const earthRadiusMiles = 3958.8;
  const toRadians = (degrees: number) => degrees * (Math.PI / 180);
  const dLat = toRadians(lat2 - lat1);
  const dLng = toRadians(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRadians(lat1)) * Math.cos(toRadians(lat2)) * Math.sin(dLng / 2) ** 2;

  return 2 * earthRadiusMiles * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function compareBuyers(a: Buyer, b: Buyer, sort: SearchBuyersInput["sort"]) {
  if (sort === "highest_budget") return b.budgetMax - a.budgetMax;
  if (sort === "most_verified") {
    return b.badges.filter(isBadgeActive).length - a.badges.filter(isBadgeActive).length;
  }
  if (sort === "recently_active") return b.refreshedAt.localeCompare(a.refreshedAt);

  return recommendedScore(b) - recommendedScore(a);
}

export function recommendedScore(buyer: Buyer) {
  return (
    buyer.badges.filter(isBadgeActive).length * 8 +
    Math.min(buyer.budgetMax / 250000, 20)
  );
}

export function countSellerInvitesToday(sellerId: string, source: Invite[], today = new Date()) {
  const todayKey = today.toISOString().slice(0, 10);

  return source.filter((invite) => invite.sellerId === sellerId && invite.sentAtDate === todayKey).length;
}

export function assertRouteAllowed(pathname: string, user: SessionUser | null) {
  const requiredRole = requiredRoleForPath(pathname);
  if (!requiredRole) return;
  if (!user) throw new Error("Authentication required.");
  if (!hasRole(user, requiredRole)) {
    throw new Error(`Missing required role: ${requiredRole}`);
  }
}

export function requiredRoleForPath(pathname: string): AppRole | null {
  if (pathname.startsWith("/admin")) return "ADMIN";
  if (pathname.startsWith("/buyer")) return "BUYER";
  if (pathname.startsWith("/seller")) return "SELLER";
  return null;
}

export function assertInviteAllowed(args: {
  seller: SessionUser;
  buyer: Buyer;
  property: Property;
  sentInviteCountToday: number;
}) {
  requireRole(args.seller, "SELLER");
  requireOwnedResource(args.property.ownerUserId, args.seller);

  if (args.buyer.visibility !== "active") {
    throw new Error("Buyer profile must be active before receiving invites.");
  }

  const inviteLimit = sellerInviteLimitForProperty(args.property);

  if (args.sentInviteCountToday >= inviteLimit) {
    throw new Error("Seller invite rate limit reached.");
  }
}

export function sellerInviteLimitForProperty(property: Property) {
  return property.status.toLowerCase().includes("verified") ||
    property.status.toLowerCase().includes("approved")
    ? VERIFIED_SELLER_INVITE_LIMIT_PER_DAY
    : UNVERIFIED_SELLER_INVITE_LIMIT_PER_DAY;
}
