import { Prisma, prisma } from "@liber/db";
import { searchBuyersSchema, seekingPropertyTypeSchema, type SearchBuyersInput } from "@liber/validators";
import { resolveAvatarVariant } from "../lib/avatar-variant";
import { publicNameForDisplay } from "./public-identity";
import type { PublicBuyerPreviewDTO } from "../lib/buyer-dtos";
import { activePrimaryServiceAreaWhere } from "./service-area-matching";
import { querySellerSearchIds, SellerSearchCursorError } from "./seller-search-query";
import { syntheticJourneyBuyerProfileIds } from "./synthetic-property-review";
import { activeTestPreapprovalProfileIds } from "./test-preapproval";
import { TEST_PREAPPROVAL_LABEL } from "../lib/test-preapproval";

// Short, display-safe badge labels for the compact public preview UI.
const previewBadgeLabels: Record<string, string> = {
  PRE_APPROVED: "Pre-approved",
  VERIFIED_IDENTITY: "ID verified",
  VERIFIED_FUNDS: "Verified funds",
};

export const PUBLIC_PREVIEW_LIMIT = 4;

const previewAmenities = ["Pool", "Parking", "ADU", "Yard", "Garage"];

// The narrow projection every preview is built from; nothing else leaves the database.
// A function so badge expiry is checked against the time of each query.
const previewProfileSelect = (now = new Date()) => ({
  id: true,
  userId: true,
  displayName: true,
  badges: {
    where: {
      badgeType: { in: ["PRE_APPROVED", "VERIFIED_IDENTITY", "VERIFIED_FUNDS"] },
      status: "ACTIVE",
      OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
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
  user: { select: { avatarVariant: true, name: true } },
}) satisfies Prisma.BuyerProfileSelect;

type PreviewProfileRow = Prisma.BuyerProfileGetPayload<{ select: ReturnType<typeof previewProfileSelect> }>;

export type DemandPreviewPage = {
  /** More previews match than were returned; for guests this is where the teaser stops. */
  hasMore: boolean;
  items: PublicBuyerPreviewDTO[];
  nextCursor: string | null;
};

/**
 * Privacy-safe buyer demand for everyone who is not an approved seller (V1 preview rules).
 * Filters, sort, block exclusions and cursors are the approved seller search's own SQL
 * (`querySellerSearchIds`), so the one map behaves the same for every viewer; only the
 * projection differs. Guests receive a capped teaser and no cursor; a validated signed-in
 * viewer pages through every eligible profile except their own.
 * No ids, full private names, documents, exact locations, or profile links.
 * Identity includes only first name, last initial, and a stable account code.
 * Coordinates use the buyer's selected public service-area center only.
 */
export async function searchDemandPreviews(input: SearchBuyersInput, viewerUserId?: string): Promise<DemandPreviewPage> {
  const filters: SearchBuyersInput = viewerUserId
    ? input
    : { ...input, cursor: undefined, pageSize: PUBLIC_PREVIEW_LIMIT };
  try {
    const page = await querySellerSearchIds(prisma, filters, new Date(), undefined, viewerUserId);
    if (page.ids.length === 0) return { hasMore: false, items: [], nextCursor: null };
    const rows = await prisma.buyerProfile.findMany({
      where: {
        id: { in: page.ids },
        visibilityStatus: "ACTIVE",
        user: { status: "ACTIVE" },
        ...(viewerUserId ? { userId: { not: viewerUserId } } : {}),
        ...activePrimaryServiceAreaWhere(filters.market),
      },
      select: previewProfileSelect(),
    });
    const order = new Map(page.ids.map((id, index) => [id, index]));
    rows.sort((first, second) => (order.get(first.id) ?? 0) - (order.get(second.id) ?? 0));
    return {
      hasMore: page.hasMore,
      items: await toPublicPreviews(rows),
      nextCursor: viewerUserId ? page.nextCursor : null,
    };
  } catch (error) {
    if (error instanceof SellerSearchCursorError) throw error;
    // The preview is best-effort; never block the map on it.
    console.error("[public-preview] buyer preview query failed", error instanceof Error ? error.message : "Unknown error");
    return { hasMore: false, items: [], nextCursor: null };
  }
}

async function toPublicPreviews(profiles: PreviewProfileRow[]): Promise<PublicBuyerPreviewDTO[]> {
  const syntheticProfiles = await syntheticJourneyBuyerProfileIds(prisma, profiles.map((profile) => profile.id));
  const testPreapprovalIds = await activeTestPreapprovalProfileIds(prisma, profiles.map((profile) => profile.id));
  return profiles.map((profile) => {
    const criteria = profile.criteria[0];
    const condition = searchBuyersSchema.shape.condition.safeParse(criteria?.condition);
    const amenitySet = new Set(
      profile.criteria.flatMap((item) => item.features).map((feature) => feature.trim().toLowerCase()),
    );
    const primaryArea = profile.desiredServiceAreas[0]?.serviceArea;
    const point = approximatePreviewPoint(
      primaryArea ? { lat: primaryArea.centerLat, lng: primaryArea.centerLng } : null,
    );
    const areaLabel = primaryArea
      ? [primaryArea.type === "zip" || primaryArea.type === "neighborhood" ? primaryArea.label : primaryArea.city ?? primaryArea.label, primaryArea.state]
          .filter(Boolean)
          .join(", ")
      : "Liber service area";
    const alias = publicNameForDisplay(profile.user.name, profile.userId);

    return {
      alias,
      amenities: previewAmenities.filter((amenity) => amenitySet.has(amenity.toLowerCase())),
      area: areaLabel,
      avatarVariant: resolveAvatarVariant(profile.user.avatarVariant, profile.id).value,
      badges: [
        ...(syntheticProfiles.has(profile.id) ? ["Demo buyer"] : []),
        ...(testPreapprovalIds.has(profile.id) ? [TEST_PREAPPROVAL_LABEL] : []),
        ...profile.badges.map((badge) => previewBadgeLabels[badge.badgeType] ?? "Verified"),
        ...(profile.buyerType === "Cash" && profile.badges.some((badge) => badge.badgeType === "VERIFIED_FUNDS")
          ? ["Cash buyer"]
          : []),
      ].slice(0, 3),
      bathroomsMin: criteria?.bathroomsMin ?? undefined,
      bedroomsMin: criteria?.bedroomsMin ?? undefined,
      budgetLabel: budgetBandLabel(toNumber(profile.budgetMin), toNumber(profile.budgetMax)),
      condition: condition.success ? condition.data : undefined,
      label: previewPropertyTypeLabel(profile.buyingPurpose),
      pin: point ? { latitude: point.lat, longitude: point.lng } : undefined,
      squareFeetMin: criteria?.squareFeetMin ?? undefined,
    };
  });
}

export async function hasControlledDemoBuyerPreviews() {
  try {
    return await prisma.adminAuditLog.count({
      where: { action: "seed_demo_buyer", targetType: "buyer_profile" },
    }) > 0 || (await syntheticJourneyBuyerProfileIds(prisma)).size > 0;
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
 * A selected service-area center is public geography, not a private address.
 * Keep it unchanged across searches; overlapping buyers are grouped by the UI.
 */
export function approximatePreviewPoint(
  center: { lat: number; lng: number } | null,
) {
  if (!center || !Number.isFinite(center.lat) || !Number.isFinite(center.lng)) return null;
  return { lat: center.lat, lng: center.lng };
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
