import { describe, expect, it } from "vitest";
import {
  assertInviteAllowed,
  assertRouteAllowed,
  UNVERIFIED_SELLER_INVITE_LIMIT_PER_DAY,
  VERIFIED_SELLER_INVITE_LIMIT_PER_DAY,
  sellerInviteLimitForProperty,
} from "./domain";

const activeBuyer = { userId: "buyer-fixture", visibility: "active" } as const;
const draftBuyer = { userId: "draft-buyer-fixture", visibility: "draft" } as const;
const pendingProperty = {
  ownerUserId: "seller-fixture",
  ownershipVerificationStatus: "PENDING",
} as const;

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
    expect(() =>
      assertInviteAllowed({
        seller: { id: "other-seller", roles: ["SELLER"] },
        buyer: activeBuyer,
        property: pendingProperty,
        sentInviteCountToday: 0,
      }),
    ).toThrow("Seller must own property before sending invites.");
  });

  it("allows owned-property invites and blocks hidden buyers", () => {
    expect(() =>
      assertInviteAllowed({
        seller: { id: "seller-fixture", roles: ["SELLER"] },
        buyer: activeBuyer,
        property: pendingProperty,
        sentInviteCountToday: 0,
      }),
    ).not.toThrow();

    expect(() =>
      assertInviteAllowed({
        seller: { id: "seller-fixture", roles: ["SELLER"] },
        buyer: draftBuyer,
        property: pendingProperty,
        sentInviteCountToday: 0,
      }),
    ).toThrow("Buyer profile must be active");
  });

  it("blocks sellers from inviting their own buyer profile", () => {
    const ownBuyer = { ...activeBuyer, userId: "seller-fixture" };

    expect(() =>
      assertInviteAllowed({
        seller: { id: "seller-fixture", roles: ["SELLER"] },
        buyer: ownBuyer,
        property: pendingProperty,
        sentInviteCountToday: 0,
      }),
    ).toThrow("Sellers cannot invite their own buyer profile.");
  });

  it("enforces the unverified-property invite limit", () => {
    expect(() =>
      assertInviteAllowed({
        seller: { id: "seller-fixture", roles: ["SELLER"] },
        buyer: activeBuyer,
        property: pendingProperty,
        sentInviteCountToday: UNVERIFIED_SELLER_INVITE_LIMIT_PER_DAY,
      }),
    ).toThrow("Seller invite rate limit reached.");
  });

  it("uses lower invite limits until property ownership is verified", () => {
    expect(sellerInviteLimitForProperty(pendingProperty)).toBe(UNVERIFIED_SELLER_INVITE_LIMIT_PER_DAY);
    expect(
      sellerInviteLimitForProperty({
        ...pendingProperty,
        ownershipVerificationStatus: "APPROVED",
      }),
    ).toBe(VERIFIED_SELLER_INVITE_LIMIT_PER_DAY);
  });
});
