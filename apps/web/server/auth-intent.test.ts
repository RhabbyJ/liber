import { describe, expect, it } from "vitest";
import { pathForSignedInAuthIntent } from "./auth-intent";

describe("pathForSignedInAuthIntent", () => {
  it("does not send logged-in users back into auth flows", () => {
    expect(pathForSignedInAuthIntent({ id: "buyer", roles: ["BUYER"] }, { next: "/signup?role=buyer" })).toBe(
      "/buyer/profile",
    );
    expect(pathForSignedInAuthIntent({ id: "seller", roles: ["SELLER"] }, { next: "/login" })).toBe(
      "/seller/properties",
    );
  });

  it("sends role mismatches to onboarding instead of the protected destination", () => {
    expect(pathForSignedInAuthIntent({ id: "buyer", roles: ["BUYER"] }, { next: "/seller/search" })).toBe(
      "/onboarding/role?next=%2Fseller%2Fsearch",
    );
  });

  it("allows signed-in users to continue to matching role destinations", () => {
    expect(pathForSignedInAuthIntent({ id: "seller", roles: ["SELLER"] }, { next: "/seller/properties" })).toBe(
      "/seller/properties",
    );
    expect(pathForSignedInAuthIntent({ id: "buyer", roles: ["BUYER"] }, { next: "/buyer/profile" })).toBe(
      "/buyer/profile",
    );
  });
});
