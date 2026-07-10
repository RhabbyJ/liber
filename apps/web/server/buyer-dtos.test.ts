import { Decimal } from "@prisma/client/runtime/client";
import { describe, expect, it } from "vitest";
import {
  approximatePublicPin,
  publicPreviewBuyerSelect,
  publicPreviewBuyerWhere,
  sellerProfileBuyerSelect,
  sellerSearchBuyerSelect,
  sellerVisibleBuyerWhere,
  toPublicBuyerPreviewDto,
  toSellerBuyerProfileDto,
  toSellerSearchBuyerDto,
  type PublicPreviewBuyerRow,
  type SellerProfileBuyerRow,
  type SellerSearchBuyerRow,
} from "./buyer-dtos";

const now = new Date("2026-07-09T12:00:00.000Z");
const viewerUserId = "22222222-2222-4222-8222-222222222222";

const serviceArea = {
  serviceArea: {
    active: true,
    centerLat: 34.1467,
    centerLng: -118.433314,
    city: "Sherman Oaks",
    label: "Sherman Oaks",
    market: { active: true },
    state: "CA",
    type: "neighborhood",
  },
};

const publicRow: PublicPreviewBuyerRow = {
  badges: [{ badgeType: "PRE_APPROVED" }, { badgeType: "VERIFIED_FUNDS" }],
  budgetMax: new Decimal(1_240_000),
  budgetMin: new Decimal(810_000),
  buyerType: "Conventional financing",
  buyingPurpose: "House",
  criteria: [{
    bathroomsMin: 2,
    bedroomsMin: 3,
    condition: "Move-in ready",
    features: ["Garage", "Pool", "private note"],
    squareFeetMin: 1800,
  }],
  desiredServiceAreas: [serviceArea],
  user: { status: "ACTIVE" },
  visibilityStatus: "ACTIVE",
};

const searchRow: SellerSearchBuyerRow = {
  badges: [
    { badgeType: "PRE_APPROVED", expiresAt: new Date("2026-08-08T12:00:00.000Z") },
    { badgeType: "VERIFIED_FUNDS", expiresAt: null },
    { badgeType: "CASH_BUYER", expiresAt: new Date("2026-07-08T12:00:00.000Z") },
  ],
  budgetMax: new Decimal(1_240_000),
  budgetMin: new Decimal(810_000),
  buyerType: "Conventional financing",
  buyingPurpose: "House",
  criteria: [{
    bathroomsMin: 2,
    bedroomsMin: 3,
    condition: "Move-in ready",
    features: ["Garage", "Pool", "private note"],
    lotSizeMax: 8000,
    lotSizeMin: 5000,
    propertyCategory: "HOME",
    propertySubtype: "HOME",
    squareFeetMax: 2600,
    squareFeetMin: 1800,
    yearBuiltMin: 1980,
  }],
  desiredServiceAreas: [serviceArea],
  displayName: "Maple Haven",
  downPaymentMax: new Decimal(300_000),
  downPaymentMin: new Decimal(180_000),
  id: "buyer-profile-1",
  lastRefreshedAt: new Date("2026-07-08T12:00:00.000Z"),
  updatedAt: new Date("2026-07-07T12:00:00.000Z"),
  user: { avatarVariant: "avatarka:animals:3", status: "ACTIVE" },
  userId: "11111111-1111-4111-8111-111111111111",
  visibilityStatus: "ACTIVE",
};

const profileRow: SellerProfileBuyerRow = {
  badges: searchRow.badges,
  budgetMax: searchRow.budgetMax,
  budgetMin: searchRow.budgetMin,
  buyerType: searchRow.buyerType,
  buyingPurpose: searchRow.buyingPurpose,
  criteria: searchRow.criteria,
  desiredServiceAreas: searchRow.desiredServiceAreas,
  displayName: searchRow.displayName,
  downPaymentMax: searchRow.downPaymentMax,
  downPaymentMin: searchRow.downPaymentMin,
  id: searchRow.id,
  user: searchRow.user,
  userId: searchRow.userId,
  visibilityStatus: searchRow.visibilityStatus,
};

