import "server-only";

import type { Prisma } from "@liber/db";
import { purchaseTypeSchema, seekingPropertyTypeSchema } from "@liber/validators";
import { resolveAvatarVariant } from "../../lib/avatar-variant";
import type { OwnerBadgeDTO, OwnerBuyerProfileDTO, SellerBuyerCriteriaDTO } from "../../lib/buyer-dtos";
import type { SellerPropertyDTO } from "../../lib/marketplace-dtos";
import { propertySubtypeLabel } from "../../lib/property-types";
import type { SessionUser } from "../authz";
import { buyerLocationFromSelectedServiceArea } from "../canonical-buyer-location";
import { publicNameForDisplay } from "../public-identity";
import { dateKey, expiresInDays, toNumber } from "./shared";

// Owner and admin projections of a buyer profile. Seller-facing projections live in ../buyer/read-models.
type Badge = OwnerBadgeDTO;
type Buyer = OwnerBuyerProfileDTO;
type BuyerCriteriaDetail = SellerBuyerCriteriaDTO;
type Property = SellerPropertyDTO;

function visibilityFromDb(value: string): Buyer["visibility"] {
  if (value === "ACTIVE") return "active";
  if (value === "DRAFT") return "draft";
  return "hidden";
}

function displayPurchaseType(value?: string | null) {
  const trimmed = value?.trim();
  if (!trimmed) return "";
  const parsed = purchaseTypeSchema.safeParse(trimmed);
  if (parsed.success) return parsed.data;
  if (trimmed === "Cash Buyer") return "Cash";
  return "";
}

function displaySeekingPropertyType(value?: string | null) {
  const trimmed = value?.trim();
  if (!trimmed) return "";
  const parsed = seekingPropertyTypeSchema.safeParse(trimmed);
  if (parsed.success) return parsed.data;
  if (/home|residential|owner occupy|primary residence|downsizing|fix and flip/i.test(trimmed)) return "House";
  return "";
}

export function badgeFromDb(badge: {
  badgeType: Badge["type"];
  expiresAt: Date | null;
  id: string;
  status: string;
}): Badge {
  const isExpired = badge.expiresAt !== null && badge.expiresAt.getTime() < Date.now();

  return {
    id: badge.id,
    type: badge.badgeType,
    label: badgeLabel(badge.badgeType),
    status: isExpired ? "expired" : badge.status === "ACTIVE" ? "active" : badge.status === "PENDING" ? "pending" : "expired",
    expiresInDays: expiresInDays(badge.expiresAt),
  };
}

export function badgeLabel(type: Badge["type"]) {
  const labels: Record<string, string> = {
    PRE_APPROVED: "Admin-verified pre-approval",
    VERIFIED_IDENTITY: "Verified identity",
    VERIFIED_FUNDS: "Verified funds",
    CASH_BUYER: "Cash buyer",
  };
  return labels[type] ?? "Unsupported legacy badge";
}

function criteriaLabels(criteria: Array<{
  bathroomsMin: number | null;
  bedroomsMin: number | null;
  condition: string | null;
  features: string[];
  lotSizeMin: number | null;
  propertySubtype: Property["propertyType"];
  squareFeetMin: number | null;
}>) {
  return criteria.flatMap((item) => [
    propertySubtypeLabel(item.propertySubtype),
    item.condition ?? undefined,
    item.squareFeetMin ? `${item.squareFeetMin}+ sqft` : undefined,
    item.lotSizeMin ? `${item.lotSizeMin}+ lot` : undefined,
    item.bedroomsMin ? `${item.bedroomsMin}+ bedrooms` : undefined,
    item.bathroomsMin ? `${item.bathroomsMin}+ bathrooms` : undefined,
    ...item.features,
  ]).filter((value): value is string => Boolean(value));
}

function criteriaDetails(criteria: Array<{
  bathroomsMin: number | null;
  bedroomsMin: number | null;
  condition?: string | null;
  features?: string[];
  id?: string;
  lotSizeMax: number | null;
  lotSizeMin: number | null;
  priceMax?: unknown;
  priceMin?: unknown;
  propertyCategory: BuyerCriteriaDetail["propertyCategory"];
  propertySubtype: Property["propertyType"];
  squareFeetMax: number | null;
  squareFeetMin: number | null;
  yearBuiltMin?: number | null;
}>): BuyerCriteriaDetail[] {
  return criteria.map((item) => ({
    bathroomsMin: item.bathroomsMin ?? undefined,
    bedroomsMin: item.bedroomsMin ?? undefined,
    condition: item.condition ?? undefined,
    features: item.features ?? [],
    id: item.id,
    lotSizeMax: item.lotSizeMax ?? undefined,
    lotSizeMin: item.lotSizeMin ?? undefined,
    priceMax: item.priceMax === null || item.priceMax === undefined ? undefined : Number(item.priceMax),
    priceMin: item.priceMin === null || item.priceMin === undefined ? undefined : Number(item.priceMin),
    propertyCategory: item.propertyCategory,
    propertySubtype: item.propertySubtype,
    squareFeetMax: item.squareFeetMax ?? undefined,
    squareFeetMin: item.squareFeetMin ?? undefined,
    yearBuiltMin: item.yearBuiltMin ?? undefined,
  }));
}

