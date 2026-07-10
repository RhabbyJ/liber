import type { Prisma } from "@liber/db";
import {
  purchaseTypeSchema,
  seekingPropertyTypeSchema,
} from "@liber/validators";
import type {
  PublicBuyerPreviewDto,
  SafeBadgeDto,
  SafeCriteriaDto,
  SellerBuyerProfileDto,
  SellerBuyerSearchDto,
} from "../lib/buyer-dto-types";
import type { Badge } from "../lib/mock-data";
import { buyerAliasForDisplay } from "../lib/buyer-alias";
import { avatarVariantFromSeed, normalizeAvatarVariant } from "../lib/avatar-variant";
import { propertySubtypeLabel, type PropertySubtype } from "../lib/property-types";
import { activePrimaryServiceAreaWhere } from "./service-area-matching";

const activeBadgeWhere = (now: Date) => ({
  status: "ACTIVE" as const,
  createdAt: { lte: now },
  updatedAt: { lte: now },
  OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
});

const approvedPreviewPurchaseTypes = ["Cash", "Conventional financing", "Other"] as const;
const approvedPreviewPropertyTypes = ["House", "Condo", "Townhouse", "Manufactured", "Land"] as const;
const approvedCriteriaConditions = new Set(["Move-in ready", "Mild fixer", "Fixer"]);
const approvedCriteriaFeatures = new Set(["Pool", "Parking", "ADU", "Yard", "Garage"]);

const badgeLabels: Record<Badge["type"], string> = {
  PRE_APPROVED: "Admin-verified pre-approval",
  EARNEST_MONEY_DEPOSITED: "Earnest money review",
  CASH_BUYER: "Cash buyer",
  NON_CONTINGENT: "Non-contingent",
  VERIFIED_IDENTITY: "Verified identity",
  VERIFIED_FUNDS: "Verified funds",
  COMPLETED_TRANSACTION: "Completed transaction",
};

const publicBadgeLabels: Record<Badge["type"], string> = {
  PRE_APPROVED: "Pre-approved",
  EARNEST_MONEY_DEPOSITED: "Earnest reviewed",
  CASH_BUYER: "Cash buyer",
  NON_CONTINGENT: "Non-contingent",
  VERIFIED_IDENTITY: "ID verified",
  VERIFIED_FUNDS: "Verified funds",
  COMPLETED_TRANSACTION: "Past transaction",
};

export function publicPreviewBuyerWhere(
  marketSlug: string,
  serviceAreaIds?: string[],
): Prisma.BuyerProfileWhereInput {
  return {
    visibilityStatus: "ACTIVE",
    user: { is: { status: "ACTIVE" } },
    buyerType: { in: [...approvedPreviewPurchaseTypes] },
    buyingPurpose: { in: [...approvedPreviewPropertyTypes] },
    criteria: { isNot: null },
    ...activePrimaryServiceAreaWhere(marketSlug, serviceAreaIds),
  };
}

export function sellerVisibleBuyerWhere(
  marketSlug?: string,
  serviceAreaIds?: string[],
): Prisma.BuyerProfileWhereInput {
  return {
    visibilityStatus: "ACTIVE",
    user: { is: { status: "ACTIVE" } },
    ...activePrimaryServiceAreaWhere(marketSlug, serviceAreaIds),
  };
}

export function publicPreviewBuyerSelect(now: Date) {
  return {
    badges: {
      where: activeBadgeWhere(now),
      select: { badgeType: true },
    },
    budgetMax: true,
    budgetMin: true,
    buyerType: true,
    buyingPurpose: true,
    criteria: {
      select: {
        bathroomsMin: true,
        bedroomsMin: true,
        condition: true,
        features: true,
        squareFeetMin: true,
      },
    },
    desiredServiceAreas: {
      where: { isPrimary: true, source: "SELECTED" },
      take: 1,
      select: {
        serviceArea: {
          select: {
            active: true,
            centerLat: true,
            centerLng: true,
            city: true,
            label: true,
            market: { select: { active: true } },
            state: true,
            type: true,
          },
        },
      },
    },
    user: { select: { status: true } },
    visibilityStatus: true,
  } satisfies Prisma.BuyerProfileSelect;
}

