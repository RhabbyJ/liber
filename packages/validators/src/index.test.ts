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
        displayName: "Julie P.",
        budgetMin: 960000,
        budgetMax: 780000,
      }),
    ).toThrow("Budget minimum cannot exceed budget maximum.");
  });

  it("does not allow buyers to self-assign admin-controlled visibility states", () => {
    expect(() =>
      createBuyerProfileSchema.parse({
        displayName: "Julie P.",
        visibilityStatus: "HIDDEN",
      }),
    ).toThrow();
  });

  it("keeps omitted buyer update visibility unchanged", () => {
    expect(updateBuyerProfileSchema.parse({ displayName: "Julie P." })).not.toHaveProperty("visibilityStatus");
    expect(() =>
      updateBuyerProfileSchema.parse({
        displayName: "Julie P.",
        budgetMin: 960000,
        budgetMax: 780000,
      }),
    ).toThrow("Budget minimum cannot exceed budget maximum.");
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
      propertyType: "HOME",
      price: "925000",
      bedrooms: "4",
      features: ["Garage"],
    });

    expect(property.price).toBe(925000);
    expect(property.bedrooms).toBe(4);
  });

  it("rejects reversed searchable criteria ranges", () => {
    expect(() =>
      upsertBuyerCriteriaSchema.parse({
        buyerProfileId: "buyer-1",
        propertyCategory: "COMMERCIAL",
        propertySubtype: "MULTIFAMILY",
        squareFeetMin: 2000,
        squareFeetMax: 1000,
      }),
    ).toThrow("Square feet minimum cannot exceed square feet maximum.");

    expect(() =>
      upsertBuyerCriteriaSchema.parse({
        buyerProfileId: "buyer-1",
        propertyCategory: "COMMERCIAL",
        propertySubtype: "MULTIFAMILY",
        capRateMin: 8,
        capRateMax: 5,
      }),
    ).toThrow("Cap rate minimum cannot exceed cap rate maximum.");
  });

  it("validates search, document review, and badge admin inputs", () => {
    expect(searchBuyersSchema.parse({ badges: ["PRE_APPROVED"], sort: "most_verified" }).badges).toEqual([
      "PRE_APPROVED",
    ]);
    expect(() => searchBuyersSchema.parse({ radiusMiles: 10 })).toThrow("Radius search requires latitude and longitude.");
    expect(searchBuyersSchema.parse({ centerLat: 34.2381, centerLng: -118.5301, radiusMiles: 10 }).radiusMiles).toBe(10);
    expect(searchBuyersSchema.parse({ minReviews: "3" }).minReviews).toBe(3);
    expect(searchBuyersSchema.parse({ bedrooms: "4", bathrooms: "2", capRate: "5.5", units: "6" })).toMatchObject({
      bathrooms: 2,
      bedrooms: 4,
      capRate: 5.5,
      units: 6,
    });
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