export function buyerFromDb(profile: {
  badges: Array<{
    badgeType: Badge["type"];
    expiresAt: Date | null;
    id: string;
    status: string;
  }>;
  bio: string | null;
  budgetMax: unknown;
  budgetMin: unknown;
  buyerType: string | null;
  buyingPurpose: string | null;
  criteria: Array<{
    bathroomsMin: number | null;
    bedroomsMin: number | null;
    condition: string | null;
    features: string[];
    id: string;
    lotSizeMax: number | null;
    lotSizeMin: number | null;
    priceMax: unknown;
    priceMin: unknown;
    propertyCategory: BuyerCriteriaDetail["propertyCategory"];
    propertySubtype: Property["propertyType"];
    squareFeetMax: number | null;
    squareFeetMin: number | null;
    yearBuiltMin: number | null;
  }>;
  desiredServiceAreas?: Array<{
    isPrimary: boolean;
    serviceArea: {
      active: boolean;
      centerLat: number;
      centerLng: number;
      city: string | null;
      id: string;
      label: string;
      market: { active: boolean; slug: string };
      postalCode: string | null;
      slug: string;
      state: string;
      type: string;
    };
    source: string;
  }>;
  displayName: string;
  downPaymentMax: unknown;
  downPaymentMin: unknown;
  id: string;
  lastRefreshedAt: Date | null;
  updatedAt: Date;
  user?: { avatarVariant: string | null; name?: string | null };
  userId: string;
  visibilityStatus: string;
}): Buyer {
  const criteria = criteriaLabels(profile.criteria);
  const primaryServiceArea = profile.desiredServiceAreas?.find(
    (area) => area.isPrimary && area.source === "SELECTED",
  )?.serviceArea;
  const canonicalLocation = buyerLocationFromSelectedServiceArea(primaryServiceArea);
  const badges = profile.badges.map(badgeFromDb);
  if (displayPurchaseType(profile.buyerType) === "Cash" && badges.some((badge) => badge.type === "VERIFIED_FUNDS" && badge.status === "active")) {
    badges.push({ id: "derived-cash-buyer", type: "CASH_BUYER", label: "Cash buyer", status: "active" });
  }

  return {
    id: profile.id,
    avatarVariant: resolveAvatarVariant(profile.user?.avatarVariant, profile.id).value,
    userId: profile.userId,
    name: publicNameForDisplay(profile.user?.name, profile.userId),
    location: canonicalLocation.location,
    city: canonicalLocation.city,
    neighborhood: canonicalLocation.neighborhood,
    postalCode: canonicalLocation.postalCode,
    state: canonicalLocation.state,
    type: displayPurchaseType(profile.buyerType),
    purpose: displaySeekingPropertyType(profile.buyingPurpose),
    visibility: visibilityFromDb(profile.visibilityStatus),
    budgetMin: toNumber(profile.budgetMin),
    budgetMax: toNumber(profile.budgetMax),
    downPaymentMin: toNumber(profile.downPaymentMin),
    downPaymentMax: toNumber(profile.downPaymentMax),
    bio: profile.bio || "",
    needs: criteria.slice(0, 5),
    wants: criteria.slice(5, 10),
    badges,
    criteria,
    criteriaDetails: criteriaDetails(profile.criteria),
    propertySubtypes: Array.from(new Set(profile.criteria.map((item) => item.propertySubtype))),
    refreshedAt: dateKey(profile.lastRefreshedAt ?? profile.updatedAt),
    primaryServiceArea: primaryServiceArea
      ? {
          active: canonicalLocation.active,
          center: { lat: primaryServiceArea.centerLat, lng: primaryServiceArea.centerLng },
          id: primaryServiceArea.id,
          marketSlug: primaryServiceArea.market.slug,
          slug: primaryServiceArea.slug,
        }
      : undefined,
    serviceAreaSlugs: (profile.desiredServiceAreas ?? [])
      .filter((area) => area.source === "SELECTED" && area.isPrimary)
      .map((area) => area.serviceArea.slug),
    lat: canonicalLocation.lat,
    lng: canonicalLocation.lng,
  };
}

export function emptyBuyerForUser(user: SessionUser, avatarVariant?: string | null): Buyer {
  return {
    id: "new-profile",
    avatarVariant: resolveAvatarVariant(avatarVariant, user.id).value,
    userId: user.id,
    name: publicNameForDisplay(user.name, user.id),
    location: "",
    city: "",
    neighborhood: undefined,
    postalCode: undefined,
    state: "",
    type: "Buyer",
    purpose: "",
    visibility: "draft",
    budgetMin: 0,
    budgetMax: 0,
    downPaymentMin: 0,
    downPaymentMax: 0,
    bio: "",
    needs: [],
    wants: [],
    badges: [],
    criteria: [],
    criteriaDetails: [],
    propertySubtypes: [],
    refreshedAt: "",
    serviceAreaSlugs: [],
    lat: 0,
    lng: 0,
  };
}

export function privateAccountName(user: { name: string | null } | null) {
  return user?.name?.trim() || "buyer";
}

export function withPrivateAccountName(buyer: Buyer, accountName: string) {
  return {
    ...buyer,
    accountName,
  };
}

export const buyerInclude = {
  badges: { where: { badgeType: { in: ["PRE_APPROVED", "VERIFIED_IDENTITY", "VERIFIED_FUNDS"] } } },
  criteria: true,
  desiredServiceAreas: {
    select: {
      isPrimary: true,
      source: true,
      serviceArea: {
        select: {
          centerLat: true,
          centerLng: true,
          active: true,
          city: true,
          id: true,
          label: true,
          market: { select: { active: true, slug: true } },
          postalCode: true,
          slug: true,
          state: true,
          type: true,
        },
      },
    },
  },
  user: { select: { avatarVariant: true, name: true } },
} satisfies Prisma.BuyerProfileInclude;
