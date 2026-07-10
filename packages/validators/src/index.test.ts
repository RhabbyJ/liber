import { describe, expect, it } from "vitest";
import {
  createSellerPropertySchema,
  grantBadgeSchema,
  publishBuyerProfileSchema,
  reviewDocumentSchema,
  searchBuyersSchema,
  sellerAccessReviewSchema,
  sendInviteSchema,
} from "./index";

describe("Liber validators", () => {
  it("parses buyer publication as a required full snapshot", () => {
    expect(() => publishBuyerProfileSchema.parse({})).toThrow();
    expect(() => publishBuyerProfileSchema.parse({
      buyerType: "Cash",
      desiredMarketSlug: "los-angeles",
      desiredServiceAreaSlug: "90001",
    })).toThrow();

    expect(publishBuyerProfileSchema.parse({
      bio: "   ",
      buyerType: "Cash",
      buyingPurpose: "Condo",
      desiredMarketSlug: "los-angeles",
      desiredServiceAreaSlug: "90001",
      squareFeetMin: "   ",
    })).toMatchObject({
      bathroomsMin: null,
      bedroomsMin: null,
      bio: null,
      budgetMax: null,
      budgetMin: null,
      buyingPurpose: "Condo",
      condition: null,
      downPaymentMax: null,
      downPaymentMin: null,
      features: [],
      lotSizeMax: null,
      lotSizeMin: null,
      squareFeetMax: null,
      squareFeetMin: null,
      yearBuiltMin: null,
    });
  });

  it("keeps the full buyer snapshot allowlisted and range-safe", () => {
    const base = {
      buyerType: "Conventional financing",
      buyingPurpose: "Townhouse",
      desiredMarketSlug: "los-angeles",
      desiredServiceAreaSlug: "91325",
    } as const;

    expect(publishBuyerProfileSchema.parse({
      ...base,
      budgetMax: "987654",
      budgetMin: "731249",
      downPaymentMax: "223457",
      downPaymentMin: "123456",
      lotSizeMax: "8765",
      lotSizeMin: "7654",
      squareFeetMax: "2345",
      squareFeetMin: "1234",
    })).toMatchObject({
      budgetMax: 987654,
      budgetMin: 731249,
      downPaymentMax: 223457,
      downPaymentMin: 123456,
      lotSizeMax: 8765,
      lotSizeMin: 7654,
      squareFeetMax: 2345,
      squareFeetMin: 1234,
    });

    expect(() =>
      publishBuyerProfileSchema.parse({
        ...base,
        buyingPurpose: "Rental",
      }),
    ).toThrow();

    expect(() =>
      publishBuyerProfileSchema.parse({
        ...base,
        buyerType: "Investor",
      }),
    ).toThrow();
    expect(() =>
      publishBuyerProfileSchema.parse({
        ...base,
        budgetMin: 960000,
        budgetMax: 780000,
      }),
    ).toThrow("Budget minimum cannot exceed budget maximum.");

    expect(() =>
      publishBuyerProfileSchema.parse({ ...base, desiredServiceAreaSlug: "../91325" }),
    ).toThrow();
    const stripped = publishBuyerProfileSchema.parse({
      ...base,
      displayName: "Maple Haven",
      visibilityStatus: "HIDDEN",
    });
    expect(stripped).not.toHaveProperty("displayName");
    expect(stripped).not.toHaveProperty("visibilityStatus");
  });

  it("requires accepted terms for invite sending", () => {
    expect(() =>
      sendInviteSchema.parse({
        buyerProfileId: "buyer-1",
        propertyId: "property-1",
        title: "Fit",
        message: "This looks aligned.",
        termsAccepted: false,
      }),
    ).toThrow();
  });

  it("keeps seller property input structured", () => {
    const property = createSellerPropertySchema.parse({
      propertyType: "CONDO",
      price: "925000",
      bedrooms: "4",
      features: ["Garage"],
      ownershipConfirmed: true,
    });

    expect(property.price).toBe(925000);
    expect(property.bedrooms).toBe(4);
    expect(property.propertyType).toBe("CONDO");
  });

  it("rejects property creation without ownership confirmation", () => {
    expect(() =>
      createSellerPropertySchema.parse({
        propertyType: "HOME",
        price: "925000",
      }),
    ).toThrow();
  });

  it("validates search, document review, and badge admin inputs", () => {
    const market = { market: "los-angeles" };
    expect(searchBuyersSchema.parse({ ...market, badges: ["PRE_APPROVED"], sort: "most_verified" }).badges).toEqual([
      "PRE_APPROVED",
    ]);
    expect(searchBuyersSchema.parse({
      ...market,
      centerLat: 34.2381,
      centerLng: -118.5301,
      city: "Glendale",
      radiusMiles: 10,
      state: "AZ",
    })).toEqual({
      amenities: [],
      badges: [],
      market: "los-angeles",
      pageSize: 24,
      sort: "recommended",
    });
    expect(searchBuyersSchema.parse({ ...market, serviceArea: "northridge" }).serviceArea).toBe("northridge");
    expect(() => searchBuyersSchema.parse({ ...market, serviceArea: "../northridge" })).toThrow();
    expect(searchBuyersSchema.parse({ ...market, bedrooms: "4", bathrooms: "2" })).toMatchObject({
      bathrooms: 2,
      bedrooms: 4,
    });
    expect(searchBuyersSchema.parse({ ...market, amenities: ["Pool", "ADU"], condition: "Fixer" })).toMatchObject({
      amenities: ["Pool", "ADU"],
      condition: "Fixer",
    });
    expect(searchBuyersSchema.parse({ ...market, pageSize: "100" }).pageSize).toBe(100);
    expect(() => searchBuyersSchema.parse({ ...market, pageSize: 101 })).toThrow();
    expect(() => searchBuyersSchema.parse({ ...market, amenities: ["Elevator"] })).toThrow();
    expect(searchBuyersSchema.parse({ ...market, budgetMin: "900000", budgetMax: "1200000" })).toMatchObject({
      budgetMax: 1200000,
      budgetMin: 900000,
    });
    expect(() => searchBuyersSchema.parse({ ...market, budgetMin: "1200000", budgetMax: "900000" })).toThrow(
      "Budget minimum cannot exceed budget maximum.",
    );
    expect(reviewDocumentSchema.parse({ documentId: "doc-1", decision: "APPROVED" }).decision).toBe("APPROVED");
    expect(grantBadgeSchema.parse({ buyerProfileId: "buyer-1", badgeType: "VERIFIED_FUNDS" }).badgeType).toBe(
      "VERIFIED_FUNDS",
    );
    expect(grantBadgeSchema.parse({
      badgeType: "VERIFIED_FUNDS",
      buyerProfileId: "buyer-1",
      evidenceDocumentId: "doc-1",
    }).evidenceDocumentId).toBe("doc-1");
    expect(sellerAccessReviewSchema.parse({ userId: "seller-1", status: "APPROVED" }).status).toBe("APPROVED");
    expect(() => sellerAccessReviewSchema.parse({ userId: "seller-1", status: "ACTIVE" })).toThrow();
  });
});
