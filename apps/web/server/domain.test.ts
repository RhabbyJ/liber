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

  it("filters by city and property subtype", () => {
    const results = searchBuyerDirectory({ city: "Northridge", propertySubtype: "HOME" });

    expect(results).toHaveLength(1);
    expect(results[0]?.id).toBe("julie-p");
  });

  it("filters by minimum review count", () => {
    const results = searchBuyerDirectory({ minReviews: 5 });

    expect(results.map((buyer) => buyer.id)).toContain("marcus-r");
    expect(results.map((buyer) => buyer.id)).not.toContain("julie-p");
  });

  it("filters by structured property fit criteria", () => {
    expect(searchBuyerDirectory({ bedrooms: 3 }).map((buyer) => buyer.id)).not.toContain("julie-p");
    expect(searchBuyerDirectory({ bedrooms: 4 }).map((buyer) => buyer.id)).toContain("julie-p");
    expect(searchBuyerDirectory({ propertyCategory: "COMMERCIAL", capRate: 4 }).map((buyer) => buyer.id)).not.toContain("asha-k");
    expect(searchBuyerDirectory({ propertyCategory: "COMMERCIAL", capRate: 5, units: 5 }).map((buyer) => buyer.id)).not.toContain("asha-k");
    expect(searchBuyerDirectory({ propertyCategory: "COMMERCIAL", capRate: 5, units: 6 }).map((buyer) => buyer.id)).toContain("asha-k");
  });

  it("filters by radius when a coordinate center is supplied", () => {
    const results = searchBuyerDirectory({
      centerLat: 34.2381,
      centerLng: -118.5301,
      radiusMiles: 10,
    });

    expect(results.map((buyer) => buyer.id)).toContain("julie-p");
    expect(results.map((buyer) => buyer.id)).not.toContain("asha-k");
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
  });

  it("requires authentication for protected buyer, seller, and admin routes", () => {
    expect(() => assertRouteAllowed("/buyer/profile", null)).toThrow("Authentication required.");
    expect(() => assertRouteAllowed("/seller/search", null)).toThrow("Authentication required.");
    expect(() => assertRouteAllowed("/admin/users", null)).toThrow("Authentication required.");
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
