import { Prisma, prisma } from "@liber/db";
import { seekingPropertyTypeSchema } from "@liber/validators";
import { resolveAvatarVariant } from "../lib/avatar-variant";
import { buyerAliasForDisplay } from "../lib/buyer-alias";
import type { ServiceAreaResult } from "./service-areas";
import { getSearchCoverageServiceAreaIds } from "./service-areas";
import { activePrimaryServiceAreaWhere } from "./service-area-matching";

// Short, display-safe badge labels for the compact public preview UI.
const previewBadgeLabels: Record<string, string> = {
  PRE_APPROVED: "Pre-approved",
  VERIFIED_IDENTITY: "ID verified",
  VERIFIED_FUNDS: "Verified funds",
};

export const PUBLIC_PREVIEW_LIMIT = 4;

const previewAmenities = ["Pool", "Parking", "ADU", "Yard", "Garage"];

/**
 * Privacy-safe homepage preview of buyer demand (V1 preview rules).
 * Guests receive a capped teaser; a validated signed-in viewer receives the
 * same DTO for every eligible profile except their own.
 * No ids, private names, documents, exact locations, or profile links.
 * Generated aliases and allowlisted avatar variants are public-safe identity.
 * Coordinates are approximate only: service-area centers (or coarse-rounded
 * desired-area coordinates) with a deterministic display offset.
 */
export type PublicBuyerPreview = {
  alias: string;
  amenities: string[];
  area: string;
  avatarVariant: string;
  badges: string[];
  bathroomsMin?: number;
  bedroomsMin?: number;
  budgetLabel: string;
  condition?: string;
  label: string;
  pin?: { latitude: number; longitude: number };
  squareFeetMin?: number;
};

export async function getPublicBuyerPreviews(
  marketSlug: string,
  serviceArea?: ServiceAreaResult | null,
  viewerUserId?: string,
): Promise<PublicBuyerPreview[]> {
  try {
    const coverageAreaIds = serviceArea
      ? await getSearchCoverageServiceAreaIds(serviceArea.id, marketSlug)
      : [];
    const profiles = await prisma.buyerProfile.findMany({
      where: {
        visibilityStatus: "ACTIVE",
        user: { status: "ACTIVE" },
        ...(viewerUserId ? { userId: { not: viewerUserId } } : {}),
        ...activePrimaryServiceAreaWhere(marketSlug, serviceArea ? coverageAreaIds : undefined),
      },
      orderBy: { lastRefreshedAt: "desc" },
      ...(viewerUserId ? {} : { take: PUBLIC_PREVIEW_LIMIT }),
      select: {
        id: true,
        displayName: true,
        badges: {
          where: {
            badgeType: { in: ["PRE_APPROVED", "VERIFIED_IDENTITY", "VERIFIED_FUNDS"] },
            status: "ACTIVE",
            OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
          },
          select: { badgeType: true },
        },
        budgetMax: true,
        budgetMin: true,
        buyingPurpose: true,
        buyerType: true,
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
                centerLat: true,
                centerLng: true,
                city: true,
                label: true,
                state: true,
                type: true,
              },
            },
          },
        },
        user: { select: { avatarVariant: true } },
      },
    });

    return profiles.map((profile, index) => {
      const criteria = profile.criteria[0];
      const amenitySet = new Set(
        profile.criteria.flatMap((item) => item.features).map((feature) => feature.trim().toLowerCase()),
      );
      const primaryArea = profile.desiredServiceAreas[0]?.serviceArea;
      const point = approximatePreviewPoint(
        serviceArea?.center ?? (primaryArea ? { lat: primaryArea.centerLat, lng: primaryArea.centerLng } : null),
        index,
        profiles.length,
      );
      const areaLabel = primaryArea
        ? [primaryArea.type === "neighborhood" ? primaryArea.label : primaryArea.city ?? primaryArea.label, primaryArea.state]
            .filter(Boolean)
            .join(", ")
        : "Liber service area";
      const alias = buyerAliasForDisplay(profile.displayName, profile.id);

      return {
        alias,
        amenities: previewAmenities.filter((amenity) => amenitySet.has(amenity.toLowerCase())),
        area: areaLabel,
        avatarVariant: resolveAvatarVariant(profile.user.avatarVariant, alias).value,
        badges: [
          ...profile.badges.map((badge) => previewBadgeLabels[badge.badgeType] ?? "Verified"),
          ...(profile.buyerType === "Cash" && profile.badges.some((badge) => badge.badgeType === "VERIFIED_FUNDS")
            ? ["Cash buyer"]
            : []),
        ].slice(0, 3),
        bathroomsMin: criteria?.bathroomsMin ?? undefined,
        bedroomsMin: criteria?.bedroomsMin ?? undefined,
        budgetLabel: budgetBandLabel(toNumber(profile.budgetMin), toNumber(profile.budgetMax)),
        condition: criteria?.condition ?? undefined,
        label: previewPropertyTypeLabel(profile.buyingPurpose),
        pin: point ? { latitude: point.lat, longitude: point.lng } : undefined,
        squareFeetMin: criteria?.squareFeetMin ?? undefined,
      };
    });
  } catch (error) {
    // The public preview is best-effort marketing; never block the homepage on it.
    console.error("[public-preview] buyer preview query failed", error instanceof Error ? error.message : "Unknown error");
    return [];
  }
}

export async function hasControlledDemoBuyerPreviews() {
  try {
    return await prisma.adminAuditLog.count({
      where: { action: "seed_demo_buyer", targetType: "buyer_profile" },
    }) > 0;
  } catch (error) {
    console.error("[public-preview] demo marker query failed", error instanceof Error ? error.message : "Unknown error");
    return false;
  }
}

function previewPropertyTypeLabel(value?: string | null) {
  const trimmed = value?.trim();
  if (!trimmed) return "Buyer";
  const parsed = seekingPropertyTypeSchema.safeParse(trimmed);
  if (parsed.success) return parsed.data;
  if (/home|residential|owner occupy|primary residence|downsizing|fix and flip/i.test(trimmed)) return "House";
  return "Buyer";
}

export function serviceAreaPreviewWhere(
  serviceAreaIds: string[],
  marketSlug: string,
): Prisma.BuyerProfileWhereInput {
  return activePrimaryServiceAreaWhere(marketSlug, serviceAreaIds);
}

function toNumber(value: unknown) {
  if (value === null || value === undefined) return 0;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

/**
 * Public pins must never reveal a precise buyer location: snap to the service
 * area center when possible, otherwise round to ~1 km, then spread stacked
 * pins with a small deterministic offset so they stay readable.
 */
export function approximatePreviewPoint(
  center: { lat: number; lng: number } | null,
  index: number,
  total = PUBLIC_PREVIEW_LIMIT,
) {
  const baseLat = center?.lat ?? 0;
  const baseLng = center?.lng ?? 0;
  if (!baseLat || !baseLng) return null;

  const angle = (index * 2 * Math.PI) / Math.max(total, 1);
  return {
    lat: baseLat + Math.sin(angle) * 0.006,
    lng: baseLng + Math.cos(angle) * 0.008,
  };
}

// Budgets are shown as coarse $50K bands, never exact figures.
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