const sellerCriteriaSelect = {
  bathroomsMin: true,
  bedroomsMin: true,
  condition: true,
  features: true,
  lotSizeMax: true,
  lotSizeMin: true,
  propertyCategory: true,
  propertySubtype: true,
  squareFeetMax: true,
  squareFeetMin: true,
  yearBuiltMin: true,
} as const;

const sellerServiceAreaSelect = {
  active: true,
  centerLat: true,
  centerLng: true,
  city: true,
  label: true,
  market: { select: { active: true } },
  state: true,
  type: true,
} as const;

const sellerProfileServiceAreaSelect = {
  active: true,
  city: true,
  label: true,
  market: { select: { active: true } },
  state: true,
  type: true,
} as const;

export function sellerSearchBuyerSelect(now: Date) {
  return {
    badges: {
      where: activeBadgeWhere(now),
      select: { badgeType: true, expiresAt: true },
    },
    budgetMax: true,
    budgetMin: true,
    buyerType: true,
    buyingPurpose: true,
    criteria: { select: sellerCriteriaSelect },
    desiredServiceAreas: {
      where: { isPrimary: true, source: "SELECTED" },
      take: 1,
      select: { serviceArea: { select: sellerServiceAreaSelect } },
    },
    displayName: true,
    downPaymentMax: true,
    downPaymentMin: true,
    id: true,
    lastRefreshedAt: true,
    updatedAt: true,
    user: { select: { avatarVariant: true, status: true } },
    userId: true,
    visibilityStatus: true,
  } satisfies Prisma.BuyerProfileSelect;
}

export function sellerProfileBuyerSelect(now: Date) {
  return {
    badges: {
      where: activeBadgeWhere(now),
      select: { badgeType: true, expiresAt: true },
    },
    budgetMax: true,
    budgetMin: true,
    buyerType: true,
    buyingPurpose: true,
    criteria: { select: sellerCriteriaSelect },
    desiredServiceAreas: {
      where: { isPrimary: true, source: "SELECTED" },
      take: 1,
      select: { serviceArea: { select: sellerProfileServiceAreaSelect } },
    },
    displayName: true,
    downPaymentMax: true,
    downPaymentMin: true,
    id: true,
    user: { select: { avatarVariant: true, status: true } },
    userId: true,
    visibilityStatus: true,
  } satisfies Prisma.BuyerProfileSelect;
}

export type PublicPreviewBuyerRow = Prisma.BuyerProfileGetPayload<{
  select: ReturnType<typeof publicPreviewBuyerSelect>;
}>;

export type SellerSearchBuyerRow = Prisma.BuyerProfileGetPayload<{
  select: ReturnType<typeof sellerSearchBuyerSelect>;
}>;

export type SellerProfileBuyerRow = Prisma.BuyerProfileGetPayload<{
  select: ReturnType<typeof sellerProfileBuyerSelect>;
}>;

export function toPublicBuyerPreviewDto(
  profile: PublicPreviewBuyerRow,
  index: number,
  selectedAreaCenter?: { lat: number; lng: number } | null,
): PublicBuyerPreviewDto | null {
  const primaryArea = activeSelectedArea(profile);
  const purchaseType = purchaseTypeSchema.safeParse(profile.buyerType);
  const propertyType = seekingPropertyTypeSchema.safeParse(profile.buyingPurpose);
  if (!isActiveCandidate(profile) || !primaryArea || !purchaseType.success || !propertyType.success) {
    return null;
  }

  const criteria = safeCriteria(profile.criteria);
  if (criteria.length === 0) return null;
  const firstCriteria = criteria[0];
  const amenitySet = new Set(criteria.flatMap((item) => item.features ?? []));
  const pin = approximatePublicPin(
    selectedAreaCenter ?? { lat: primaryArea.centerLat, lng: primaryArea.centerLng },
    index,
  );

  return {
    amenities: [...approvedCriteriaFeatures].filter((amenity) => amenitySet.has(amenity)),
    area: areaLabel(primaryArea),
    badges: profile.badges.map((badge) => publicBadgeLabels[badge.badgeType]).slice(0, 3),
    bathroomsMin: firstCriteria?.bathroomsMin,
    bedroomsMin: firstCriteria?.bedroomsMin,
    budgetLabel: budgetBandLabel(toNumber(profile.budgetMin), toNumber(profile.budgetMax)),
    condition: firstCriteria?.condition,
    label: propertyType.data,
    pin: pin ?? undefined,
    squareFeetMin: firstCriteria?.squareFeetMin,
  };
}

