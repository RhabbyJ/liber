import { describe, expect, it } from "vitest";
import type { Buyer } from "../lib/mock-data";
import { buyers, invites, properties } from "../lib/mock-data";
import {
  assertInviteAllowed,
  assertRouteAllowed,
  countSellerInvitesToday,
  hasActiveBadge,
  UNVERIFIED_SELLER_INVITE_LIMIT_PER_DAY,
  VERIFIED_SELLER_INVITE_LIMIT_PER_DAY,
  sellerInviteLimitForProperty,
  searchBuyerDirectory,
} from "./domain";

describe("seller buyer search", () => {
  it("only returns active buyer profiles", () => {
    const results = searchBuyerDirectory({});

    expect(results.map((buyer) => buyer.id)).toContain("julie-p");
    expect(results.map((buyer) => buyer.id)).not.toContain("draft-buyer");
  });

  it("filters by active badges and ignores expired badges", () => {
    const expiredBadgeBuyer = buyers.find((buyer) => buyer.id === "draft-buyer") as Buyer;

    expect(hasActiveBadge(expiredBadgeBuyer, "PRE_APPROVED")).toBe(false);
    expect(searchBuyerDirectory({ badges: ["PRE_APPROVED"], sort: "recently_active" }).map((buyer) => buyer.id)).toEqual([
      "julie-p",
      "asha-k",
    ]);
  });

  it("does not use legacy city, coordinate, or radius query keys", () => {
    const baseline = searchBuyerDirectory({}).map((buyer) => buyer.id);
    const results = searchBuyerDirectory({
      centerLat: 33.5387,
      centerLng: -112.186,
      city: "Glendale",
      radiusMiles: 1,
      state: "AZ",
    });

    expect(results.map((buyer) => buyer.id)).toEqual(baseline);
  });

  it("filters by the expanded v1 property subtype choices", () => {
    const condoBuyer: Buyer = {
      ...buyers[0],
      criteria: ["Condo", "Northridge"],
      criteriaDetails: [{
        propertyCategory: "HOME",
        propertySubtype: "CONDO",
      }],
      id: "condo-buyer",
      propertySubtypes: ["CONDO"],
      purpose: "Condo",
    };

    expect(searchBuyerDirectory({ propertySubtype: "CONDO" }, [condoBuyer]).map((buyer) => buyer.id)).toEqual([
      "condo-buyer",
    ]);
    expect(searchBuyerDirectory({ propertySubtype: "LAND" }, [condoBuyer])).toEqual([]);
  });

  it("filters by supported service area slug", () => {
    expect(searchBuyerDirectory({ serviceArea: "91325" }).map((buyer) => buyer.id)).toContain("julie-p");
    expect(searchBuyerDirectory({ serviceArea: "northridge" }).map((buyer) => buyer.id)).toContain("julie-p");
    expect(searchBuyerDirectory({ serviceArea: "glendale" }).map((buyer) => buyer.id)).not.toContain("julie-p");
  });

  it("uses persisted service-area slugs before legacy location text", () => {
    const studioCityBuyer: Buyer = {
      ...buyers[0],
      city: "Burbank",
      id: "studio-city-selected",
      location: "Burbank, CA",
      postalCode: "91502",
      serviceAreaSlugs: ["91604"],
    };

    expect(searchBuyerDirectory({ serviceArea: "91604" }, [studioCityBuyer]).map((buyer) => buyer.id)).toEqual([
      "studio-city-selected",
    ]);
    expect(searchBuyerDirectory({ serviceArea: "burbank" }, [studioCityBuyer])).toEqual([]);
  });

  it("returns no buyers for unsupported service area slugs", () => {
    expect(searchBuyerDirectory({ serviceArea: "san-diego" })).toEqual([]);
  });

  it("filters by structured property fit criteria", () => {
    expect(searchBuyerDirectory({ bedrooms: 3 }).map((buyer) => buyer.id)).not.toContain("julie-p");
    expect(searchBuyerDirectory({ bedrooms: 4 }).map((buyer) => buyer.id)).toContain("julie-p");
    expect(searchBuyerDirectory({ bedrooms: 4 }).map((buyer) => buyer.id)).not.toContain("asha-k");
    expect(searchBuyerDirectory({ bedrooms: 5 }).map((buyer) => buyer.id)).toContain("asha-k");
  });

  it("filters by amenity needs and condition preference", () => {
    const fixerWithPool: Buyer = {
      ...buyers[0],
      id: "fixer-with-pool",
      criteria: ["Pool"],
      criteriaDetails: [{
        propertyCategory: "HOME",
        propertySubtype: "HOME",
        condition: "Fixer",
        features: ["Pool"],
      }],
    };
    const moveInReadyWithPool: Buyer = {
      ...fixerWithPool,
      id: "move-in-ready-with-pool",
      criteriaDetails: [{
        propertyCategory: "HOME",
        propertySubtype: "HOME",
        condition: "Move-in ready",
        features: ["Pool"],
      }],
    };

    const results = searchBuyerDirectory(
      { amenities: ["Pool"], condition: "Fixer" },
      [fixerWithPool, moveInReadyWithPool],
    );

    expect(results.map((buyer) => buyer.id)).toEqual(["fixer-with-pool"]);
  });

  it("filters by budget range overlap", () => {
    expect(searchBuyerDirectory({ budgetMin: 1_000_000 }).map((buyer) => buyer.id)).not.toContain("julie-p");
    expect(searchBuyerDirectory({ budgetMin: 1_000_000 }).map((buyer) => buyer.id)).toContain("marcus-r");
    expect(searchBuyerDirectory({ budgetMin: 1_000_000, budgetMax: 1_500_000 }).map((buyer) => buyer.id)).toEqual([
      "marcus-r",
    ]);
  });

  it("excludes the current seller's own buyer profile", () => {
    const results = searchBuyerDirectory({}, buyers, { excludeUserId: "user-marcus" });

    expect(results.map((buyer) => buyer.id)).not.toContain("marcus-r");
    expect(results.map((buyer) => buyer.id)).toContain("julie-p");
  });
});