describe("buyer response contracts", () => {
  it("snapshots serialized public, seller-search, and seller-profile boundaries", () => {
    const publicPreview = toPublicBuyerPreviewDto(publicRow, 0);
    const searchBuyer = toSellerSearchBuyerDto(searchRow, viewerUserId, now);
    const response = serialized({
      publicPreview: publicPreview ? [publicPreview] : [],
      sellerProfile: {
        data: toSellerBuyerProfileDto(profileRow, viewerUserId, true, now),
        ok: true,
      },
      sellerSearch: {
        items: searchBuyer ? [searchBuyer] : [],
        pageInfo: {
          hasMore: false,
          nextCursor: null,
          pageSize: 24,
          snapshotAt: now.toISOString(),
        },
      },
    });

    expect(response).toMatchSnapshot();
    expectNoForbiddenFields(response);
  });

  it("keeps a seller's own demand visible but non-invitable", () => {
    const buyer = toSellerSearchBuyerDto(searchRow, searchRow.userId, now);
    expect(buyer).not.toBeNull();
    expect(buyer?.canInvite).toBe(false);
  });
});

describe("buyer response eligibility", () => {
  it("requires active users, profiles, markets, and areas", () => {
    expect(toPublicBuyerPreviewDto({ ...publicRow, user: { status: "SUSPENDED" } }, 0)).toBeNull();
    expect(toPublicBuyerPreviewDto({ ...publicRow, visibilityStatus: "DRAFT" }, 0)).toBeNull();
    expect(toPublicBuyerPreviewDto(withPublicAreaState(false, true), 0)).toBeNull();
    expect(toPublicBuyerPreviewDto(withPublicAreaState(true, false), 0)).toBeNull();
    expect(toSellerSearchBuyerDto({ ...searchRow, visibilityStatus: "HIDDEN" }, viewerUserId, now)).toBeNull();
    expect(toSellerBuyerProfileDto({ ...profileRow, user: { ...profileRow.user, status: "SUSPENDED" } }, viewerUserId, true, now)).toBeNull();
  });

  it("requires explicitly approved public preview fields", () => {
    expect(toPublicBuyerPreviewDto({ ...publicRow, buyerType: "Investor" }, 0)).toBeNull();
    expect(toPublicBuyerPreviewDto({ ...publicRow, buyingPurpose: "Any property" }, 0)).toBeNull();
  });

  it("builds narrow active-state selectors", () => {
    const previewWhere = publicPreviewBuyerWhere("los-angeles", ["area-91423"]);
    expect(previewWhere).toMatchObject({
      user: { is: { status: "ACTIVE" } },
      visibilityStatus: "ACTIVE",
    });
    expect(previewWhere).not.toHaveProperty("userId");
    expect(sellerVisibleBuyerWhere("los-angeles")).toMatchObject({
      user: { is: { status: "ACTIVE" } },
      visibilityStatus: "ACTIVE",
    });
    for (const select of [
      publicPreviewBuyerSelect(now),
      sellerSearchBuyerSelect(now),
      sellerProfileBuyerSelect(now),
    ]) {
      expect(select.badges.where).toEqual({
        status: "ACTIVE",
        OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
      });
    }
  });

  it("accepts valid service-area centers on zero latitude or longitude", () => {
    expect(approximatePublicPin({ lat: 0, lng: 0 }, 0)).toEqual({
      latitude: 0,
      longitude: 0.008,
    });
    expect(approximatePublicPin({ lat: Number.NaN, lng: 0 }, 0)).toBeNull();
  });
});

function withPublicAreaState(areaActive: boolean, marketActive: boolean): PublicPreviewBuyerRow {
  return {
    ...publicRow,
    desiredServiceAreas: [{
      serviceArea: {
        ...serviceArea.serviceArea,
        active: areaActive,
        market: { active: marketActive },
      },
    }],
  };
}

function serialized<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

const forbiddenKeys = new Set([
  "id",
  "userId",
  "name",
  "displayName",
  "email",
  "phone",
  "contact",
  "bio",
  "criteriaId",
  "serviceAreaId",
  "desiredLat",
  "desiredLng",
  "lat",
  "lng",
  "centerLat",
  "centerLng",
  "documents",
  "verificationDocuments",
  "evidenceDocumentId",
  "storagePath",
  "path",
  "url",
]);

function expectNoForbiddenFields(value: unknown, location = "response") {
  if (Array.isArray(value)) {
    value.forEach((item, index) => expectNoForbiddenFields(item, `${location}[${index}]`));
    return;
  }
  if (!value || typeof value !== "object") return;

  for (const [key, nestedValue] of Object.entries(value)) {
    expect(forbiddenKeys.has(key), `${location}.${key} is forbidden`).toBe(false);
    expectNoForbiddenFields(nestedValue, `${location}.${key}`);
  }
}
