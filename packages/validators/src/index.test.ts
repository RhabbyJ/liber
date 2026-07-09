import { describe, expect, it } from "vitest";
import {
  createBuyerProfileSchema,
  createSellerPropertySchema,
  grantBadgeSchema,
  reviewDocumentSchema,
  searchBuyersSchema,
  sellerAccessReviewSchema,
  sendInviteSchema,
  updateBuyerProfileSchema,
  upsertBuyerCriteriaSchema,
} from "./index";

describe("Liber validators", () => {
  it("rejects reversed buyer budget ranges", () => {
    expect(() =>
      createBuyerProfileSchema.parse({
        budgetMin: 960000,
        budgetMax: 780000,
      }),
    ).toThrow("Budget minimum cannot exceed budget maximum.");
  });

  it("does not allow buyers to self-assign admin-controlled visibility states", () => {
    expect(() =>
      createBuyerProfileSchema.parse({
        visibilityStatus: "HIDDEN",
      }),
    ).toThrow();
  });

  it("keeps buyer profile property intent allowlisted", () => {
    expect(createBuyerProfileSchema.parse({
      buyerType: "Conventional financing",
      buyingPurpose: "Townhouse",
    })).toMatchObject({
      buyerType: "Conventional financing",
      buyingPurpose: "Townhouse",
    });

    expect(() =>
      createBuyerProfileSchema.parse({
        buyingPurpose: "Rental",
      }),
    ).toThrow();

    expect(() =>
      createBuyerProfileSchema.parse({
        buyerType: "Investor",
      }),
    ).toThrow();
  });

  it("strips public alias from buyer profile API input", () => {
    expect(createBuyerProfileSchema.parse({ displayName: "Maple Haven" })).not.toHaveProperty("displayName");
    expect(updateBuyerProfileSchema.parse({ displayName: "Maple Haven" })).not.toHaveProperty("displayName");
  });

  it("keeps omitted buyer update visibility unchanged", () => {
    expect(updateBuyerProfileSchema.parse({ buyerType: "Cash" })).not.toHaveProperty("visibilityStatus");
    expect(() =>
      updateBuyerProfileSchema.parse({
        budgetMin: 960000,
        budgetMax: 780000,
      }),
    ).toThrow("Budget minimum cannot exceed budget maximum.");
  });

  it("allows custom buyer budget and down payment amounts", () => {
    expect(updateBuyerProfileSchema.parse({
      budgetMax: "987654",
      budgetMin: "731249",
      desiredNeighborhood: "Northridge",
      desiredPostalCode: "91325",
      downPaymentMax: "223457",
      downPaymentMin: "123456",
    })).toMatchObject({
      budgetMax: 987654,
      budgetMin: 731249,
      desiredNeighborhood: "Northridge",
      desiredPostalCode: "91325",
      downPaymentMax: 223457,
      downPaymentMin: 123456,
    });
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

  it("rejects reversed searchable criteria ranges", () => {
    expect(() =>
      upsertBuyerCriteriaSchema.parse({
        buyerProfileId: "buyer-1",
        propertySubtype: "HOME",
        squareFeetMin: 2000,
        squareFeetMax: 1000,
      }),
    ).toThrow("Square feet minimum cannot exceed square feet maximum.");

    // Non-residential subtypes are out of v1 scope.
    expect(() =>
      upsertBuyerCriteriaSchema.parse({
        buyerProfileId: "buyer-1",
        propertySubtype: "MULTIFAMILY",
      }),
    ).toThrow();
  });

  it("allows custom square footage and lot size amounts", () => {
    expect(upsertBuyerCriteriaSchema.parse({
      buyerProfileId: "buyer-1",
      lotSizeMax: "8765",
      lotSizeMin: "7654",
      propertySubtype: "TOWNHOUSE",
      squareFeetMax: "2345",
      squareFeetMin: "1234",
    })).toMatchObject({
      lotSizeMax: 8765,
      lotSizeMin: 7654,
      propertySubtype: "TOWNHOUSE",
      squareFeetMax: 2345,
      squareFeetMin: 1234,
    });
  });

  it("validates search, document review, and badge admin inputs", () => {
    expect(searchBuyersSchema.parse({ badges: ["PRE_APPROVED"], sort: "most_verified" }).badges).toEqual([
      "PRE_APPROVED",
    ]);
    expect(() => searchBuyersSchema.parse({ radiusMiles: 10 })).toThrow("Radius search requires latitude and longitude.");
    expect(searchBuyersSchema.parse({ centerLat: 34.2381, centerLng: -118.5301, radiusMiles: 10 }).radiusMiles).toBe(10);
    expect(searchBuyersSchema.parse({ serviceArea: "northridge" }).serviceArea).toBe("northridge");
    expect(() => searchBuyersSchema.parse({ serviceArea: "../northridge" })).toThrow();
    expect(searchBuyersSchema.parse({ bedrooms: "4", bathrooms: "2" })).toMatchObject({
      bathrooms: 2,
      bedrooms: 4,
    });
    expect(searchBuyersSchema.parse({ amenities: ["Pool", "ADU"], condition: "Fixer" })).toMatchObject({
      amenities: ["Pool", "ADU"],
      condition: "Fixer",
    });
    expect(searchBuyersSchema.parse({ budgetMin: "900000", budgetMax: "1200000" })).toMatchObject({
      budgetMax: 1200000,
      budgetMin: 900000,
    });
    expect(() => searchBuyersSchema.parse({ budgetMin: "1200000", budgetMax: "900000" })).toThrow(
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
