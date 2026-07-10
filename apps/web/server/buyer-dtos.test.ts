import { Decimal } from "@prisma/client/runtime/client";
import { describe, expect, it } from "vitest";
import {
  approximatePublicPin,
  publicPreviewBuyerWhere,
  publicPreviewBuyerSelect,
  sellerProfileBuyerSelect,
  sellerBuyerSearchResponse,
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
    postalCode: "91423",
    state: "CA",
    type: "neighborhood",
  },
};

const publicRow: PublicPreviewBuyerRow = {
  badges: [
    { badgeType: "PRE_APPROVED" },
    { badgeType: "VERIFIED_FUNDS" },
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
  it("snapshots the serialized homepage preview contract", () => {
    const preview = toPublicBuyerPreviewDto(publicRow, 0);
    const response = serialized(preview ? [preview] : []);

    expect(response).toMatchInlineSnapshot(`
      [
        {
          "amenities": [
            "Pool",
            "Garage",
          ],
          "area": "Sherman Oaks, CA",
          "badges": [
            "Pre-approved",
            "Verified funds",
          ],
          "bathroomsMin": 2,
          "bedroomsMin": 3,
          "budgetLabel": "$800K–$1.3M",
          "condition": "Move-in ready",
          "label": "House",
          "pin": {
            "latitude": 34.1467,
            "longitude": -118.425314,
          },
          "squareFeetMin": 1800,
        },
      ]
    `);
    expectNoForbiddenFields(response);
  });

  it("snapshots the serialized seller API contract", () => {
    const buyer = toSellerSearchBuyerDto(searchRow, viewerUserId, now);
    const response = serialized(sellerBuyerSearchResponse(buyer ? [buyer] : []));

    expect(response).toMatchInlineSnapshot(`
      {
        "buyers": [
          {
            "alias": "Maple Haven",
            "avatarVariant": "avatarka:animals:3",
            "badges": [
              {
                "expiresInDays": 30,
                "label": "Admin-verified pre-approval",
                "status": "active",
                "type": "PRE_APPROVED",
              },
              {
                "label": "Verified funds",
                "status": "active",
                "type": "VERIFIED_FUNDS",
              },
            ],
            "budgetMax": 1240000,
            "budgetMin": 810000,
            "buyerProfileId": "buyer-profile-1",
            "canInvite": true,
            "criteria": [
              {
                "bathroomsMin": 2,
                "bedroomsMin": 3,
                "condition": "Move-in ready",
                "features": [
                  "Garage",
                  "Pool",
                ],
                "lotSizeMax": 8000,
                "lotSizeMin": 5000,
                "propertyCategory": "HOME",
                "propertySubtype": "HOME",
                "squareFeetMax": 2600,
                "squareFeetMin": 1800,
                "yearBuiltMin": 1980,
              },
            ],
            "downPaymentMax": 300000,
            "downPaymentMin": 180000,
            "location": "Sherman Oaks, CA",
            "mapPoint": {
              "latitude": 34.1467,
              "longitude": -118.433314,
            },
            "propertyType": "House",
            "purchaseType": "Conventional financing",
            "refreshedAt": "2026-07-08",
          },
        ],
      }
    `);
    expectNoForbiddenFields(response);
  });

  it("keeps a seller's own active buyer demand visible but non-invitable", () => {
    const buyer = toSellerSearchBuyerDto(searchRow, searchRow.userId, now);

    expect(buyer).not.toBeNull();
    expect(buyer?.canInvite).toBe(false);
  });

  it("snapshots the serialized seller-view buyer profile contract", () => {
    const response = serialized({
      data: toSellerBuyerProfileDto(profileRow, viewerUserId, true, now),
      ok: true,
    });

    expect(response).toMatchInlineSnapshot(`
      {
        "data": {
          "alias": "Maple Haven",
          "avatarVariant": "avatarka:animals:3",
          "badges": [
            {
              "expiresInDays": 30,
              "label": "Admin-verified pre-approval",
              "status": "active",
              "type": "PRE_APPROVED",
            },
            {
              "label": "Verified funds",
              "status": "active",
              "type": "VERIFIED_FUNDS",
            },
          ],
          "budgetMax": 1240000,
          "budgetMin": 810000,
          "buyerProfileId": "buyer-profile-1",
          "downPaymentMax": 300000,
          "downPaymentMin": 180000,
          "location": "Sherman Oaks, CA",
          "needs": [
            "House",
            "Move-in ready",
            "1800+ sqft",
            "5000+ lot",
            "3+ bedrooms",
          ],
          "propertyType": "House",
          "purchaseType": "Conventional financing",
          "viewerCanInvite": true,
          "viewerIsOwner": false,
          "wants": [
            "2+ bathrooms",
            "Garage",
            "Pool",
          ],
        },
        "ok": true,
      }
    `);
    expectNoForbiddenFields(response);
  });
});

