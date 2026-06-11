import { prisma } from "@liber/db";
import { findPilotArea } from "../lib/launch-market";

// Short, display-safe badge labels for the compact public preview UI.
const previewBadgeLabels: Record<string, string> = {
  PRE_APPROVED: "Pre-approved",
  EARNEST_MONEY_DEPOSITED: "Earnest reviewed",
  CASH_BUYER: "Cash buyer",
  NON_CONTINGENT: "Non-contingent",
  VERIFIED_IDENTITY: "ID verified",
  VERIFIED_FUNDS: "Verified funds",
  COMPLETED_TRANSACTION: "Past transaction",
};

export const PUBLIC_PREVIEW_LIMIT = 6;

const previewAmenities = ["Pool", "Parking", "ADU", "Yard", "Garage"];

/**
 * Privacy-safe public teaser of buyer demand (V1 public preview rules).
 * No ids, names, avatars, documents, exact locations, or profile links.
 * Coordinates are approximate only: pilot-area centers (or coarse-rounded
 * desired-area coordinates) with a deterministic display offset.
 */
export type PublicBuyerPreview = {
  amenities: string[];
  area: string;
  badges: string[];
  bathroomsMin?: number;
  bedroomsMin?: number;
  budgetLabel: string;
  condition?: string;
  label: string;
  lat?: number;
  lng?: number;
  squareFeetMin?: number;
};

export async function getPublicBuyerPreviews(): Promise<PublicBuyerPreview[]> {
  try {
    const profiles = await prisma.buyerProfile.findMany({
      where: { visibilityStatus: "ACTIVE" },
      orderBy: { lastRefreshedAt: "desc" },
      take: PUBLIC_PREVIEW_LIMIT,
      select: {
        badges: {
          where: {
            status: "ACTIVE",
            OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
          },
          select: { badgeType: true },
        },
        budgetMax: true,
        budgetMin: true,
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
        desiredCity: true,
        desiredLat: true,
        desiredLng: true,
        desiredState: true,
      },
    });

    return profiles.map((profile, index) => {
      const criteria = profile.criteria[0];
      const amenitySet = new Set(
        profile.criteria.flatMap((item) => item.features).map((feature) => feature.trim().toLowerCase()),
      );
      const point = approximatePreviewPoint(
        profile.desiredCity,
        toNumber(profile.desiredLat),
        toNumber(profile.desiredLng),
        index,
      );

      return {
        amenities: previewAmenities.filter((amenity) => amenitySet.has(amenity.toLowerCase())),
        area: [profile.desiredCity, profile.desiredState].filter(Boolean).join(", ") || "San Fernando Valley pilot",
        badges: profile.badges
          .map((badge) => previewBadgeLabels[badge.badgeType] ?? "Verified")
          .slice(0, 3),
        bathroomsMin: criteria?.bathroomsMin ?? undefined,
        bedroomsMin: criteria?.bedroomsMin ?? undefined,
        budgetLabel: budgetBandLabel(toNumber(profile.budgetMin), toNumber(profile.budgetMax)),
        condition: criteria?.condition ?? undefined,
        label: profile.buyerType?.trim() || "Buyer",
        lat: point?.lat,
        lng: point?.lng,
        squareFeetMin: criteria?.squareFeetMin ?? undefined,
      };
    });
  } catch {
    // The public preview is best-effort marketing; never block the homepage on it.
    return [];
  }
}

function toNumber(value: unknown) {
  if (value === null || value === undefined) return 0;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

/**
 * Public pins must never reveal a precise buyer location: snap to the pilot
 * area center when possible, otherwise round to ~1 km, then spread stacked
 * pins with a small deterministic offset so they stay readable.
 */
function approximatePreviewPoint(city: string | null, lat: number, lng: number, index: number) {
  const area = city ? findPilotArea(city) : null;
  const baseLat = area ? area.lat : lat ? Number(lat.toFixed(2)) : 0;
  const baseLng = area ? area.lng : lng ? Number(lng.toFixed(2)) : 0;
  if (!baseLat || !baseLng) return null;

  const angle = (index * 2 * Math.PI) / PUBLIC_PREVIEW_LIMIT;
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
