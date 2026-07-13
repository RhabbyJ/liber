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

  it("returns role mismatches to the user's existing workspace", () => {
    expect(pathForSignedInAuthIntent({ id: "buyer", roles: ["BUYER"] }, { next: "/seller/search" })).toBe(
      "/buyer/profile",
    );
  });

  it("returns roleless identities to the public entry point without an auth loop", () => {
    expect(pathForSignedInAuthIntent({ id: "roleless", roles: [] }, { next: "/buyer/profile" })).toBe("/");
  });

  it("treats the removed role page as a stale auth-flow destination", () => {
    expect(pathForSignedInAuthIntent({ id: "buyer", roles: ["BUYER"] }, { next: "/onboarding/role" })).toBe(
      "/buyer/profile",
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

  it("returns a signed-in user to a query-scoped homepage demand preview", () => {
    expect(
      pathForSignedInAuthIntent(
        { id: "buyer", roles: ["BUYER"] },
        { next: "/?market=los-angeles&area=encino" },
      ),
    ).toBe("/?market=los-angeles&area=encino");
  });

  it("treats buyer profile routes as authenticated cross-role destinations", () => {
    expect(pathForSignedInAuthIntent({ id: "seller", roles: ["SELLER"] }, { next: "/buyers/profile-1" })).toBe(
      "/buyers/profile-1",
    );
    expect(pathForSignedInAuthIntent({ id: "buyer", roles: ["BUYER"] }, { next: "/buyers/profile-1" })).toBe(
      "/buyers/profile-1",
    );
  });
});