describe("buyer response eligibility", () => {
  it("requires active public state and explicitly approved preview values", () => {
    const cases: Array<[string, PublicPreviewBuyerRow]> = [
      ["suspended user", { ...publicRow, user: { status: "SUSPENDED" } }],
      ["hidden profile", { ...publicRow, visibilityStatus: "HIDDEN" }],
      ["draft profile", { ...publicRow, visibilityStatus: "DRAFT" }],
      ["suspended profile", { ...publicRow, visibilityStatus: "SUSPENDED" }],
      ["inactive area", withPublicAreaState({ areaActive: false })],
      ["inactive market", withPublicAreaState({ marketActive: false })],
      ["unapproved purchase type", { ...publicRow, buyerType: "Investor" }],
      ["unapproved property type", { ...publicRow, buyingPurpose: "Any property" }],
    ];

    for (const [label, row] of cases) {
      expect(toPublicBuyerPreviewDto(row, 0), label).toBeNull();
    }
  });

  it("fails seller search and seller profile DTOs closed for excluded states", () => {
    const searchCases: SellerSearchBuyerRow[] = [
      { ...searchRow, user: { ...searchRow.user, status: "SUSPENDED" } },
      { ...searchRow, visibilityStatus: "HIDDEN" },
      { ...searchRow, visibilityStatus: "DRAFT" },
      { ...searchRow, visibilityStatus: "SUSPENDED" },
      withSearchAreaState(false),
    ];
    const profileCases: SellerProfileBuyerRow[] = [
      { ...profileRow, user: { ...profileRow.user, status: "SUSPENDED" } },
      { ...profileRow, visibilityStatus: "HIDDEN" },
      { ...profileRow, visibilityStatus: "DRAFT" },
      { ...profileRow, visibilityStatus: "SUSPENDED" },
      { ...profileRow, desiredServiceAreas: withSearchAreaState(false).desiredServiceAreas },
    ];

    searchCases.forEach((row) => expect(toSellerSearchBuyerDto(row, viewerUserId, now)).toBeNull());
    profileCases.forEach((row) => expect(toSellerBuyerProfileDto(row, viewerUserId, true, now)).toBeNull());
  });

  it("builds query predicates with active-user, active-profile, canonical-area, and preview approval gates", () => {
    expect(publicPreviewBuyerWhere("los-angeles", ["area-91423"])).toMatchInlineSnapshot(`
      {
        "buyerType": {
          "in": [
            "Cash",
            "Conventional financing",
            "Other",
          ],
        },
        "buyingPurpose": {
          "in": [
            "House",
            "Condo",
            "Townhouse",
            "Manufactured",
            "Land",
          ],
        },
        "criteria": {
          "some": {},
        },
        "desiredServiceAreas": {
          "some": {
            "isPrimary": true,
            "serviceArea": {
              "active": true,
              "market": {
                "active": true,
                "slug": "los-angeles",
              },
            },
            "serviceAreaId": {
              "in": [
                "area-91423",
              ],
            },
            "source": "SELECTED",
          },
        },
        "user": {
          "is": {
            "status": "ACTIVE",
          },
        },
        "visibilityStatus": "ACTIVE",
      }
    `);
    expect(sellerVisibleBuyerWhere("los-angeles")).toMatchObject({
      user: { is: { status: "ACTIVE" } },
      visibilityStatus: "ACTIVE",
    });
    expect(sellerVisibleBuyerWhere("los-angeles")).not.toHaveProperty("userId");
    expect(publicPreviewBuyerSelect(now).badges.where).toEqual({
      status: "ACTIVE",
      OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
    });
    expect(sellerSearchBuyerSelect(now).badges.where).toEqual({
      status: "ACTIVE",
      OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
    });
    expect(sellerProfileBuyerSelect(now).badges.where).toEqual({
      status: "ACTIVE",
      OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
    });
  });

  it("accepts valid service-area centers on zero latitude or longitude", () => {
    expect(approximatePublicPin({ lat: 0, lng: 0 }, 0)).toEqual({
      latitude: 0,
      longitude: 0.008,
    });
    expect(approximatePublicPin({ lat: Number.NaN, lng: 0 }, 0)).toBeNull();
  });
});

function withPublicAreaState({
  areaActive = true,
  marketActive = true,
}: {
  areaActive?: boolean;
  marketActive?: boolean;
}): PublicPreviewBuyerRow {
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

function withSearchAreaState(active: boolean): SellerSearchBuyerRow {
  return {
    ...searchRow,
    desiredServiceAreas: [{
      serviceArea: {
        ...serviceArea.serviceArea,
        active,
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
