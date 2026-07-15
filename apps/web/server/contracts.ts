"use server";

import { Prisma, prisma } from "@liber/db";
import {
  buyerProfileModerationSchema,
  createSellerPropertySchema,
  grantBadgeSchema,
  purchaseTypeSchema,
  respondToInviteSchema,
  reviewDocumentSchema,
  revokeBadgeSchema,
  searchBuyersSchema,
  seekingPropertyTypeSchema,
  sendInviteSchema,
  sellerAccessReviewSchema,
  updateSellerPropertySchema,
  userModerationSchema,
  type SearchBuyersInput,
} from "@liber/validators";
import type { OwnerBadgeDTO, OwnerBuyerProfileDTO, SellerBuyerCriteriaDTO } from "../lib/buyer-dtos";
import type { InviteDTO, SellerPropertyDTO } from "../lib/marketplace-dtos";
import { sellerBuyerDetail, sellerBuyerSelect, sellerBuyerSummary, type SellerBuyerRow } from "./buyer/read-models";
import { propertySubtypeLabel } from "../lib/property-types";
import {
  avatarVariantFromSeed,
  normalizeAvatarVariant,
  randomAvatarVariant,
  resolveAvatarVariant,
} from "../lib/avatar-variant";
import {
  buyerAliasForDisplay,
  buyerAliasFromSeed,
  normalizeBuyerAlias,
  randomBuyerAlias,
} from "../lib/buyer-alias";
import { buyerLocationFromSelectedServiceArea } from "./canonical-buyer-location";
import { hasRole, type SessionUser } from "./authz";
import { defaultPathForSessionUser } from "./auth-intent";
import {
  canViewBuyerDirectory,
  canViewBuyerProfile,
  requireApprovedSellerAccess,
  sellerAccessStatusForUser,
} from "./access";
import type { EmailResult } from "./email";
import { inviteExpiresAt } from "./maintenance";
import { normalizeMessageBody, visibleMessageBody } from "./messaging/content";
import { messagingV1EnabledForPair } from "./messaging/feature";
import { messagingInviteUnavailable } from "./messaging/errors";
import {
  lockAndAssertInvitePairAvailable,
  usersHaveMessagingBlock,
} from "./messaging/service";
import { resolveMessagingTemplate } from "./messaging/templates";
import { verificationDocumentTypeLabel } from "./ownership-evidence";
import { assertRateLimit } from "./rate-limit";
import { getSessionUser } from "./session";
import { normalizeInput } from "./normalize-input";
import { activePrimaryServiceAreaWhere } from "./service-area-matching";
import { querySellerSearchIds } from "./seller-search-query";
import { createSupabaseAdminClient, createSupabaseServerClient } from "./supabase";
import { redirect } from "next/navigation";
import { evidenceSupportsBadge } from "./verification/evidence-rules";

type Badge = OwnerBadgeDTO;
type Buyer = OwnerBuyerProfileDTO;
type BuyerCriteriaDetail = SellerBuyerCriteriaDTO;
type Invite = InviteDTO;
type Property = SellerPropertyDTO;

const inviteModerationMessages = {
  where: { kind: "INVITE" as const },
  select: { moderationStatus: true },
  take: 1,
};

