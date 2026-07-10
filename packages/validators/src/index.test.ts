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

const buyerSnapshot = {
  buyerType: "Conventional financing",
  buyingPurpose: "Townhouse",
  desiredMarketSlug: "los-angeles",
  desiredServiceAreaSlug: "91325",
} as const;

describe("Liber validators", () => {
  it("requires every buyer publication snapshot field that defines eligibility", () => {
    expect(() => publishBuyerProfileSchema.parse({})).toThrow();
    expect(() => publishBuyerProfileSchema.parse({
      buyerType: "Cash",
      desiredMarketSlug: "los-angeles",
      desiredServiceAreaSlug: "90001",
    })).toThrow();
  });

  it("turns omitted or blank optional buyer fields into explicit nulls", () => {
    expect(publishBuyerProfileSchema.parse({
      ...buyerSnapshot,
      bio: "   ",
      squareFeetMin: "   ",
    })).toMatchObject({
      bathroomsMin: null,
      bedroomsMin: null,
      bio: null,
      budgetMax: null,
      budgetMin: null,
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

  it("accepts custom buyer money and size values without pilot caps", () => {
    expect(publishBuyerProfileSchema.parse({
      ...buyerSnapshot,
      budgetMax: "4987654",
      budgetMin: "731249",
      downPaymentMax: "1223457",
      downPaymentMin: "123456",
      lotSizeMax: "28765",
      lotSizeMin: "7654",
      squareFeetMax: "8345",
      squareFeetMin: "1234",
    })).toMatchObject({
      budgetMax: 4987654,
      budgetMin: 731249,
      downPaymentMax: 1223457,
      downPaymentMin: 123456,
      lotSizeMax: 28765,
      lotSizeMin: 7654,
      squareFeetMax: 8345,
      squareFeetMin: 1234,
    });
  });

  it("rejects reversed buyer snapshot ranges", () => {
    expect(() => publishBuyerProfileSchema.parse({
      ...buyerSnapshot,
      budgetMax: 780000,
      budgetMin: 960000,
    })).toThrow("Budget minimum cannot exceed budget maximum.");
    expect(() => publishBuyerProfileSchema.parse({
      ...buyerSnapshot,
      lotSizeMax: 5000,
      lotSizeMin: 6000,
    })).toThrow("Lot size minimum cannot exceed lot size maximum.");
  });

  it("allowlists buyer intent, geography slugs, and server-controlled fields", () => {
    expect(() => publishBuyerProfileSchema.parse({ ...buyerSnapshot, buyingPurpose: "Rental" })).toThrow();
    expect(() => publishBuyerProfileSchema.parse({ ...buyerSnapshot, buyerType: "Investor" })).toThrow();
    expect(() => publishBuyerProfileSchema.parse({ ...buyerSnapshot, desiredServiceAreaSlug: "../91325" })).toThrow();
    const parsed = publishBuyerProfileSchema.parse({
      ...buyerSnapshot,
      displayName: "Maple Haven",
      visibilityStatus: "HIDDEN",
    });
    expect(parsed).not.toHaveProperty("displayName");
    expect(parsed).not.toHaveProperty("visibilityStatus");
  });

  it("requires accepted terms for invite sending", () => {
    expect(() => sendInviteSchema.parse({
      buyerProfileId: "buyer-1",
      message: "This looks aligned.",
      propertyId: "property-1",
      termsAccepted: false,
      title: "Fit",
    })).toThrow();
  });

  it("keeps seller property input structured", () => {
    const property = createSellerPropertySchema.parse({
      bedrooms: "4",
      features: ["Garage"],
      ownershipConfirmed: true,
      price: "4925000",
      propertyType: "CONDO",
    });
    expect(property).toMatchObject({ bedrooms: 4, price: 4925000, propertyType: "CONDO" });
  });

  it("rejects seller property creation without ownership confirmation", () => {
    expect(() => createSellerPropertySchema.parse({
      price: "925000",
      propertyType: "HOME",
    })).toThrow();
  });

  it("requires a market and strips legacy location matching keys from seller search", () => {
    expect(() => searchBuyersSchema.parse({})).toThrow();
    expect(searchBuyersSchema.parse({
      centerLat: 34.2381,
      centerLng: -118.5301,
      city: "Glendale",
      market: "los-angeles",
      radiusMiles: 10,
      state: "AZ",
    })).toEqual({
      amenities: [],
      badges: [],
      market: "los-angeles",
      pageSize: 24,
      sort: "recommended",
    });
  });

  it("coerces seller search numbers and bounds page size", () => {
    expect(searchBuyersSchema.parse({
      bathrooms: "2",
      bedrooms: "7",
      market: "los-angeles",
      pageSize: "100",
      squareFeet: "8500",
    })).toMatchObject({ bathrooms: 2, bedrooms: 7, pageSize: 100, squareFeet: 8500 });
    expect(() => searchBuyersSchema.parse({ market: "los-angeles", pageSize: 101 })).toThrow();
  });

  it("allowlists seller filters and rejects reversed budgets", () => {
    expect(searchBuyersSchema.parse({
      amenities: ["Pool", "ADU"],
      badges: ["PRE_APPROVED"],
      condition: "Fixer",
      market: "los-angeles",
      serviceArea: "northridge",
      sort: "most_verified",
    })).toMatchObject({
      amenities: ["Pool", "ADU"],
      badges: ["PRE_APPROVED"],
      condition: "Fixer",
      serviceArea: "northridge",
      sort: "most_verified",
    });
    expect(() => searchBuyersSchema.parse({ market: "los-angeles", serviceArea: "../northridge" })).toThrow();
    expect(() => searchBuyersSchema.parse({ amenities: ["Elevator"], market: "los-angeles" })).toThrow();
    expect(() => searchBuyersSchema.parse({
      budgetMax: 900000,
      budgetMin: 1200000,
      market: "los-angeles",
    })).toThrow("Budget minimum cannot exceed budget maximum.");
  });

  it("validates structured ownership-document review input", () => {
    expect(reviewDocumentSchema.parse({
      decision: "APPROVED",
      documentId: "doc-1",
      ownershipEvidenceKind: "PROPERTY_ADDRESS_PROOF",
    })).toMatchObject({
      decision: "APPROVED",
      ownershipEvidenceKind: "PROPERTY_ADDRESS_PROOF",
    });
    expect(() => reviewDocumentSchema.parse({
      decision: "APPROVED",
      documentId: "doc-1",
      ownershipEvidenceKind: "TITLE_MATCH",
    })).toThrow();
  });

  it("validates badge evidence and seller-access admin decisions", () => {
    expect(grantBadgeSchema.parse({
      badgeType: "VERIFIED_FUNDS",
      buyerProfileId: "buyer-1",
      evidenceDocumentId: "doc-1",
    })).toMatchObject({ badgeType: "VERIFIED_FUNDS", evidenceDocumentId: "doc-1" });
    expect(sellerAccessReviewSchema.parse({ userId: "seller-1", status: "APPROVED" }).status).toBe("APPROVED");
    expect(() => sellerAccessReviewSchema.parse({ userId: "seller-1", status: "ACTIVE" })).toThrow();
  });
});
