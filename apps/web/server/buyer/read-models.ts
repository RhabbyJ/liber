import { createHash } from "node:crypto";
import type { Prisma } from "@liber/db";
import type {
  SellerBadgeDTO,
  SellerBuyerCriteriaDTO,
  SellerBuyerDetailDTO,
  SellerBuyerSummaryDTO,
} from "../../lib/buyer-dtos";
import { buyerAliasForDisplay } from "../../lib/buyer-alias";
import { resolveAvatarVariant } from "../../lib/avatar-variant";
import { propertySubtypeLabel } from "../../lib/property-types";

const SELLER_BADGE_TYPES = ["PRE_APPROVED", "VERIFIED_IDENTITY", "VERIFIED_FUNDS"] as const;

export function sellerBuyerSelect(now = new Date()) {
  return {
  id: true,
  userId: true,
  displayName: true,
  buyerType: true,
  bio: true,
  buyingPurpose: true,
  budgetMin: true,
  budgetMax: true,
  downPaymentMin: true,
  downPaymentMax: true,
  lastRefreshedAt: true,
  updatedAt: true,
  user: { select: { avatarVariant: true } },
  criteria: {
    take: 1,
    select: {
      bathroomsMin: true,
      bedroomsMin: true,
      condition: true,
      features: true,
      lotSizeMax: true,
      lotSizeMin: true,
      priceMax: true,
      priceMin: true,
      propertyCategory: true,
      propertySubtype: true,
      squareFeetMax: true,
      squareFeetMin: true,
      yearBuiltMin: true,
    },
  },
  badges: {
    where: {
      badgeType: { in: [...SELLER_BADGE_TYPES] },
      status: "ACTIVE",
      OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
    },
    select: { badgeType: true, expiresAt: true },
  },
  desiredServiceAreas: {
    where: { isPrimary: true, source: "SELECTED" },
    take: 1,
    select: {
      serviceArea: {
        select: {
          centerLat: true,
          centerLng: true,
          city: true,
          label: true,
          market: { select: { slug: true } },
          postalCode: true,
          slug: true,
          state: true,
          type: true,
        },
      },
    },
  },
  } satisfies Prisma.BuyerProfileSelect;
}

export type SellerBuyerRow = Prisma.BuyerProfileGetPayload<{ select: ReturnType<typeof sellerBuyerSelect> }>;

function money(value: unknown) {
  return value === null || value === undefined ? 0 : Number(value);
}

function displayPurchaseType(value: string | null) {
  return value === "Cash" || value === "Conventional financing" || value === "Other" ? value : "";
}

function displayPropertyType(value: string | null) {
  return value === "House" || value === "Condo" || value === "Townhouse" || value === "Manufactured" || value === "Land"
    ? value
    : "";
}

function criteriaDTO(row: SellerBuyerRow["criteria"][number]): SellerBuyerCriteriaDTO {
  return {
    bathroomsMin: row.bathroomsMin ?? undefined,
    bedroomsMin: row.bedroomsMin ?? undefined,
    condition: row.condition ?? undefined,
    features: row.features,
    lotSizeMax: row.lotSizeMax ?? undefined,
    lotSizeMin: row.lotSizeMin ?? undefined,
    priceMax: row.priceMax === null ? undefined : Number(row.priceMax),
    priceMin: row.priceMin === null ? undefined : Number(row.priceMin),
    propertyCategory: row.propertyCategory,
    propertySubtype: row.propertySubtype,
    squareFeetMax: row.squareFeetMax ?? undefined,
    squareFeetMin: row.squareFeetMin ?? undefined,
    yearBuiltMin: row.yearBuiltMin ?? undefined,
  };
}

function criteriaLabels(criteria: SellerBuyerCriteriaDTO[]) {
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

function badgeLabel(type: string) {
  if (type === "PRE_APPROVED") return "Admin-verified pre-approval";
  if (type === "VERIFIED_IDENTITY") return "Verified identity";
  return "Verified funds";
}

function sellerBadges(row: SellerBuyerRow): SellerBadgeDTO[] {
  const badges: SellerBadgeDTO[] = row.badges.map((badge) => ({
    type: badge.badgeType as "PRE_APPROVED" | "VERIFIED_IDENTITY" | "VERIFIED_FUNDS",
    label: badgeLabel(badge.badgeType),
    status: "active",
    expiresInDays: badge.expiresAt
      ? Math.ceil((badge.expiresAt.getTime() - Date.now()) / 86_400_000)
      : undefined,
  }));
  if (row.buyerType === "Cash" && badges.some((badge) => badge.type === "VERIFIED_FUNDS")) {
    badges.push({ type: "CASH_BUYER", label: "Cash buyer", status: "active" });
  }
  return badges;
}

function approximateSellerPoint(id: string, centerLat: number, centerLng: number) {
  const digest = createHash("sha256").update(`seller-map:${id}`).digest();
  const angle = (digest.readUInt16BE(0) / 65_535) * Math.PI * 2;
  const radius = 0.0025 + (digest.readUInt16BE(2) / 65_535) * 0.0025;
  return {
    lat: centerLat + Math.sin(angle) * radius,
    lng: centerLng + Math.cos(angle) * radius,
  };
}

export function sellerBuyerSummary(row: SellerBuyerRow, viewerUserId: string, isDemo = false): SellerBuyerSummaryDTO {
  const area = row.desiredServiceAreas[0]?.serviceArea;
  if (!area) throw new Error("Seller buyer projection requires an active selected service area.");
  const criteriaDetails = row.criteria.map(criteriaDTO);
  const criteria = criteriaLabels(criteriaDetails);
  const point = approximateSellerPoint(row.id, area.centerLat, area.centerLng);
  const city = area.type === "neighborhood" ? area.label : area.city ?? area.label;
  const alias = buyerAliasForDisplay(row.displayName, row.id);
  return {
    id: row.id,
    isDemo,
    avatarSeed: alias,
    avatarVariant: resolveAvatarVariant(row.user.avatarVariant, row.id).value,
    name: alias,
    location: area.type === "zip" && area.postalCode
      ? `${city}, ${area.state} ${area.postalCode}`
      : `${area.label}, ${area.state}`,
    city,
    neighborhood: area.type === "neighborhood" ? area.label : undefined,
    postalCode: area.postalCode ?? undefined,
    state: area.state,
    type: displayPurchaseType(row.buyerType),
    purpose: displayPropertyType(row.buyingPurpose),
    visibility: "active",
    budgetMin: money(row.budgetMin),
    budgetMax: money(row.budgetMax),
    downPaymentMin: money(row.downPaymentMin),
    downPaymentMax: money(row.downPaymentMax),
    bio: row.bio ?? "",
    needs: criteria.slice(0, 5),
    wants: criteria.slice(5, 10),
    badges: sellerBadges(row),
    criteria,
    criteriaDetails,
    propertySubtypes: [...new Set(criteriaDetails.map((item) => item.propertySubtype))],
    refreshedAt: (row.lastRefreshedAt ?? row.updatedAt).toISOString().slice(0, 10),
    marketSlug: area.market.slug,
    serviceAreaSlug: area.slug,
    lat: point.lat,
    lng: point.lng,
    canInvite: row.userId !== viewerUserId,
  };
}

export function sellerBuyerDetail(row: SellerBuyerRow, viewerUserId: string, isDemo = false): SellerBuyerDetailDTO {
  return sellerBuyerSummary(row, viewerUserId, isDemo);
}