export function toSellerSearchBuyerDto(
  profile: SellerSearchBuyerRow,
  viewerUserId: string,
  now = new Date(),
): SellerBuyerSearchDto | null {
  const primaryArea = activeSelectedArea(profile);
  if (!isActiveCandidate(profile) || !primaryArea) return null;

  return {
    alias: buyerAliasForDisplay(profile.displayName, profile.userId),
    avatarVariant: approvedAvatarVariant(profile.user.avatarVariant, profile.userId),
    badges: safeBadges(profile.badges, now),
    budgetMax: toNumber(profile.budgetMax),
    budgetMin: toNumber(profile.budgetMin),
    buyerProfileId: profile.id,
    canInvite: profile.userId !== viewerUserId,
    criteria: safeCriteria(profile.criteria),
    downPaymentMax: toNumber(profile.downPaymentMax),
    downPaymentMin: toNumber(profile.downPaymentMin),
    location: areaLabel(primaryArea),
    mapPoint: {
      latitude: primaryArea.centerLat,
      longitude: primaryArea.centerLng,
    },
    propertyType: approvedPropertyType(profile.buyingPurpose),
    purchaseType: approvedPurchaseType(profile.buyerType),
    refreshedAt: dateKey(profile.lastRefreshedAt ?? profile.updatedAt),
  };
}

export function toSellerBuyerProfileDto(
  profile: SellerProfileBuyerRow,
  viewerUserId: string,
  viewerCanViewDirectory: boolean,
  now = new Date(),
): SellerBuyerProfileDto | null {
  const primaryArea = activeSelectedArea(profile);
  if (!isActiveCandidate(profile) || !primaryArea) return null;
  const criteria = safeCriteria(profile.criteria);
  const labels = criteriaLabels(criteria);
  const viewerIsOwner = profile.userId === viewerUserId;

  return {
    alias: buyerAliasForDisplay(profile.displayName, profile.userId),
    avatarVariant: approvedAvatarVariant(profile.user.avatarVariant, profile.userId),
    badges: safeBadges(profile.badges, now),
    budgetMax: toNumber(profile.budgetMax),
    budgetMin: toNumber(profile.budgetMin),
    buyerProfileId: profile.id,
    downPaymentMax: toNumber(profile.downPaymentMax),
    downPaymentMin: toNumber(profile.downPaymentMin),
    location: areaLabel(primaryArea),
    needs: labels.slice(0, 5),
    propertyType: approvedPropertyType(profile.buyingPurpose),
    purchaseType: approvedPurchaseType(profile.buyerType),
    viewerCanInvite: !viewerIsOwner && viewerCanViewDirectory,
    viewerIsOwner,
    wants: labels.slice(5, 10),
  };
}

function isActiveCandidate(profile: {
  desiredServiceAreas: Array<{ serviceArea: { active: boolean; market: { active: boolean } } }>;
  user: { status: string };
  visibilityStatus: string;
}) {
  return profile.visibilityStatus === "ACTIVE" &&
    profile.user.status === "ACTIVE" &&
    profile.desiredServiceAreas.length === 1 &&
    profile.desiredServiceAreas[0].serviceArea.active &&
    profile.desiredServiceAreas[0].serviceArea.market.active;
}

function activeSelectedArea<T extends {
  desiredServiceAreas: Array<{
    serviceArea: {
      active: boolean;
      market: { active: boolean };
    };
  }>;
}>(profile: T): T["desiredServiceAreas"][number]["serviceArea"] | null {
  const area = profile.desiredServiceAreas[0]?.serviceArea;
  return area?.active && area.market.active ? area : null;
}

type BuyerCriteriaProjection = {
  bathroomsMin: number | null;
  bedroomsMin: number | null;
  condition: string | null;
  features: string[];
  lotSizeMax?: number | null;
  lotSizeMin?: number | null;
  propertyCategory?: "HOME";
  propertySubtype?: PropertySubtype;
  squareFeetMax?: number | null;
  squareFeetMin: number | null;
  yearBuiltMin?: number | null;
};

