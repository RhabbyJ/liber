"use server";

import { Prisma, prisma } from "@liber/db";
import {
  buyerProfileModerationSchema,
  createSellerPropertySchema,
  grantBadgeSchema,
  purchaseTypeSchema,
  publishBuyerProfileSchema,
  respondToInviteSchema,
  reviewDocumentSchema,
  revokeBadgeSchema,
  searchBuyersSchema,
  seekingPropertyTypeSchema,
  sendInviteSchema,
  sellerAccessReviewSchema,
  updateSellerPropertySchema,
  userModerationSchema,
  type PublishBuyerProfileInput,
  type SearchBuyersInput,
} from "@liber/validators";
import {
  type Badge,
  type Buyer,
  type BuyerCriteriaDetail,
  type Invite,
  type Property,
} from "../lib/mock-data";
import { propertySubtypeLabel } from "../lib/property-types";
import {
  avatarVariantFromSeed,
  normalizeAvatarVariant,
  previousAvatarVariant,
  randomAvatarVariant,
} from "../lib/avatar-variant";
import {
  buyerAliasForDisplay,
  buyerAliasFromSeed,
  normalizeBuyerAlias,
  randomBuyerAlias,
} from "../lib/buyer-alias";
import { buyerLocationFromSelectedServiceArea } from "./canonical-buyer-location";
import {
  buyerCriteriaSnapshotData,
  buyerProfileSnapshotData,
} from "./buyer-profile-publication";
import { hasRole, type SessionUser } from "./authz";
import {
  canViewBuyerDirectory,
  canViewBuyerProfile,
  requireApprovedSellerAccess,
  sellerAccessStatusForUser,
} from "./access";
import { assertInviteAllowed } from "./domain";
import type { EmailResult } from "./email";
import { inviteExpiresAt } from "./maintenance";
import {
  nextOwnershipVerificationStatus,
  ownershipEvidenceKindForInput,
  ownershipEvidenceKindLabel,
  verificationDocumentTypeLabel,
} from "./ownership-evidence";
import { assertRateLimit } from "./rate-limit";
import { getSessionUser } from "./session";
import { normalizeInput } from "./normalize-input";
import {
  sellerProfileBuyerSelect,
  sellerSearchBuyerSelect,
  sellerVisibleBuyerWhere,
  toSellerBuyerProfileDto,
  toSellerSearchBuyerDto,
} from "./buyer-dtos";
import { querySellerSearchIds } from "./seller-search-query";
import { createSupabaseAdminClient, createSupabaseServerClient } from "./supabase";
import { redirect } from "next/navigation";

async function requireCurrentUser(role: "BUYER" | "SELLER" | "ADMIN") {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  if (!hasRole(user, role)) redirect("/onboarding/role");
  return user;
}

async function requireAuthenticatedUser() {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  return user;
}

function toNumber(value: unknown) {
  return value === null || value === undefined ? 0 : Number(value);
}

function dateKey(value?: Date | string | null) {
  if (!value) return "";
  return new Date(value).toISOString().slice(0, 10);
}

function expiresInDays(value?: Date | null) {
  if (!value) return undefined;
  return Math.ceil((value.getTime() - Date.now()) / 86_400_000);
}

function visibilityFromDb(value: string): Buyer["visibility"] {
  if (value === "ACTIVE") return "active";
  if (value === "DRAFT") return "draft";
  return "hidden";
}

function titleFromStatus(value: string): Invite["status"] {
  if (value === "VIEWED") return "Viewed";
  if (value === "ACCEPTED") return "Accepted";
  if (value === "DECLINED") return "Declined";
  if (value === "EXPIRED" || value === "WITHDRAWN") return "Expired";
  return "Sent";
}

