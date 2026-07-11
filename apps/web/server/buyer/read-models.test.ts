import { describe, expect, it } from "vitest";
import { sellerBuyerSummary, type SellerBuyerRow } from "./read-models";

const authUserId = "11111111-1111-1111-1111-111111111111";

function row(): SellerBuyerRow {
  return {
    id: "buyer-profile-public-id",
    userId: authUserId,
    displayName: "Maple Haven",
    buyerType: "Cash",
    bio: "Buyer detail",
    buyingPurpose: "House",
    budgetMin: 700000 as never,
    budgetMax: 900000 as never,
    downPaymentMin: 200000 as never,
    downPaymentMax: 300000 as never,
    lastRefreshedAt: new Date("2026-07-10T00:00:00Z"),
    updatedAt: new Date("2026-07-10T00:00:00Z"),
    user: { avatarVariant: "fox" },
    badges: [{ badgeType: "VERIFIED_FUNDS", expiresAt: null }],
    criteria: [{
      bathroomsMin: 2,
      bedroomsMin: 3,
      condition: "Move-in ready",
      features: ["Garage"],
      lotSizeMax: null,
      lotSizeMin: null,
      priceMax: 900000 as never,
      priceMin: 700000 as never,
      propertyCategory: "HOME",
      propertySubtype: "HOME",
      squareFeetMax: null,
      squareFeetMin: 1500,
      yearBuiltMin: null,
    }],
    desiredServiceAreas: [{
      serviceArea: {
        centerLat: 34.2,
        centerLng: -118.5,
        city: "Northridge",
        label: "91325",
        market: { slug: "los-angeles" },
        postalCode: "91325",
        slug: "91325",
        state: "CA",
        type: "zip",
      },
    }],
  };
}

describe("seller buyer read model", () => {
  it("serializes a narrow seller-safe response", () => {
    const dto = sellerBuyerSummary(row(), "different-seller-id");
    const serialized = JSON.stringify(dto);
    expect(serialized).not.toContain(authUserId);
    for (const forbidden of ["userId", "serviceAreaId", "criteriaId", "storagePath", "desiredLat", "desiredLng"]) {
      expect(serialized).not.toContain(`"${forbidden}"`);
    }
    expect(dto).toMatchObject({
      avatarSeed: "buyer-profile-public-id",
      badges: [
        { type: "VERIFIED_FUNDS", status: "active" },
        { type: "CASH_BUYER", status: "active" },
      ],
      canInvite: true,
      marketSlug: "los-angeles",
      serviceAreaSlug: "91325",
      visibility: "active",
    });
    expect(dto.lat).not.toBe(34.2);
    expect(dto.lng).not.toBe(-118.5);
  });
});