async function requireCurrentUser(role: "BUYER" | "SELLER" | "ADMIN") {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  if (!hasRole(user, role)) redirect(defaultPathForSessionUser(user));
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
  user?: { avatarVariant: string | null };
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

function emptyBuyerForUser(user: SessionUser, avatarVariant?: string | null): Buyer {
  return {
    id: "new-profile",
    avatarVariant: resolveAvatarVariant(avatarVariant, user.id).value,
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
  ownershipVerificationStatus: string;
  status: Property["lifecycleStatus"];
  identityVersion: number;
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
    lifecycleStatus: property.status,
    identityVersion: property.identityVersion,
  };
}

async function createVerificationSignedUrl(storagePath: string) {
  const supabase = createSupabaseAdminClient() ?? await createSupabaseServerClient();
  if (!supabase) return null;

  const { data, error } = await supabase.storage
    .from("verification-documents")
    .createSignedUrl(storagePath, 60);

  if (error) return null;
  return data.signedUrl;
}

async function searchDbBuyerProfiles(filters: SearchBuyersInput, viewerUserId: string) {
  return prisma.$transaction(async (tx) => {
    const page = await querySellerSearchIds(tx, filters, new Date(), Prisma.raw("public"), viewerUserId);
    const profiles = page.ids.length > 0
      ? await tx.buyerProfile.findMany({
          where: { id: { in: page.ids } },
          select: sellerBuyerSelect(),
        })
      : [];
    const profilesById = new Map(
      profiles.map((profile: SellerBuyerRow) => [profile.id, profile] as const),
    );
    if (profilesById.size !== page.ids.length) {
      throw new Error("Seller search result changed during pagination.");
    }
    const demoAuditRows = page.ids.length > 0
      ? await tx.adminAuditLog.findMany({
          where: { action: "seed_demo_buyer", targetId: { in: page.ids }, targetType: "buyer_profile" },
          select: { targetId: true },
        })
      : [];
    const demoProfileIds = new Set(demoAuditRows.map((row) => row.targetId));

    return {
      items: page.ids.map((id) => sellerBuyerSummary(profilesById.get(id)!, viewerUserId, demoProfileIds.has(id))),
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
  conversation?: {
    id?: string;
    messages?: Array<{ moderationStatus: "ALLOWED" | "FLAGGED" | "REDACTED" }>;
  } | null;
  id: string;
  message: string;
  property: {
    addressLine1: string | null;
    city: string | null;
    identityVersion: number;
    ownershipVerificationStatus: string;
    propertyType: Property["propertyType"];
    images?: Array<{ id: string; propertyIdentityVersion: number }>;
  };
  propertyId: string;
  propertyIdentityVersion: number;
  sellerId: string;
  sentAt: Date;
  expiresAt: Date | null;
  status: string;
  title: string;
}): Invite {
  const currentIdentity = invite.propertyIdentityVersion === invite.property.identityVersion;
  const displayMessage = visibleMessageBody(
    invite.message,
    invite.conversation?.messages?.some((message) => message.moderationStatus === "REDACTED")
      ? "REDACTED"
      : "ALLOWED",
  );
  const conversationAvailable = Boolean(
    invite.conversation?.id
    && messagingV1EnabledForPair(invite.sellerId, invite.buyerProfile.userId),
  );
  return {
    id: invite.id,
    buyerProfileId: invite.buyerProfileId,
    propertyId: invite.propertyId,
    buyer: buyerAliasForDisplay(invite.buyerProfile.displayName, invite.buyerProfile.userId),
    property: invite.property.addressLine1 || `${invite.property.city || "Property"} ${propertySubtypeLabel(invite.property.propertyType).toLowerCase()}`,
    propertyStatus: propertyStatusLabel(invite.property.ownershipVerificationStatus),
    status: !currentIdentity || (invite.expiresAt && invite.expiresAt.getTime() <= Date.now() && ["SENT", "VIEWED"].includes(invite.status))
      ? "Expired"
      : titleFromStatus(invite.status),
    sentAt: dateKey(invite.sentAt) || "Now",
    sentAtDate: dateKey(invite.sentAt),
    expiresAt: invite.expiresAt?.toISOString(),
    title: invite.title,
    message: displayMessage,
    imageIds: currentIdentity
      ? invite.property.images
        ?.filter((image) => image.propertyIdentityVersion === invite.property.identityVersion)
        .map((image) => image.id) ?? []
      : [],
    conversationAvailable,
    conversationId: conversationAvailable ? invite.conversation?.id : undefined,
  };
}

const buyerInclude = {
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
  user: { select: { avatarVariant: true } },
} satisfies Prisma.BuyerProfileInclude;

const evidenceRequiredBadgeTypes = new Set<Badge["type"]>(["PRE_APPROVED", "VERIFIED_IDENTITY", "VERIFIED_FUNDS"]);

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

export async function listBuyerInvites() {
  const user = await requireCurrentUser("BUYER");
  const buyer = await prisma.buyerProfile.findUnique({ where: { userId: user.id }, select: { id: true } });
  if (!buyer) return { ok: true, data: [] };
  const validInviteIds = await prisma.$queryRaw<Array<{ id: string }>>`
    SELECT invite.id
    FROM public."Invite" invite
    WHERE invite."buyerProfileId" = ${buyer.id}
      AND app_private.is_invite_property_access_valid(invite.id, ${user.id}::uuid)
  `;
  const invites = await prisma.invite.findMany({
    where: { id: { in: validInviteIds.map((invite) => invite.id) } },
    include: {
      buyerProfile: { select: { displayName: true, userId: true } },
      conversation: {
        select: {
          id: true,
          messages: inviteModerationMessages,
        },
      },
      property: {
        select: {
          addressLine1: true,
          city: true,
          identityVersion: true,
          ownershipVerificationStatus: true,
          propertyType: true,
          images: { select: { id: true, propertyIdentityVersion: true } },
        },
      },
    },
    orderBy: { sentAt: "desc" },
  });
  return { ok: true, data: invites.map(inviteFromDb) };
}

export async function respondToInvite(input: unknown) {
  const user = await requireCurrentUser("BUYER");
  const data = respondToInviteSchema.parse(normalizeInput(input));
  const changed = await prisma.$transaction(async (tx) => {
    const invite = await tx.invite.findFirst({
      where: { id: data.inviteId, buyerProfile: { userId: user.id } },
      select: { sellerId: true },
    });
    if (!invite) return 0;

    await lockAndAssertInvitePairAvailable(tx, invite.sellerId, user.id);
    const locked = await tx.$queryRaw<Array<{ id: string }>>`
      SELECT id FROM public."Invite" WHERE id = ${data.inviteId} FOR UPDATE
    `;
    if (locked.length !== 1) return 0;

    return tx.$executeRaw`
      UPDATE public."Invite"
      SET status = CAST(${data.response} AS public."InviteStatus"),
          "respondedAt" = now(),
          "updatedAt" = now()
      WHERE id = ${data.inviteId}
        AND status IN ('SENT', 'VIEWED')
        AND "expiresAt" > now()
        AND app_private.is_invite_property_access_valid(id, ${user.id}::uuid)
    `;
  });
  if (changed !== 1) throw new Error("Invite cannot be changed after response, identity change, or expiration.");
  return { ok: true, data };
}

export async function searchBuyers(input: unknown) {
  const seller = await requireApprovedSellerAccess();
  await assertRateLimit(`buyer-search:${seller.id}`, 60, 60_000);
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
  await assertRateLimit(`buyer-profile-view:${seller.id}`, 120, 60 * 60_000);
  const buyer = await prisma.buyerProfile.findFirst({
    where: { id: buyerProfileId, visibilityStatus: "ACTIVE", user: { status: "ACTIVE" }, ...activePrimaryServiceAreaWhere() },
    select: sellerBuyerSelect(),
  });
  if (!buyer) throw new Error("Buyer profile not found.");
  if (await usersHaveMessagingBlock(prisma, seller.id, buyer.userId)) {
    throw new Error("Buyer profile not found.");
  }
  const isDemo = await isControlledDemoBuyerProfile(buyer.id);
  await auditSecurityEvent(seller, "buyer_profile_view", "buyer_profile", buyer.id);
  return { ok: true, data: sellerBuyerDetail(buyer, seller.id, isDemo) };
}

export async function getAuthorizedBuyerProfile(buyerProfileId: string) {
  const user = await requireAuthenticatedUser();
  await assertRateLimit(`buyer-profile-view:${user.id}`, 120, 60 * 60_000);
  const buyer = await prisma.buyerProfile.findFirst({
    where: { id: buyerProfileId, visibilityStatus: "ACTIVE", user: { status: "ACTIVE" }, ...activePrimaryServiceAreaWhere() },
    select: sellerBuyerSelect(),
  });

  if (buyer) {
    if (await usersHaveMessagingBlock(prisma, user.id, buyer.userId)) {
      await auditSecurityEvent(user, "blocked_buyer_profile_view", "buyer_profile", buyer.id);
      return { ok: false as const, error: "NOT_FOUND" as const };
    }
    if (!(await canViewBuyerProfile(user, buyer.userId))) {
      await auditSecurityEvent(user, "blocked_buyer_profile_view", "buyer_profile", buyer.id);
      return { ok: false as const, error: "UNAUTHORIZED" as const };
    }

    await auditSecurityEvent(user, "buyer_profile_view", "buyer_profile", buyer.id);
    const isDemo = await isControlledDemoBuyerProfile(buyer.id);
    return {
      ok: true,
      data: {
        ...sellerBuyerDetail(buyer, user.id, isDemo),
        viewerCanInvite: user.id !== buyer.userId && (await canViewBuyerDirectory(user)),
        viewerIsOwner: user.id === buyer.userId,
      },
    };
  }
  return { ok: false as const, error: "NOT_FOUND" as const };
}

async function isControlledDemoBuyerProfile(buyerProfileId: string) {
  return await prisma.adminAuditLog.count({
    where: { action: "seed_demo_buyer", targetId: buyerProfileId, targetType: "buyer_profile" },
  }) > 0;
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
      providerPropertyId: data.providerPropertyId,
      price: data.price,
      propertyType: data.propertyType,
      squareFeet: data.squareFeet,
      state: data.state,
      zip: data.zip,
      status: "DRAFT",
      authorityAttestedAt: new Date(),
      authorityAttestedByUserId: seller.id,
      authorityAttestedIdentityVersion: 1,
      attestationVersion: "v1-property-authority-2026-07",
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
  const property = await prisma.$transaction(async (tx) => {
    const existing = await tx.sellerProperty.findFirst({
      where: { id: data.propertyId, ownerUserId: seller.id },
      select: { id: true },
    });
    if (!existing) throw new Error("Property not found.");
    const updated = await tx.sellerProperty.update({
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
        providerPropertyId: data.providerPropertyId,
        price: data.price,
        propertyType: data.propertyType,
        squareFeet: data.squareFeet,
        state: data.state,
        zip: data.zip,
      },
      select: { identityVersion: true },
    });
    return tx.sellerProperty.update({
      where: { id: data.propertyId },
      data: {
        authorityAttestedAt: new Date(),
        authorityAttestedByUserId: seller.id,
        authorityAttestedIdentityVersion: updated.identityVersion,
        attestationVersion: "v1-property-authority-2026-07",
      },
    });
  });
  await auditSecurityEvent(seller, "property_authority_reattested", "seller_property", property.id, {
    identityVersion: property.identityVersion,
  });
  return { ok: true, data: propertyFromDb(property) };
}

export async function sendInvite(input: unknown) {
  const seller = await requireApprovedSellerAccess();
  await assertRateLimit(`invite-send:${seller.id}`, 30, 60 * 60_000);
  const data = sendInviteSchema.parse(normalizeInput(input));
  const openingTemplate = resolveMessagingTemplate({
    key: data.templateKey,
    role: "SELLER",
    use: "OPENING",
    version: data.templateVersion,
  });
  const openingNote = data.note ? normalizeMessageBody(data.note) : undefined;
  const inviteMessage = openingNote ? `${openingTemplate.text}\n\n${openingNote}` : openingTemplate.text;
  const inviteTitle = "Private property invitation";
  const result = await prisma.$transaction(async (tx) => {
    await tx.$queryRaw`
      SELECT pg_advisory_xact_lock(hashtextextended(${seller.id}::text, 0)) IS NULL AS locked
    `;
    const [buyer, property, sentInviteCount, activeDuplicate, access] = await Promise.all([
      tx.buyerProfile.findFirst({
        where: {
          id: data.buyerProfileId,
          visibilityStatus: "ACTIVE",
          user: { status: "ACTIVE" },
          ...activePrimaryServiceAreaWhere(),
        },
        select: sellerBuyerSelect(),
      }),
      tx.sellerProperty.findFirst({ where: { id: data.propertyId, ownerUserId: seller.id } }),
      tx.invite.count({
        where: { sellerId: seller.id, sentAt: { gte: new Date(Date.now() - 86_400_000) } },
      }),
      tx.invite.findFirst({
        where: {
          buyerProfileId: data.buyerProfileId,
          propertyId: data.propertyId,
          sellerId: seller.id,
          status: { in: ["SENT", "VIEWED", "ACCEPTED"] },
        },
        select: { id: true },
      }),
      tx.sellerAccess.findFirst({ where: { userId: seller.id, status: "APPROVED" }, select: { id: true } }),
    ]);
    if (!access) throw new Error("Seller directory access must be approved before sending invites.");
    if (!buyer) throw messagingInviteUnavailable();
    await lockAndAssertInvitePairAvailable(tx, seller.id, buyer.userId);
    if (!property) throw new Error("Seller must own property before sending invites.");
    if (buyer.userId === seller.id) throw new Error("Sellers cannot invite their own buyer profile.");
    if (
      property.flaggedForReviewAt
      || property.status !== "READY_FOR_INVITES"
      || property.ownershipVerificationStatus !== "APPROVED"
      || property.authorityAttestedByUserId !== seller.id
      || property.authorityAttestedIdentityVersion !== property.identityVersion
    ) {
      throw new Error("Property must have current ownership approval before sending invites.");
    }
    if (activeDuplicate) throw new Error("An active invite already exists for this buyer and property.");
    if (sentInviteCount >= 25) throw new Error("Seller rolling 24-hour invite limit reached.");

    const created = await tx.invite.create({
      data: {
        buyerProfileId: data.buyerProfileId,
        message: inviteMessage,
        openingNote,
        openingTemplateKey: openingTemplate.key,
        openingTemplateVersion: openingTemplate.version,
        propertyId: data.propertyId,
        propertyIdentityVersion: property.identityVersion,
        sellerId: seller.id,
        title: inviteTitle,
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
        property: {
          select: {
            addressLine1: true,
            city: true,
            identityVersion: true,
            ownershipVerificationStatus: true,
            propertyType: true,
            state: true,
          },
        },
      },
    });
    await tx.notification.create({
      data: {
        body: "A seller sent a property invite.",
        metadata: { inviteId: created.id, propertyId: created.propertyId },
        title: inviteTitle,
        type: "invite_received",
        userId: created.buyerProfile.userId,
      },
    });
    await tx.notification.create({
      data: {
        body: "Your manual invite was sent to the buyer.",
        metadata: { buyerProfileId: created.buyerProfileId, inviteId: created.id, propertyId: created.propertyId },
        title: inviteTitle,
        type: "invite_sent",
        userId: seller.id,
      },
    });
    await tx.emailOutbox.create({
      data: {
        idempotencyKey: `invite-email:${created.id}`,
        inviteId: created.id,
        payload: {},
        status: "PENDING",
        subject: "You have a Liber invitation",
        templateName: "invite",
        to: created.buyerProfile.user.email,
        type: "INVITE",
      },
    });
    await tx.adminAuditLog.create({
      data: {
        action: "invite_sent",
        actorUserId: seller.id,
        metadata: { buyerProfileId: created.buyerProfileId, propertyId: created.propertyId },
        targetId: created.id,
        targetType: "invite",
      },
    });
    const [conversation] = await tx.$queryRaw<Array<{ id: string }>>`
      SELECT conversation.id
      FROM public."Conversation" conversation
      WHERE conversation."inviteId" = ${created.id}
        AND (
          SELECT count(*)
          FROM public."ConversationParticipant" participant
          WHERE participant."conversationId" = conversation.id
        ) = 2
        AND (
          SELECT count(*)
          FROM public."ConversationParticipant" participant
          WHERE participant."conversationId" = conversation.id
            AND participant."userId" = ${seller.id}::uuid
            AND participant.role = 'SELLER'::public."ConversationParticipantRole"
        ) = 1
        AND (
          SELECT count(*)
          FROM public."ConversationParticipant" participant
          WHERE participant."conversationId" = conversation.id
            AND participant."userId" = ${created.buyerProfile.userId}::uuid
            AND participant.role = 'BUYER'::public."ConversationParticipantRole"
        ) = 1
        AND (
          SELECT count(*)
          FROM public."Message" message
          WHERE message."conversationId" = conversation.id
            AND message.kind = 'INVITE'::public."MessageKind"
        ) = 1
    `;
    if (!conversation) throw new Error("Invite conversation trigger did not create a conversation.");
    return { conversationId: conversation.id, created };
  });
  const email: EmailResult = { provider: "outbox", queued: true };
  const conversationAvailable = messagingV1EnabledForPair(seller.id, result.created.buyerProfile.userId);
  return {
    ok: true,
    data: {
      ...inviteFromDb({ ...result.created, conversation: { id: result.conversationId } }),
      conversationAvailable,
      conversationId: conversationAvailable ? result.conversationId : undefined,
      email,
    },
  };
}
export async function listSellerInvites() {
  const seller = await requireCurrentUser("SELLER");
  const invites = await prisma.invite.findMany({
    where: { sellerId: seller.id },
    include: {
      buyerProfile: { select: { displayName: true, userId: true } },
      conversation: {
        select: {
          id: true,
          messages: inviteModerationMessages,
        },
      },
      property: { select: { addressLine1: true, city: true, identityVersion: true, ownershipVerificationStatus: true, propertyType: true } },
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
  await assertRateLimit(`admin-review:${admin.id}`, 120, 60 * 60_000);
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
      conversation: {
        select: {
          messages: inviteModerationMessages,
        },
      },
      property: { select: { addressLine1: true, city: true, identityVersion: true, ownershipVerificationStatus: true, propertyType: true } },
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
      property: {
        select: {
          addressLine1: true,
          authorityAttestedByUserId: true,
          authorityAttestedIdentityVersion: true,
          city: true,
          identityVersion: true,
          ownerUserId: true,
          propertyType: true,
        },
      },
      user: { select: { email: true, name: true } },
    },
    orderBy: { createdAt: "desc" },
  });
  const reviewableDocuments = documents.filter((document) =>
    document.documentType !== "OWNERSHIP"
    || (
      document.property
      && document.propertyIdentityVersion === document.property.identityVersion
      && document.property.authorityAttestedIdentityVersion === document.property.identityVersion
      && document.property.authorityAttestedByUserId === document.property.ownerUserId
    ));
  const documentsWithUrls = await Promise.all(
    reviewableDocuments.map(async (document) => ({
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
      ownershipEvidenceKind: document.ownershipEvidenceKind,
      status: "Pending",
    })),
  };
}

export async function reviewDocument(input: unknown) {
  const admin = await requireCurrentUser("ADMIN");
  await assertRateLimit(`admin-review:${admin.id}`, 120, 60 * 60_000);
  const data = reviewDocumentSchema.parse(normalizeInput(input));
  await prisma.$transaction(async (tx) => {
    const document = await tx.verificationDocument.findUnique({
      where: { id: data.documentId },
    });
    if (!document || document.reviewStatus !== "PENDING") {
      throw new Error("Document has already been reviewed.");
    }
    if (document.documentType === "OWNERSHIP" && document.propertyId) {
      await tx.$queryRaw`SELECT id FROM public."SellerProperty" WHERE id = ${document.propertyId} FOR UPDATE`;
      const property = await tx.sellerProperty.findUnique({
        where: { id: document.propertyId },
        select: {
          authorityAttestedByUserId: true,
          authorityAttestedIdentityVersion: true,
          identityVersion: true,
          ownerUserId: true,
        },
      });
      if (!property || document.propertyIdentityVersion !== property.identityVersion) {
        throw new Error("Property identity changed after this evidence was uploaded.");
      }
      if (
        property.authorityAttestedIdentityVersion !== property.identityVersion
        || property.authorityAttestedByUserId !== property.ownerUserId
      ) {
        throw new Error("The seller must attest to the current property identity before review.");
      }
    }

    const reviewedDocument = await tx.verificationDocument.update({
      where: { id: data.documentId },
      data: {
        rejectionReason: data.decision === "REJECTED" ? data.rejectionReason : null,
        reviewedAt: new Date(),
        reviewedByUserId: admin.id,
        reviewNotes: data.rejectionReason,
        reviewChecklist: {
          identityMatchesOwner: data.identityMatchesOwner ?? false,
          authorityConfirmed: data.authorityConfirmed ?? false,
          addressMatchesProperty: data.addressMatchesProperty ?? false,
          ownerOrEntityMatches: data.ownerOrEntityMatches ?? false,
        },
        reviewStatus: data.decision,
      },
    });

    if (reviewedDocument.documentType === "OWNERSHIP" && reviewedDocument.propertyId) {
      if (data.decision === "APPROVED" && reviewedDocument.ownershipEvidenceKind === "GOVERNMENT_ID"
        && (!data.identityMatchesOwner || !data.authorityConfirmed)) {
        throw new Error("Confirm identity match and seller authority before approving government ID evidence.");
      }
      if (data.decision === "APPROVED" && reviewedDocument.ownershipEvidenceKind === "PROPERTY_ADDRESS_PROOF"
        && (!data.addressMatchesProperty || !data.ownerOrEntityMatches)) {
        throw new Error("Confirm address and owner/entity match before approving address evidence.");
      }
      const ownershipDocuments = await tx.verificationDocument.findMany({
        where: {
          documentType: "OWNERSHIP",
          propertyId: reviewedDocument.propertyId,
          propertyIdentityVersion: reviewedDocument.propertyIdentityVersion,
          reviewStatus: "APPROVED",
        },
        select: {
          id: true,
          ownershipEvidenceKind: true,
        },
      });
      const governmentId = ownershipDocuments.find((item) => item.ownershipEvidenceKind === "GOVERNMENT_ID");
      const addressEvidence = ownershipDocuments.find((item) => item.ownershipEvidenceKind === "PROPERTY_ADDRESS_PROOF");
      if (governmentId && addressEvidence && reviewedDocument.propertyIdentityVersion) {
        const checklist = {
          governmentIdApproved: true,
          addressEvidenceApproved: true,
          identityMatchesOwner: true,
          authorityConfirmed: true,
          addressMatchesProperty: true,
          ownerOrEntityMatches: true,
        };
        await tx.propertyVerificationDecision.upsert({
          where: {
            propertyId_propertyIdentityVersion: {
              propertyId: reviewedDocument.propertyId,
              propertyIdentityVersion: reviewedDocument.propertyIdentityVersion,
            },
          },
          update: {
            addressEvidenceDocumentId: addressEvidence.id,
            checklist,
            decision: "APPROVED",
            governmentIdDocumentId: governmentId.id,
            reviewerUserId: admin.id,
            reviewedAt: new Date(),
          },
          create: {
            addressEvidenceDocumentId: addressEvidence.id,
            checklist,
            decision: "APPROVED",
            governmentIdDocumentId: governmentId.id,
            id: `property_decision_${crypto.randomUUID()}`,
            propertyId: reviewedDocument.propertyId,
            propertyIdentityVersion: reviewedDocument.propertyIdentityVersion,
            reviewerUserId: admin.id,
          },
        });
        await tx.sellerProperty.update({
          where: { id: reviewedDocument.propertyId },
          data: { ownershipVerificationStatus: "APPROVED", status: "READY_FOR_INVITES" },
        });
      } else {
        await tx.sellerProperty.update({
          where: { id: reviewedDocument.propertyId },
          data: {
            ownershipVerificationStatus: data.decision === "REJECTED" ? "REJECTED" : "PENDING",
            status: data.decision === "REJECTED" ? "DRAFT" : "READY_FOR_REVIEW",
          },
        });
      }
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
  await assertRateLimit(`admin-review:${admin.id}`, 120, 60 * 60_000);
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
      if (!evidenceSupportsBadge(data.badgeType, evidenceDocument.documentType)) {
        throw new Error("Approved evidence is not compatible with this badge.");
      }
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
  await assertRateLimit(`admin-moderation:${admin.id}`, 30, 60 * 60_000);
  const data = userModerationSchema.parse(normalizeInput(input));
  if (data.userId === admin.id) throw new Error("Admins cannot suspend their own account.");
  const operationId = `authop_${crypto.randomUUID()}`;
  await prisma.$transaction(async (tx) => {
    await tx.user.update({
      where: { id: data.userId },
      data: { status: "SUSPENDED", suspendedAt: new Date() },
    });
    await tx.buyerProfile.updateMany({
      where: { userId: data.userId },
      data: { visibilityStatus: "SUSPENDED" },
    });
    await tx.sellerAccess.updateMany({
      where: { userId: data.userId },
      data: { status: "SUSPENDED" },
    });
    await tx.sellerProperty.updateMany({
      where: { ownerUserId: data.userId },
      data: { flaggedForReviewAt: new Date(), status: "ARCHIVED" },
    });
    await tx.invite.updateMany({
      where: {
        OR: [
          { sellerId: data.userId },
          { buyerProfile: { userId: data.userId } },
        ],
        status: { in: ["SENT", "VIEWED", "ACCEPTED"] },
      },
      data: { status: "WITHDRAWN" },
    });
    await tx.authOperation.upsert({
      where: { idempotencyKey: `ban-user:${data.userId}` },
      update: {},
      create: {
        id: operationId,
        idempotencyKey: `ban-user:${data.userId}`,
        status: "PENDING",
        type: "BAN_USER",
        userId: data.userId,
      },
    });
    await tx.adminAuditLog.create({
      data: {
        action: "suspend_user",
        actorUserId: admin.id,
        metadata: { reason: data.reason, authOperationId: operationId },
        targetId: data.userId,
        targetType: "user",
      },
    });
  });
  return { ok: true, data };
}

export async function hideBuyerProfile(input: unknown) {
  const admin = await requireCurrentUser("ADMIN");
  const data = buyerProfileModerationSchema.parse(normalizeInput(input));
  await prisma.$transaction([
    prisma.buyerProfile.update({
      where: { id: data.buyerProfileId },
      data: { visibilityStatus: "HIDDEN" },
    }),
    prisma.adminAuditLog.create({
      data: {
        action: "hide_buyer_profile",
        actorUserId: admin.id,
        metadata: { reason: data.reason },
        targetId: data.buyerProfileId,
        targetType: "buyer_profile",
      },
    }),
  ]);
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
  const labels: Record<string, string> = {
    PRE_APPROVED: "Admin-verified pre-approval",
    VERIFIED_IDENTITY: "Verified identity",
    VERIFIED_FUNDS: "Verified funds",
    CASH_BUYER: "Cash buyer",
  };
  return labels[type] ?? "Unsupported legacy badge";
}