describe("route and invite authorization", () => {
  it("blocks private routes without a matching role", () => {
    expect(() => assertRouteAllowed("/seller/search", { id: "buyer-fixture", roles: ["BUYER"] })).toThrow(
      "Missing required role",
    );
    expect(() => assertRouteAllowed("/admin", { id: "seller-fixture", roles: ["SELLER"] })).toThrow(
      "Missing required role",
    );
    expect(() => assertRouteAllowed("/seller/search", { id: "admin-fixture", roles: ["ADMIN"] })).toThrow(
      "Missing required role",
    );
  });

  it("requires authentication for protected buyer, seller, and admin routes", () => {
    expect(() => assertRouteAllowed("/buyer/profile", null)).toThrow("Authentication required.");
    expect(() => assertRouteAllowed("/buyers/julie-p", null)).toThrow("Authentication required.");
    expect(() => assertRouteAllowed("/seller/search", null)).toThrow("Authentication required.");
    expect(() => assertRouteAllowed("/admin/users", null)).toThrow("Authentication required.");
  });

  it("allows authenticated cross-role buyer profile route entry before profile-level checks", () => {
    expect(() => assertRouteAllowed("/buyers/julie-p", { id: "seller-fixture", roles: ["SELLER"] })).not.toThrow();
    expect(() => assertRouteAllowed("/buyers/julie-p", { id: "buyer-fixture", roles: ["BUYER"] })).not.toThrow();
  });

  it("requires seller-owned property before sending invites", () => {
    const buyer = buyers[0];
    const property = properties[0];

    expect(() =>
      assertInviteAllowed({
        seller: { id: "other-seller", roles: ["SELLER"] },
        buyer,
        property,
        sentInviteCountToday: 0,
      }),
    ).toThrow("Resource is not owned");
  });

  it("allows owned-property invites and blocks hidden buyers", () => {
    const property = properties[0];

    expect(() =>
      assertInviteAllowed({
        seller: { id: "seller-fixture", roles: ["SELLER"] },
        buyer: buyers[0],
        property,
        sentInviteCountToday: 0,
      }),
    ).not.toThrow();

    expect(() =>
      assertInviteAllowed({
        seller: { id: "seller-fixture", roles: ["SELLER"] },
        buyer: buyers.find((buyer) => buyer.id === "draft-buyer") as Buyer,
        property,
        sentInviteCountToday: 0,
      }),
    ).toThrow("Buyer profile must be active");
  });

  it("blocks sellers from inviting their own buyer profile", () => {
    const property = properties[0];
    const ownBuyer = { ...buyers[0], userId: "seller-fixture" };

    expect(() =>
      assertInviteAllowed({
        seller: { id: "seller-fixture", roles: ["SELLER"] },
        buyer: ownBuyer,
        property,
        sentInviteCountToday: 0,
      }),
    ).toThrow("Sellers cannot invite their own buyer profile.");
  });

  it("counts seller invite volume by seller and day", () => {
    const today = new Date("2026-05-20T12:00:00.000Z");

    expect(countSellerInvitesToday("seller-fixture", invites, today)).toBe(1);
    expect(countSellerInvitesToday("other-seller", invites, today)).toBe(0);
    expect(() =>
      assertInviteAllowed({
        seller: { id: "seller-fixture", roles: ["SELLER"] },
        buyer: buyers[0],
        property: properties[0],
        sentInviteCountToday: UNVERIFIED_SELLER_INVITE_LIMIT_PER_DAY,
      }),
    ).toThrow("Seller invite rate limit reached.");
  });

  it("uses lower invite limits until property ownership is verified", () => {
    expect(sellerInviteLimitForProperty(properties[0])).toBe(UNVERIFIED_SELLER_INVITE_LIMIT_PER_DAY);
    expect(
      sellerInviteLimitForProperty({
        ...properties[0],
        status: "Ownership verified",
      }),
    ).toBe(VERIFIED_SELLER_INVITE_LIMIT_PER_DAY);
  });
});