function safeCriteria(criteria: BuyerCriteriaProjection | null): SafeCriteriaDto[] {
  if (!criteria) return [];
  return [{
    bathroomsMin: criteria.bathroomsMin ?? undefined,
    bedroomsMin: criteria.bedroomsMin ?? undefined,
    condition: criteria.condition && approvedCriteriaConditions.has(criteria.condition) ? criteria.condition : undefined,
    features: criteria.features.filter((feature) => approvedCriteriaFeatures.has(feature)),
    lotSizeMax: criteria.lotSizeMax ?? undefined,
    lotSizeMin: criteria.lotSizeMin ?? undefined,
    propertyCategory: criteria.propertyCategory ?? "HOME",
    propertySubtype: criteria.propertySubtype ?? "HOME",
    squareFeetMax: criteria.squareFeetMax ?? undefined,
    squareFeetMin: criteria.squareFeetMin ?? undefined,
    yearBuiltMin: criteria.yearBuiltMin ?? undefined,
  }];
}

function safeBadges(
  badges: Array<{ badgeType: Badge["type"]; expiresAt: Date | null }>,
  now: Date,
): SafeBadgeDto[] {
  return badges
    .filter((badge) => badge.expiresAt === null || badge.expiresAt.getTime() > now.getTime())
    .map((badge) => ({
      expiresInDays: badge.expiresAt
        ? Math.ceil((badge.expiresAt.getTime() - now.getTime()) / 86_400_000)
        : undefined,
      label: badgeLabels[badge.badgeType],
      status: "active",
      type: badge.badgeType,
    }));
}

function criteriaLabels(criteria: SafeCriteriaDto[]) {
  return criteria.flatMap((item) => [
    propertySubtypeLabel(item.propertySubtype),
    item.condition,
    item.squareFeetMin ? `${item.squareFeetMin}+ sqft` : undefined,
    item.lotSizeMin ? `${item.lotSizeMin}+ lot` : undefined,
    item.bedroomsMin ? `${item.bedroomsMin}+ bedrooms` : undefined,
    item.bathroomsMin ? `${item.bathroomsMin}+ bathrooms` : undefined,
    ...(item.features ?? []),
  ]).filter((value): value is string => Boolean(value));
}

function approvedPurchaseType(value?: string | null) {
  const parsed = purchaseTypeSchema.safeParse(value?.trim());
  return parsed.success ? parsed.data : "";
}

function approvedPropertyType(value?: string | null) {
  const parsed = seekingPropertyTypeSchema.safeParse(value?.trim());
  return parsed.success ? parsed.data : "";
}

function approvedAvatarVariant(value: string | null, seed: string) {
  return normalizeAvatarVariant(value) ?? avatarVariantFromSeed(seed);
}

function areaLabel(area: { city: string | null; label: string; state: string; type: string }) {
  return [area.type === "neighborhood" ? area.label : area.city ?? area.label, area.state]
    .filter(Boolean)
    .join(", ");
}

export function approximatePublicPin(center: { lat: number; lng: number } | null, index: number) {
  if (!center || !Number.isFinite(center.lat) || !Number.isFinite(center.lng)) return null;
  const baseLat = center.lat;
  const baseLng = center.lng;

  const angle = (index * 2 * Math.PI) / 6;
  return {
    latitude: baseLat + Math.sin(angle) * 0.006,
    longitude: baseLng + Math.cos(angle) * 0.008,
  };
}

function budgetBandLabel(min: number, max: number) {
  const bandedMin = roundToBand(min, "down");
  const bandedMax = roundToBand(max, "up");

  if (bandedMin && bandedMax) return `${shortMoney(bandedMin)}\u2013${shortMoney(bandedMax)}`;
  if (bandedMax) return `Up to ${shortMoney(bandedMax)}`;
  if (bandedMin) return `${shortMoney(bandedMin)}+`;
  return "Budget on profile";
}

function roundToBand(value: number, direction: "up" | "down") {
  if (!value || value <= 0) return 0;
  const band = 50_000;
  return direction === "up" ? Math.ceil(value / band) * band : Math.floor(value / band) * band;
}

function shortMoney(value: number) {
  if (value >= 1_000_000) {
    return `$${(value / 1_000_000).toFixed(1).replace(/\.0$/, "")}M`;
  }
  return `$${Math.round(value / 1000)}K`;
}

function toNumber(value: unknown) {
  return value === null || value === undefined ? 0 : Number(value);
}

function dateKey(value?: Date | string | null) {
  if (!value) return "";
  return new Date(value).toISOString().slice(0, 10);
}