function propertyStatusLabel(value: string) {
  if (value === "APPROVED") return "Ownership verified";
  if (value === "PENDING") return "Ownership pending";
  if (value === "REJECTED") return "Ownership rejected";
  return "Ownership not submitted";
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

function badgeFromDb(badge: {
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

function buyerCanUpdateVisibility(value?: string | null) {
  return value !== "HIDDEN" && value !== "SUSPENDED";
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

function buyerFromDb(profile: {
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
  criteria: {
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
  } | null;
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
  user?: { avatarVariant: string | null };
  userId: string;
  visibilityStatus: string;
}): Buyer {
  const criteriaItems = profile.criteria ? [profile.criteria] : [];
  const criteria = criteriaLabels(criteriaItems);
  const primaryServiceArea = profile.desiredServiceAreas?.find(
    (area) => area.isPrimary && area.source === "SELECTED",
  )?.serviceArea;
  const canonicalLocation = buyerLocationFromSelectedServiceArea(primaryServiceArea);

  return {
    id: profile.id,
    avatarVariant: profile.user?.avatarVariant ?? undefined,
    userId: profile.userId,
    name: buyerAliasForDisplay(profile.displayName, profile.userId),
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
    badges: profile.badges.map(badgeFromDb),
    criteria,
    criteriaDetails: criteriaDetails(criteriaItems),
    propertySubtypes: criteriaItems.map((item) => item.propertySubtype),
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

function emptyBuyerForUser(user: SessionUser, avatarVariant?: string | null): Buyer {
  return {
    id: "new-profile",
    avatarVariant: avatarVariant ?? undefined,
    userId: user.id,
    name: buyerAliasFromSeed(user.id),
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

function privateAccountName(user: { name: string | null } | null) {
  return user?.name?.trim() || "buyer";
}

function withPrivateAccountName(buyer: Buyer, accountName: string) {
  return {
    ...buyer,
    accountName,
  };
}

function propertyFromDb(property: {
  addressLine1: string | null;
  city: string | null;
  condition: string | null;
  description: string | null;
  features: string[];
  garageArea: number | null;
  id: string;
  lotSize: number | null;
  ownerUserId: string;
  ownershipVerificationStatus: string;
  price: unknown;
  propertyType: Property["propertyType"];
  squareFeet: number | null;
  state: string | null;
  zip: string | null;
  bedrooms: number | null;
  bathrooms: number | null;
}): Property {
  const location = [property.city, property.state, property.zip].filter(Boolean).join(", ");

  return {
    id: property.id,
    ownerUserId: property.ownerUserId,
    title: property.addressLine1 || `${property.city || "Property"} ${propertySubtypeLabel(property.propertyType).toLowerCase()}`,
    location,
    price: toNumber(property.price),
    beds: property.bedrooms ?? undefined,
    baths: property.bathrooms ?? undefined,
    area: property.squareFeet ?? undefined,
    lotSize: property.lotSize ?? undefined,
    garageArea: property.garageArea ?? undefined,
    propertyType: property.propertyType,
    condition: property.condition || "",
    features: property.features,
    description: property.description || "",
    status: propertyStatusLabel(property.ownershipVerificationStatus),
  };
}

async function assertAllowedFile(
  file: File,
  allowedTypes: Set<string>,
  label: string,
  typesLabel: string,
  maxBytes: number,
) {
  if (file.size <= 0) throw new Error(`${label} is empty.`);
  if (file.size > maxBytes) throw new Error(`${label} must be ${formatBytes(maxBytes)} or smaller.`);

  const detectedType = await detectMimeType(file);
  if (!detectedType || !allowedTypes.has(detectedType)) {
    throw new Error(`${label} must be ${typesLabel}.`);
  }

  return detectedType;
}

async function detectMimeType(file: File) {
  const bytes = new Uint8Array(await file.slice(0, 16).arrayBuffer());

  if (bytes[0] === 0x25 && bytes[1] === 0x50 && bytes[2] === 0x44 && bytes[3] === 0x46) {
    return "application/pdf";
  }
  if (
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47 &&
    bytes[4] === 0x0d &&
    bytes[5] === 0x0a &&
    bytes[6] === 0x1a &&
    bytes[7] === 0x0a
  ) {
    return "image/png";
  }
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return "image/jpeg";
  }
  if (
    bytes[0] === 0x52 &&
    bytes[1] === 0x49 &&
    bytes[2] === 0x46 &&
    bytes[3] === 0x46 &&
    bytes[8] === 0x57 &&
    bytes[9] === 0x45 &&
    bytes[10] === 0x42 &&
    bytes[11] === 0x50
  ) {
    return "image/webp";
  }

  return null;
}

async function fileSha256(file: File) {
  const hash = await crypto.subtle.digest("SHA-256", await file.arrayBuffer());
  return Array.from(new Uint8Array(hash))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

function storageFileNameForMime(contentType: string) {
  if (contentType === "application/pdf") return "document.pdf";
  if (contentType === "image/png") return "image.png";
  if (contentType === "image/jpeg") return "image.jpg";
  if (contentType === "image/webp") return "image.webp";
  return "upload.bin";
}

function formatBytes(value: number) {
  return `${Math.round(value / 1_048_576)} MB`;
}

async function uploadToStorage(bucket: string, path: string, file: File, contentType: string) {
  const supabase = await createSupabaseServerClient();
  if (!supabase) throw new Error("Supabase storage is not configured.");

  const { error } = await supabase.storage.from(bucket).upload(path, file, {
    contentType,
    upsert: false,
  });

  if (error) throw new Error(error.message);
}

async function createVerificationSignedUrl(storagePath: string) {
  const supabase = createSupabaseAdminClient() ?? await createSupabaseServerClient();
  if (!supabase) return null;

  const { data, error } = await supabase.storage
    .from("verification-documents")
    .createSignedUrl(storagePath, 600);

  if (error) return null;
  return data.signedUrl;
}

async function searchDbBuyerProfiles(filters: SearchBuyersInput, viewerUserId: string) {
  return prisma.$transaction(async (tx) => {
    const page = await querySellerSearchIds(tx, filters);
    const snapshotAt = new Date(page.snapshotAt);
    const profiles = page.ids.length > 0
      ? await tx.buyerProfile.findMany({
          where: { id: { in: page.ids } },
          select: sellerSearchBuyerSelect(snapshotAt),
        })
      : [];
    const profilesById = new Map(profiles.map((profile) => [profile.id, profile] as const));
    if (profilesById.size !== page.ids.length) {
      throw new Error("Seller search result changed during pagination.");
    }

    const items = page.ids.map((id) => {
      const profile = profilesById.get(id);
      const dto = profile ? toSellerSearchBuyerDto(profile, viewerUserId, snapshotAt) : null;
      if (!dto) throw new Error("Seller search result failed its safe DTO projection.");
      return dto;
    });
    return {
      items,
      pageInfo: {
        hasMore: page.hasMore,
        nextCursor: page.nextCursor,
        pageSize: page.pageSize,
        snapshotAt: page.snapshotAt,
      },
    };
  }, { isolationLevel: "RepeatableRead" });
}

function inviteFromDb(invite: {
  buyerProfile: { displayName: string; userId: string };
  buyerProfileId: string;
  id: string;
  message: string;
  property: {
    addressLine1: string | null;
    city: string | null;
    ownershipVerificationStatus: string;
    propertyType: Property["propertyType"];
  };
  propertyId: string;
  sellerId: string;
  sentAt: Date;
  status: string;
  title: string;
}): Invite {
  return {
    id: invite.id,
    sellerId: invite.sellerId,
    buyerProfileId: invite.buyerProfileId,
    propertyId: invite.propertyId,
    buyer: buyerAliasForDisplay(invite.buyerProfile.displayName, invite.buyerProfile.userId),
    property: invite.property.addressLine1 || `${invite.property.city || "Property"} ${propertySubtypeLabel(invite.property.propertyType).toLowerCase()}`,
    propertyStatus: propertyStatusLabel(invite.property.ownershipVerificationStatus),
    status: titleFromStatus(invite.status),
    sentAt: dateKey(invite.sentAt) || "Now",
    sentAtDate: dateKey(invite.sentAt),
    title: invite.title,
    message: invite.message,
  };
}

const buyerInclude = {
  badges: true,
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
  user: { select: { avatarVariant: true } },
} as const;

const documentMimeTypes = new Set(["application/pdf", "image/png", "image/jpeg", "image/webp"]);
const propertyImageMimeTypes = new Set(["image/png", "image/jpeg", "image/webp"]);
const buyerVerificationDocumentTypes = new Set(["PRE_APPROVAL", "VERIFIED_FUNDS", "IDENTITY", "OTHER"]);
const evidenceRequiredBadgeTypes = new Set<Badge["type"]>([
  "PRE_APPROVED",
  "EARNEST_MONEY_DEPOSITED",
  "CASH_BUYER",
  "VERIFIED_IDENTITY",
  "VERIFIED_FUNDS",
]);

type BuyerVerificationDocumentType = "PRE_APPROVAL" | "VERIFIED_FUNDS" | "IDENTITY" | "OTHER";

async function assertAuditRateLimit(user: SessionUser, action: string, limit: number, windowMs: number) {
  const createdAt = { gte: new Date(Date.now() - windowMs) };
  const count = await prisma.adminAuditLog.count({
    where: {
      action,
      actorUserId: user.id,
      createdAt,
    },
  });

  if (count >= limit) throw new Error("Rate limit reached. Try again later.");
}

async function auditSecurityEvent(
  user: SessionUser,
  action: string,
  targetType: string,
  targetId: string,
  metadata?: Prisma.InputJsonValue,
) {
  await prisma.adminAuditLog.create({
    data: {
      action,
      actorUserId: user.id,
      metadata,
      targetId,
      targetType,
    },
  });
}

function buyerVerificationDocumentType(value: unknown): BuyerVerificationDocumentType {
  if (typeof value === "string" && buyerVerificationDocumentTypes.has(value)) {
    return value as BuyerVerificationDocumentType;
  }
  throw new Error("Unsupported buyer verification document type.");
}

async function lockBuyerOwnership(tx: Prisma.TransactionClient, authUserId: string) {
  const owners = await tx.$queryRaw<Array<{ id: string }>>(Prisma.sql`
    SELECT id
    FROM public."User"
    WHERE id = ${authUserId}::uuid
    FOR UPDATE
  `);
  if (owners.length !== 1) throw new Error("Buyer account ownership could not be verified.");
}

async function upsertOwnedBuyerCriteria(
  tx: Prisma.TransactionClient,
  buyerProfileId: string,
  authUserId: string,
  data: PublishBuyerProfileInput,
) {
  const criteria = buyerCriteriaSnapshotData(data);
  await tx.buyerCriteria.upsert({
    where: {
      buyerProfileId,
      buyerProfile: { userId: authUserId },
    },
    update: criteria,
    create: {
      ...criteria,
      buyerProfileId,
    },
  });
}

async function assertActivationPrerequisites(
  tx: Prisma.TransactionClient,
  buyerProfileId: string,
  authUserId: string,
) {
  const selectedCount = await tx.buyerDesiredServiceArea.count({
    where: {
      buyerProfileId,
      buyerProfile: { userId: authUserId },
      isPrimary: true,
      source: "SELECTED",
      serviceArea: { active: true, market: { active: true } },
    },
  });
  if (selectedCount !== 1) {
    throw new Error("Choose an active Liber service area before publishing your profile.");
  }

  const criteriaCount = await tx.buyerCriteria.count({
    where: {
      buyerProfileId,
      buyerProfile: { userId: authUserId },
    },
  });
  if (criteriaCount !== 1) {
    throw new Error("Complete the required buyer criteria before publishing your profile.");
  }
}

async function publishDbBuyerProfile(
  user: SessionUser,
  data: PublishBuyerProfileInput,
) {
  const profile = await prisma.$transaction(async (tx) => {
    await lockBuyerOwnership(tx, user.id);
    const existing = await tx.buyerProfile.findUnique({
      where: { userId: user.id },
      select: { displayName: true, id: true, visibilityStatus: true },
    });
    if (existing && !buyerCanUpdateVisibility(existing.visibilityStatus)) {
      throw new Error("This profile visibility is controlled by admin review.");
    }
    const displayName = normalizeBuyerAlias(existing?.displayName) ?? buyerAliasFromSeed(user.id);
    const canonicalArea = await resolveCanonicalBuyerServiceArea(
      tx,
      data.desiredServiceAreaSlug,
      data.desiredMarketSlug,
    );
    if (!canonicalArea) {
      throw new Error("Choose an active Liber service area before publishing your profile.");
    }
    const profileSnapshot = buyerProfileSnapshotData(data);

    const savedProfile = await tx.buyerProfile.upsert({
      where: { userId: user.id },
      update: {
        ...profileSnapshot,
        ...canonicalBuyerLocationData(canonicalArea),
        displayName,
        lastRefreshedAt: new Date(),
        visibilityStatus: "ACTIVE",
      },
      create: {
        ...profileSnapshot,
        ...canonicalBuyerLocationData(canonicalArea),
        displayName,
        lastRefreshedAt: new Date(),
        userId: user.id,
        visibilityStatus: "ACTIVE",
      },
      include: buyerInclude,
    });

    await syncBuyerDesiredServiceArea(tx, savedProfile.id, canonicalArea, user.id);
    await upsertOwnedBuyerCriteria(tx, savedProfile.id, user.id, data);
    await assertActivationPrerequisites(tx, savedProfile.id, user.id);

    return tx.buyerProfile.findFirstOrThrow({
      where: { id: savedProfile.id, userId: user.id },
      include: buyerInclude,
    });
  });

  return buyerFromDb(profile);
}

async function syncBuyerDesiredServiceArea(
  tx: Prisma.TransactionClient,
  buyerProfileId: string,
  serviceArea: CanonicalBuyerServiceArea | null,
  resolvedByUserId: string,
) {
  await tx.buyerDesiredServiceArea.deleteMany({
    where: { buyerProfileId, buyerProfile: { userId: resolvedByUserId } },
  });
  if (!serviceArea) return;
  await tx.buyerDesiredServiceArea.create({
    data: {
      buyerProfileId,
      isPrimary: true,
      serviceAreaId: serviceArea.id,
      source: "SELECTED",
    },
  });
  await tx.serviceAreaMigrationQuarantine.updateMany({
    where: {
      buyerProfileId,
      buyerProfile: { userId: resolvedByUserId },
      resolvedAt: null,
    },
    data: {
      resolution: {
        actorUserId: resolvedByUserId,
        serviceAreaId: serviceArea.id,
        source: "BUYER_CONFIRMED",
      },
      resolvedAt: new Date(),
    },
  });
}

type CanonicalBuyerServiceArea = {
  centerLat: number;
  centerLng: number;
  city: string | null;
  id: string;
  label: string;
  market: { slug: string };
  postalCode: string | null;
  slug: string;
  state: string;
  type: string;
};

const canonicalBuyerServiceAreaSelect = {
  centerLat: true,
  centerLng: true,
  city: true,
  id: true,
  label: true,
  market: { select: { slug: true } },
  postalCode: true,
  slug: true,
  state: true,
  type: true,
} as const;

async function resolveCanonicalBuyerServiceArea(
  tx: Prisma.TransactionClient,
  serviceAreaSlug: string | null | undefined,
  marketSlug: string | null | undefined,
): Promise<CanonicalBuyerServiceArea | null> {
  const normalizedSlug = serviceAreaSlug?.trim().toLowerCase();
  if (!normalizedSlug) return null;
  const normalizedMarket = marketSlug?.trim().toLowerCase();
  if (!normalizedMarket) throw new Error("A market is required for the selected service area.");

  const serviceArea = await tx.serviceArea.findFirst({
    where: {
      active: true,
      slug: normalizedSlug,
      market: { active: true, slug: normalizedMarket },
    },
    select: canonicalBuyerServiceAreaSelect,
  });
  if (!serviceArea) throw new Error("Unsupported service area for this market.");
  return serviceArea;
}

function canonicalBuyerLocationData(serviceArea: CanonicalBuyerServiceArea | null) {
  if (!serviceArea) {
    return {
      desiredCity: null,
      desiredLat: null,
      desiredLng: null,
      desiredLocationText: null,
      desiredNeighborhood: null,
      desiredPostalCode: null,
      desiredState: null,
    };
  }

  const city = serviceArea.type === "neighborhood" ? serviceArea.label : serviceArea.city ?? serviceArea.label;
  return {
    desiredCity: city,
    desiredLat: serviceArea.centerLat,
    desiredLng: serviceArea.centerLng,
    desiredLocationText: serviceArea.type === "zip" && serviceArea.postalCode
      ? `${city}, ${serviceArea.state} ${serviceArea.postalCode}`
      : `${serviceArea.label}, ${serviceArea.state}`,
    desiredNeighborhood: serviceArea.type === "neighborhood" ? serviceArea.label : null,
    desiredPostalCode: serviceArea.postalCode,
    desiredState: serviceArea.state,
  };
}

export async function publishBuyerProfile(input: unknown) {
  const user = await requireCurrentUser("BUYER");
  const data = publishBuyerProfileSchema.parse(normalizeInput(input));
  return {
    ok: true,
    data: await publishDbBuyerProfile(user, data),
  };
}

export async function regenerateBuyerAlias() {
  const user = await requireCurrentUser("BUYER");
  const existing = await prisma.buyerProfile.findUnique({
    where: { userId: user.id },
    select: { displayName: true },
  });
  const displayedAlias = normalizeBuyerAlias(existing?.displayName) ?? buyerAliasFromSeed(user.id);
  const displayName = randomBuyerAlias(displayedAlias);
  const profile = await prisma.buyerProfile.upsert({
    where: { userId: user.id },
    update: {
      displayName,
      lastRefreshedAt: new Date(),
    },
    create: {
      displayName,
      lastRefreshedAt: new Date(),
      userId: user.id,
      visibilityStatus: "DRAFT",
    },
    select: { id: true },
  });

  return {
    ok: true,
    data: { buyerProfileId: profile.id, displayName },
  };
}

export async function getCurrentBuyerProfile() {
  const user = await requireCurrentUser("BUYER");
  const [profile, account] = await Promise.all([
    prisma.buyerProfile.findUnique({
      where: { userId: user.id },
      include: buyerInclude,
    }),
    prisma.user.findUnique({
      where: { id: user.id },
      select: { avatarVariant: true, name: true },
    }),
  ]);
  const accountName = privateAccountName(account);
  return {
    ok: true,
    data: withPrivateAccountName(
      profile ? buyerFromDb(profile) : emptyBuyerForUser(user, account?.avatarVariant),
      accountName,
    ),
  };
}

export async function shuffleBuyerAvatarVariant() {
  const user = await requireCurrentUser("BUYER");
  const account = await prisma.user.findUnique({
    where: { id: user.id },
    select: { avatarVariant: true },
  });
  const displayedAvatarVariant = normalizeAvatarVariant(account?.avatarVariant) ?? avatarVariantFromSeed(user.id);
  const avatarVariant = randomAvatarVariant(displayedAvatarVariant);
  const [updatedUser, profile] = await prisma.$transaction([
    prisma.user.update({
      where: { id: user.id },
      data: { avatarVariant },
      select: { avatarVariant: true },
    }),
    prisma.buyerProfile.findUnique({
      where: { userId: user.id },
      select: { id: true },
    }),
  ]);

  return {
    ok: true,
    data: { avatarVariant: updatedUser.avatarVariant, buyerProfileId: profile?.id ?? null },
  };
}

export async function previousBuyerAvatarVariant() {
  const user = await requireCurrentUser("BUYER");
  const account = await prisma.user.findUnique({
    where: { id: user.id },
    select: { avatarVariant: true },
  });
  const displayedAvatarVariant = normalizeAvatarVariant(account?.avatarVariant) ?? avatarVariantFromSeed(user.id);
  const avatarVariant = previousAvatarVariant(displayedAvatarVariant);
  const [updatedUser, profile] = await prisma.$transaction([
    prisma.user.update({
      where: { id: user.id },
      data: { avatarVariant },
      select: { avatarVariant: true },
    }),
    prisma.buyerProfile.findUnique({
      where: { userId: user.id },
      select: { id: true },
    }),
  ]);

  return {
    ok: true,
    data: { avatarVariant: updatedUser.avatarVariant, buyerProfileId: profile?.id ?? null },
  };
}

export async function listBuyerInvites() {
  const user = await requireCurrentUser("BUYER");
  const buyer = await prisma.buyerProfile.findUnique({ where: { userId: user.id }, select: { id: true } });
  if (!buyer) return { ok: true, data: [] };
  const invites = await prisma.invite.findMany({
    where: { buyerProfileId: buyer.id },
    include: {
      buyerProfile: { select: { displayName: true, userId: true } },
      property: { select: { addressLine1: true, city: true, ownershipVerificationStatus: true, propertyType: true } },
    },
    orderBy: { sentAt: "desc" },
  });
  return { ok: true, data: invites.map(inviteFromDb) };
}

export async function respondToInvite(input: unknown) {
  const user = await requireCurrentUser("BUYER");
  const data = respondToInviteSchema.parse(normalizeInput(input));
  const buyer = await prisma.buyerProfile.findUnique({ where: { userId: user.id }, select: { id: true } });
  if (!buyer) throw new Error("Buyer profile not found.");
  const result = await prisma.invite.updateMany({
    where: { id: data.inviteId, buyerProfileId: buyer.id, status: { in: ["SENT", "VIEWED"] } },
    data: {
      respondedAt: new Date(),
      status: data.response,
    },
  });
  if (result.count !== 1) throw new Error("Invite cannot be changed after response or expiration.");
  return { ok: true, data };
}

export async function searchBuyers(input: unknown) {
  const seller = await requireApprovedSellerAccess();
  await assertAuditRateLimit(seller, "buyer_search", 60, 60_000);
  const data = searchBuyersSchema.parse(input);
  const results = await searchDbBuyerProfiles(data, seller.id);
  await auditSecurityEvent(seller, "buyer_search", "buyer_directory", "search", {
    resultCount: results.items.length,
    ...(data.serviceArea ? { serviceArea: data.serviceArea } : {}),
  });
  return { ok: true, data: results };
}

export async function getBuyerProfileForSeller(buyerProfileId: string) {
  const seller = await requireApprovedSellerAccess();
  await assertAuditRateLimit(seller, "buyer_profile_view", 120, 60 * 60_000);
  const now = new Date();
  const buyer = await prisma.buyerProfile.findFirst({
    where: { id: buyerProfileId, ...sellerVisibleBuyerWhere() },
    select: sellerProfileBuyerSelect(now),
  });
  if (!buyer) throw new Error("Buyer profile not found.");
  await auditSecurityEvent(seller, "buyer_profile_view", "buyer_profile", buyer.id);
  const dto = toSellerBuyerProfileDto(buyer, seller.id, true, now);
  if (!dto) throw new Error("Buyer profile not found.");
  return { ok: true, data: dto };
}

export async function getPublicBuyerProfile(buyerProfileId: string) {
  const user = await requireAuthenticatedUser();
  await assertAuditRateLimit(user, "buyer_profile_view", 120, 60 * 60_000);
  const now = new Date();
  const buyer = await prisma.buyerProfile.findFirst({
    where: { id: buyerProfileId, ...sellerVisibleBuyerWhere() },
    select: sellerProfileBuyerSelect(now),
  });

  if (buyer) {
    if (!(await canViewBuyerProfile(user, buyer.userId))) {
      await auditSecurityEvent(user, "blocked_buyer_profile_view", "buyer_profile", buyer.id);
      return { ok: false as const, error: "UNAUTHORIZED" as const };
    }

    await auditSecurityEvent(user, "buyer_profile_view", "buyer_profile", buyer.id);
    const viewerCanViewDirectory = await canViewBuyerDirectory(user);
    const dto = toSellerBuyerProfileDto(buyer, user.id, viewerCanViewDirectory, now);
    if (!dto) return { ok: false as const, error: "NOT_FOUND" as const };
    return {
      ok: true,
      data: dto,
    };
  }
  return { ok: false as const, error: "NOT_FOUND" as const };
}

export async function createSellerProperty(input: unknown) {
  const seller = await requireCurrentUser("SELLER");
  const data = createSellerPropertySchema.parse(normalizeInput(input));
  const property = await prisma.sellerProperty.create({
    data: {
      addressLine1: data.addressLine1,
      addressLine2: data.addressLine2,
      bathrooms: data.bathrooms,
      bedrooms: data.bedrooms,
      city: data.city,
      condition: data.condition,
      description: data.description,
      features: data.features,
      garageArea: data.garageArea,
      lat: data.lat,
      lng: data.lng,
      lotSize: data.lotSize,
      ownerUserId: seller.id,
      price: data.price,
      propertyType: data.propertyType,
      squareFeet: data.squareFeet,
      state: data.state,
      zip: data.zip,
    },
  });
  await auditSecurityEvent(seller, "property_ownership_confirmed", "seller_property", property.id, {
    ownershipConfirmed: true,
  });
  return { ok: true, data: propertyFromDb(property) };
}

export async function updateSellerProperty(input: unknown) {
  const seller = await requireCurrentUser("SELLER");
  const data = updateSellerPropertySchema.parse(normalizeInput(input));
  const existing = await prisma.sellerProperty.findFirst({
    where: { id: data.propertyId, ownerUserId: seller.id },
    select: { id: true },
  });
  if (!existing) throw new Error("Property not found.");
  const property = await prisma.sellerProperty.update({
    where: { id: data.propertyId },
    data: {
      addressLine1: data.addressLine1,
      addressLine2: data.addressLine2,
      bathrooms: data.bathrooms,
      bedrooms: data.bedrooms,
      city: data.city,
      condition: data.condition,
      description: data.description,
      features: data.features,
      garageArea: data.garageArea,
      lat: data.lat,
      lng: data.lng,
      lotSize: data.lotSize,
      price: data.price,
      propertyType: data.propertyType,
      squareFeet: data.squareFeet,
      state: data.state,
      zip: data.zip,
    },
  });
  return { ok: true, data: propertyFromDb(property) };
}

export async function uploadPropertyImageFile(propertyId: string, file: File) {
  const seller = await requireCurrentUser("SELLER");
  const contentType = await assertAllowedFile(file, propertyImageMimeTypes, "Property image", "a PNG, JPG, or WebP file", 10 * 1_048_576);

  assertRateLimit(`upload:property-image:${seller.id}`, 30, 60 * 60_000);

  const property = await prisma.sellerProperty.findFirst({
    where: { id: propertyId, ownerUserId: seller.id },
    select: { id: true },
  });
  if (!property) throw new Error("Property not found.");

  const storagePath = `${property.id}/${crypto.randomUUID()}/${storageFileNameForMime(contentType)}`;
  await uploadToStorage("property-images", storagePath, file, contentType);
  await prisma.propertyImage.create({
    data: {
      altText: file.name,
      propertyId: property.id,
      storagePath,
    },
  });

  return { ok: true, data: { storagePath } };
}

export async function uploadOwnershipDocumentFile(
  propertyId: string,
  file: File,
  ownershipEvidenceKindInput: unknown,
) {
  const seller = await requireCurrentUser("SELLER");
  const ownershipEvidenceKind = ownershipEvidenceKindForInput(ownershipEvidenceKindInput);
  const contentType = await assertAllowedFile(
    file,
    documentMimeTypes,
    `Ownership ${ownershipEvidenceKindLabel(ownershipEvidenceKind)}`,
    "a PDF, PNG, JPG, or WebP file",
    20 * 1_048_576,
  );
  const sha256 = await fileSha256(file);

  assertRateLimit(`upload:verification:${seller.id}`, 20, 60 * 60_000);

  const property = await prisma.sellerProperty.findFirst({
    where: { id: propertyId, ownerUserId: seller.id },
    select: { id: true },
  });
  if (!property) throw new Error("Property not found.");

  const documentId = `doc_${crypto.randomUUID()}`;
  const storagePath = `${seller.id}/${documentId}/${storageFileNameForMime(contentType)}`;
  await uploadToStorage("verification-documents", storagePath, file, contentType);
  await prisma.$transaction([
    prisma.sellerProperty.update({
      where: { id: property.id },
      data: { ownershipVerificationStatus: "PENDING" },
    }),
    prisma.verificationDocument.create({
      data: {
        documentType: "OWNERSHIP",
        fileSha256: sha256,
        fileSizeBytes: file.size,
        id: documentId,
        mimeType: contentType,
        originalFilename: file.name,
        ownershipEvidenceKind,
        propertyId: property.id,
        reviewStatus: "PENDING",
        storageBucket: "verification-documents",
        storagePath,
        uploadedByUserId: seller.id,
        userId: seller.id,
      },
    }),
    prisma.adminAuditLog.create({
      data: {
        action: "document_upload",
        actorUserId: seller.id,
        metadata: { documentType: "OWNERSHIP", ownershipEvidenceKind, propertyId: property.id },
        targetId: documentId,
        targetType: "document",
      },
    }),
  ]);

  return { ok: true, data: { documentId, status: "PENDING" as const } };
}

export async function uploadBuyerVerificationDocumentFile(documentTypeInput: unknown, file: File) {
  const buyerUser = await requireCurrentUser("BUYER");
  const documentType = buyerVerificationDocumentType(documentTypeInput);
  const contentType = await assertAllowedFile(file, documentMimeTypes, "Verification document", "a PDF, PNG, JPG, or WebP file", 20 * 1_048_576);
  const sha256 = await fileSha256(file);

  assertRateLimit(`upload:verification:${buyerUser.id}`, 20, 60 * 60_000);

  const buyer = await prisma.buyerProfile.findUnique({
    where: { userId: buyerUser.id },
    select: { id: true },
  });
  if (!buyer) throw new Error("Buyer profile not found.");

  const documentId = `doc_${crypto.randomUUID()}`;
  const storagePath = `${buyerUser.id}/${documentId}/${storageFileNameForMime(contentType)}`;
  await uploadToStorage("verification-documents", storagePath, file, contentType);
  await prisma.$transaction([
    prisma.verificationDocument.create({
      data: {
        buyerProfileId: buyer.id,
        documentType,
        fileSha256: sha256,
        fileSizeBytes: file.size,
        id: documentId,
        mimeType: contentType,
        originalFilename: file.name,
        reviewStatus: "PENDING",
        storageBucket: "verification-documents",
        storagePath,
        uploadedByUserId: buyerUser.id,
        userId: buyerUser.id,
      },
    }),
    prisma.adminAuditLog.create({
      data: {
        action: "document_upload",
        actorUserId: buyerUser.id,
        metadata: { buyerProfileId: buyer.id, documentType },
        targetId: documentId,
        targetType: "document",
      },
    }),
  ]);

  return { ok: true, data: { documentId, status: "PENDING" as const } };
}

export async function sendInvite(input: unknown) {
  const seller = await requireApprovedSellerAccess();
  await assertAuditRateLimit(seller, "invite_sent", 30, 60 * 60_000);
  const data = sendInviteSchema.parse(normalizeInput(input));
  const now = new Date();
  const [buyer, property, sentInviteCountToday, activeDuplicate] = await Promise.all([
    prisma.buyerProfile.findFirst({
      where: { id: data.buyerProfileId, ...sellerVisibleBuyerWhere() },
      select: sellerSearchBuyerSelect(now),
    }),
    prisma.sellerProperty.findFirst({
      where: { id: data.propertyId, ownerUserId: seller.id },
    }),
    prisma.invite.count({
      where: {
        sellerId: seller.id,
        sentAt: { gte: new Date(Date.now() - 86_400_000) },
      },
    }),
    prisma.invite.findFirst({
      where: {
        buyerProfileId: data.buyerProfileId,
        propertyId: data.propertyId,
        sellerId: seller.id,
        status: { in: ["SENT", "VIEWED"] },
      },
      select: { id: true },
    }),
  ]);

  if (!buyer) throw new Error("Buyer profile must be active before receiving invites.");
  if (!property) throw new Error("Seller must own property before sending invites.");
  if (buyer.userId === seller.id) throw new Error("Sellers cannot invite their own buyer profile.");
  if (property.flaggedForReviewAt) throw new Error("Property is under review and cannot send invites.");
  if (activeDuplicate) throw new Error("An active invite already exists for this buyer and property.");

  assertInviteAllowed({
    buyer: { userId: buyer.userId, visibility: "active" },
    property: propertyFromDb(property),
    seller,
    sentInviteCountToday,
  });

  const invite = await prisma.$transaction(async (tx) => {
    const created = await tx.invite.create({
      data: {
        buyerProfileId: data.buyerProfileId,
        message: data.message,
        propertyId: data.propertyId,
        sellerId: seller.id,
        title: data.title,
        expiresAt: inviteExpiresAt(),
      },
      include: {
        buyerProfile: {
          select: {
            displayName: true,
            user: { select: { email: true } },
            userId: true,
          },
        },
        property: { select: { addressLine1: true, city: true, ownershipVerificationStatus: true, propertyType: true, state: true } },
      },
    });
    await tx.notification.create({
      data: {
        body: "A seller sent a property invite.",
        metadata: {
          inviteId: created.id,
          propertyId: created.propertyId,
        },
        title: data.title,
        type: "invite_received",
        userId: created.buyerProfile.userId,
      },
    });
    await tx.notification.create({
      data: {
        body: "Your manual invite was sent to the buyer.",
        metadata: {
          buyerProfileId: created.buyerProfileId,
          inviteId: created.id,
          propertyId: created.propertyId,
        },
        title: data.title,
        type: "invite_sent",
        userId: seller.id,
      },
    });
    const propertyTitle =
      created.property.addressLine1 ||
      [created.property.city, created.property.state].filter(Boolean).join(", ") ||
      `${propertySubtypeLabel(created.property.propertyType).toLowerCase()} property`;
    const emailPayload = {
      buyerName: buyerAliasForDisplay(created.buyerProfile.displayName, created.buyerProfile.userId),
      message: data.message,
      propertyTitle,
      title: data.title,
      to: created.buyerProfile.user.email,
    };
    await tx.emailOutbox.create({
      data: {
        payload: emailPayload,
        status: "PENDING",
        subject: data.title,
        templateName: "invite",
        to: created.buyerProfile.user.email,
        type: "INVITE",
      },
    });
    await tx.adminAuditLog.create({
      data: {
        action: "invite_sent",
        actorUserId: seller.id,
        metadata: {
          buyerProfileId: created.buyerProfileId,
          propertyId: created.propertyId,
        },
        targetId: created.id,
        targetType: "invite",
      },
    });
    return created;
  });
  const email: EmailResult = { provider: "outbox", queued: true };

  return { ok: true, data: { ...inviteFromDb(invite), email } };
}

export async function listSellerInvites() {
  const seller = await requireCurrentUser("SELLER");
  const invites = await prisma.invite.findMany({
    where: { sellerId: seller.id },
    include: {
      buyerProfile: { select: { displayName: true, userId: true } },
      property: { select: { addressLine1: true, city: true, ownershipVerificationStatus: true, propertyType: true } },
    },
    orderBy: { sentAt: "desc" },
  });
  return { ok: true, data: invites.map(inviteFromDb) };
}

export async function listUsers() {
  await requireCurrentUser("ADMIN");
  const users = await prisma.user.findMany({
    include: { sellerAccess: { select: { status: true } } },
    orderBy: { createdAt: "desc" },
  });
  return {
    ok: true,
    data: users.map((user) => ({
      id: user.id,
      name: user.name || user.email,
      roles: user.roles,
      sellerAccessStatus: user.sellerAccess?.status ?? null,
      status: user.status,
    })),
  };
}

export async function reviewSellerAccess(input: unknown) {
  const admin = await requireCurrentUser("ADMIN");
  const data = sellerAccessReviewSchema.parse(normalizeInput(input));
  if (data.userId === admin.id) throw new Error("Admins cannot review their own seller access.");

  const user = await prisma.user.findUnique({
    where: { id: data.userId },
    select: { roles: true },
  });
  if (!user || !user.roles.includes("SELLER")) throw new Error("Seller user not found.");

  await prisma.$transaction([
    prisma.sellerAccess.upsert({
      where: { userId: data.userId },
      update: {
        reviewedAt: new Date(),
        reviewedByUserId: admin.id,
        status: data.status,
      },
      create: {
        reviewedAt: new Date(),
        reviewedByUserId: admin.id,
        status: data.status,
        userId: data.userId,
      },
    }),
    prisma.notification.create({
      data: {
        body: `Your seller directory access is ${data.status.toLowerCase()}.`,
        metadata: { sellerAccessStatus: data.status },
        title: "Seller access reviewed",
        type: "seller_access_reviewed",
        userId: data.userId,
      },
    }),
    prisma.adminAuditLog.create({
      data: {
        action: "seller_access_review",
        actorUserId: admin.id,
        metadata: { notes: data.notes, status: data.status },
        targetId: data.userId,
        targetType: "user",
      },
    }),
  ]);

  return { ok: true, data };
}

export async function getCurrentSellerAccess() {
  const seller = await requireCurrentUser("SELLER");
  return {
    ok: true,
    data: {
      status: await sellerAccessStatusForUser(seller.id),
    },
  };
}

export async function listAdminBuyerProfiles() {
  await requireCurrentUser("ADMIN");
  const [buyers, documents] = await Promise.all([
    prisma.buyerProfile.findMany({
      include: buyerInclude,
      orderBy: { updatedAt: "desc" },
    }),
    prisma.verificationDocument.findMany({
      where: {
        buyerProfileId: { not: null },
        reviewStatus: "APPROVED",
      },
      orderBy: { reviewedAt: "desc" },
      select: {
        documentType: true,
        fileSha256: true,
        id: true,
        buyerProfileId: true,
        originalFilename: true,
      },
    }),
  ]);
  const documentsByBuyer = new Map<string, typeof documents>();
  for (const document of documents) {
    if (!document.buyerProfileId) continue;
    documentsByBuyer.set(document.buyerProfileId, [
      ...(documentsByBuyer.get(document.buyerProfileId) ?? []),
      document,
    ]);
  }

  return {
    ok: true,
    data: buyers.map((buyer) => ({
      ...buyerFromDb(buyer),
      approvedDocuments: documentsByBuyer.get(buyer.id) ?? [],
    })),
  };
}

export async function listAdminInvites() {
  await requireCurrentUser("ADMIN");
  const invites = await prisma.invite.findMany({
    include: {
      buyerProfile: { select: { displayName: true, userId: true } },
      property: { select: { addressLine1: true, city: true, ownershipVerificationStatus: true, propertyType: true } },
    },
    orderBy: { sentAt: "desc" },
  });
  return { ok: true, data: invites.map(inviteFromDb) };
}

export async function listPendingDocuments() {
  await requireCurrentUser("ADMIN");
  const documents = await prisma.verificationDocument.findMany({
    where: { reviewStatus: "PENDING" },
    include: {
      buyerProfile: { select: { displayName: true, userId: true } },
      property: { select: { addressLine1: true, city: true, propertyType: true } },
      user: { select: { email: true, name: true } },
    },
    orderBy: { createdAt: "desc" },
  });
  const documentsWithUrls = await Promise.all(
    documents.map(async (document) => ({
      document,
      signedUrl: await createVerificationSignedUrl(document.storagePath),
    })),
  );
  return {
    ok: true,
    data: documentsWithUrls.map(({ document, signedUrl }) => ({
      id: document.id,
      owner: document.user.name || document.user.email,
      signedUrl,
      subject:
        document.property?.addressLine1 ||
        (document.buyerProfile
          ? buyerAliasForDisplay(document.buyerProfile.displayName, document.buyerProfile.userId)
          : null) ||
        document.property?.city ||
        "Verification document",
      type: verificationDocumentTypeLabel(document.documentType, document.ownershipEvidenceKind),
      status: "Pending",
    })),
  };
}

export async function reviewDocument(input: unknown) {
  const admin = await requireCurrentUser("ADMIN");
  const data = reviewDocumentSchema.parse(normalizeInput(input));
  await prisma.$transaction(async (tx) => {
    const document = await tx.verificationDocument.findUnique({
      where: { id: data.documentId },
    });
    if (!document || document.reviewStatus !== "PENDING") {
      throw new Error("Document has already been reviewed.");
    }

    const reviewedDocument = await tx.verificationDocument.update({
      where: { id: data.documentId },
      data: {
        rejectionReason: data.decision === "REJECTED" ? data.rejectionReason : null,
        reviewedAt: new Date(),
        reviewedByUserId: admin.id,
        reviewNotes: data.rejectionReason,
        reviewStatus: data.decision,
      },
    });

    if (reviewedDocument.documentType === "OWNERSHIP" && reviewedDocument.propertyId) {
      const ownershipDocuments = await tx.verificationDocument.findMany({
        where: {
          documentType: "OWNERSHIP",
          propertyId: reviewedDocument.propertyId,
        },
        select: {
          ownershipEvidenceKind: true,
          reviewStatus: true,
        },
      });
      const nextOwnershipStatus = nextOwnershipVerificationStatus(ownershipDocuments, data.decision);

      await tx.sellerProperty.update({
        where: { id: reviewedDocument.propertyId },
        data: { ownershipVerificationStatus: nextOwnershipStatus },
      });
    }

    await tx.notification.create({
      data: {
        body:
          data.decision === "APPROVED"
            ? "An admin approved your verification document."
            : "An admin rejected your verification document.",
        metadata: { decision: data.decision, documentId: reviewedDocument.id, documentType: reviewedDocument.documentType },
        title: `Verification document ${data.decision.toLowerCase()}`,
        type: "document_reviewed",
        userId: reviewedDocument.userId,
      },
    });

    await tx.adminAuditLog.create({
      data: {
        action: "review_document",
        actorUserId: admin.id,
        metadata: { decision: data.decision },
        targetId: data.documentId,
        targetType: "document",
      },
    });
  });
  return { ok: true, data };
}

export async function grantBadge(input: unknown) {
  const admin = await requireCurrentUser("ADMIN");
  const data = grantBadgeSchema.parse(normalizeInput(input));
  const badge = await prisma.$transaction(async (tx) => {
    const buyerProfile = await tx.buyerProfile.findUnique({
      where: { id: data.buyerProfileId },
      select: { userId: true },
    });
    if (!buyerProfile) throw new Error("Buyer profile not found.");

    let evidenceDocument:
      | {
          documentType: string;
          fileSha256: string | null;
          id: string;
          storagePath: string;
        }
      | null = null;

    if (data.evidenceDocumentId) {
      evidenceDocument = await tx.verificationDocument.findFirst({
        where: {
          buyerProfileId: data.buyerProfileId,
          id: data.evidenceDocumentId,
          reviewStatus: "APPROVED",
        },
        select: {
          documentType: true,
          fileSha256: true,
          id: true,
          storagePath: true,
        },
      });
      if (!evidenceDocument) throw new Error("Badge evidence must be an approved document for this buyer.");
    }

    if (evidenceRequiredBadgeTypes.has(data.badgeType) && !evidenceDocument) {
      throw new Error("This badge requires approved document evidence.");
    }

    const badgeData = {
      evidenceDocumentId: evidenceDocument?.id,
      expiresAt:
        data.expiresAt ??
        (data.badgeType === "PRE_APPROVED"
          ? new Date(Date.now() + 90 * 86_400_000)
          : undefined),
      grantedAt: new Date(),
      grantedByUserId: admin.id,
      issuedAt: new Date(),
      notes: data.notes,
      source: evidenceDocument ? "ADMIN_REVIEWED_DOCUMENT" : "ADMIN_MANUAL",
      status: "ACTIVE" as const,
    };
    const created = await tx.buyerBadge.upsert({
      where: {
        buyerProfileId_badgeType: {
          badgeType: data.badgeType,
          buyerProfileId: data.buyerProfileId,
        },
      },
      update: badgeData,
      create: {
        ...badgeData,
        badgeType: data.badgeType,
        buyerProfileId: data.buyerProfileId,
      },
    });
    await tx.notification.create({
      data: {
        body: "An admin approved this trust badge for your buyer profile.",
        metadata: { badgeId: created.id, badgeType: data.badgeType },
        title: `${badgeLabel(data.badgeType)} badge approved`,
        type: "badge_granted",
        userId: buyerProfile.userId,
      },
    });
    await tx.adminAuditLog.create({
      data: {
        action: "grant_badge",
        actorUserId: admin.id,
        metadata: {
          badgeType: data.badgeType,
          evidenceDocumentId: evidenceDocument?.id,
          evidenceDocumentType: evidenceDocument?.documentType,
          evidenceFileSha256: evidenceDocument?.fileSha256,
        },
        targetId: data.buyerProfileId,
        targetType: "buyer_profile",
      },
    });
    return created;
  });
  return { ok: true, data: badgeFromDb(badge) };
}

export async function revokeBadge(input: unknown) {
  const admin = await requireCurrentUser("ADMIN");
  const data = revokeBadgeSchema.parse(normalizeInput(input));
  await prisma.$transaction(async (tx) => {
    const badge = await tx.buyerBadge.update({
      where: { id: data.badgeId },
      data: { notes: data.notes, status: "REVOKED" },
      include: { buyerProfile: { select: { userId: true } } },
    });
    await tx.notification.create({
      data: {
        body: "An admin removed this trust badge from your buyer profile.",
        metadata: { badgeId: badge.id, badgeType: badge.badgeType },
        title: `${badgeLabel(badge.badgeType)} badge revoked`,
        type: "badge_revoked",
        userId: badge.buyerProfile.userId,
      },
    });
    await tx.adminAuditLog.create({
      data: {
        action: "revoke_badge",
        actorUserId: admin.id,
        metadata: { notes: data.notes },
        targetId: data.badgeId,
        targetType: "badge",
      },
    });
  });
  return { ok: true, data };
}

export async function suspendUser(input: unknown) {
  const admin = await requireCurrentUser("ADMIN");
  const data = userModerationSchema.parse(normalizeInput(input));
  if (data.userId === admin.id) throw new Error("Admins cannot suspend their own account.");

  await prisma.$transaction([
    prisma.user.update({
      where: { id: data.userId },
      data: { status: "SUSPENDED", suspendedAt: new Date() },
    }),
    prisma.buyerProfile.updateMany({
      where: { userId: data.userId },
      data: { visibilityStatus: "SUSPENDED" },
    }),
    prisma.adminAuditLog.create({
      data: {
        action: "suspend_user",
        actorUserId: admin.id,
        metadata: { reason: data.reason },
        targetId: data.userId,
        targetType: "user",
      },
    }),
  ]);
  return { ok: true, data };
}

export async function hideBuyerProfile(input: unknown) {
  const admin = await requireCurrentUser("ADMIN");
  const data = buyerProfileModerationSchema.parse(normalizeInput(input));
  await prisma.$transaction(async (tx) => {
    const profile = await tx.buyerProfile.findUnique({
      where: { id: data.buyerProfileId },
      select: { userId: true },
    });
    if (!profile) throw new Error("Buyer profile not found.");

    await lockBuyerOwnership(tx, profile.userId);
    const hidden = await tx.buyerProfile.updateMany({
      where: { id: data.buyerProfileId, userId: profile.userId },
      data: { visibilityStatus: "HIDDEN" },
    });
    if (hidden.count !== 1) throw new Error("Buyer profile not found.");

    await tx.adminAuditLog.create({
      data: {
        action: "hide_buyer_profile",
        actorUserId: admin.id,
        metadata: { reason: data.reason },
        targetId: data.buyerProfileId,
        targetType: "buyer_profile",
      },
    });
  });
  return { ok: true, data };
}

export async function listAuditLog() {
  await requireCurrentUser("ADMIN");
  const logs = await prisma.adminAuditLog.findMany({
    include: { actor: { select: { email: true, name: true } } },
    orderBy: { createdAt: "desc" },
    take: 100,
  });
  return {
    ok: true,
    data: logs.map((log) => ({
      id: log.id,
      actor: log.actor ? log.actor.name || log.actor.email : "Deleted admin",
      action: log.action,
      target: `${log.targetType}:${log.targetId}`,
      metadata: log.metadata,
      createdAt: dateKey(log.createdAt),
    })),
  };
}

export async function listNotifications() {
  const user = await requireAuthenticatedUser();
  const notifications = await prisma.notification.findMany({
    where: { userId: user.id },
    orderBy: { createdAt: "desc" },
  });
  return {
    ok: true,
    data: notifications.map((notification) => ({
      id: notification.id,
      userId: notification.userId,
      type: notification.type,
      title: notification.title,
      body: notification.body,
      readAt: notification.readAt ? dateKey(notification.readAt) : null,
      createdAt: dateKey(notification.createdAt),
    })),
  };
}

export async function listSellerProperties() {
  const seller = await requireCurrentUser("SELLER");
  const properties = await prisma.sellerProperty.findMany({
    where: { ownerUserId: seller.id },
    orderBy: { updatedAt: "desc" },
  });
  return { ok: true, data: properties.map(propertyFromDb) };
}

export async function getSellerProperty(propertyId: string) {
  const seller = await requireCurrentUser("SELLER");
  const property = await prisma.sellerProperty.findFirst({
    where: { id: propertyId, ownerUserId: seller.id },
  });
  if (!property) throw new Error("Property not found.");
  return { ok: true, data: propertyFromDb(property) };
}

function badgeLabel(type: Badge["type"]) {
  const labels: Record<Badge["type"], string> = {
    PRE_APPROVED: "Admin-verified pre-approval",
    EARNEST_MONEY_DEPOSITED: "Earnest money review",
    CASH_BUYER: "Cash buyer",
    NON_CONTINGENT: "Non-contingent",
    VERIFIED_IDENTITY: "Verified identity",
    VERIFIED_FUNDS: "Verified funds",
    COMPLETED_TRANSACTION: "Completed transaction",
  };
  return labels[type];
}
