import { describe, expect, it } from "vitest";
import {
  classifyAuthIdentity,
  normalizeIdentityEmail,
  rolesAfterSelfSelection,
} from "../lib/auth-identity";

const linkedUser = {
  email: "buyer@example.test",
  id: "11111111-1111-4111-8111-111111111111",
  roles: ["BUYER"] as const,
  status: "ACTIVE" as const,
};

describe("auth identity ownership", () => {
  it("links only the same UUID with the same normalized email", () => {
    expect(
      classifyAuthIdentity(
        { email: " Buyer@Example.Test ", id: linkedUser.id },
        { ...linkedUser, roles: [...linkedUser.roles] },
        { id: linkedUser.id },
      ),
    ).toEqual({ kind: "linked", user: { ...linkedUser, roles: [...linkedUser.roles] } });
  });

  it("treats an email owned by another UUID as recovery, never as a link", () => {
    expect(
      classifyAuthIdentity(
        { email: linkedUser.email, id: "22222222-2222-4222-8222-222222222222" },
        null,
        { id: linkedUser.id },
      ),
    ).toEqual({ kind: "collision" });
  });

  it("rejects a same-UUID record whose Auth email does not match", () => {
    expect(
      classifyAuthIdentity(
        { email: "other@example.test", id: linkedUser.id },
        { ...linkedUser, roles: [...linkedUser.roles] },
        null,
      ),
    ).toEqual({ kind: "collision" });
  });

  it("fails closed when the Auth UUID has no application identity", () => {
    expect(
      classifyAuthIdentity(
        { email: "new@example.test", id: "33333333-3333-4333-8333-333333333333" },
        null,
        null,
      ),
    ).toEqual({ kind: "missing" });
  });

  it("normalizes email only for collision comparison", () => {
    expect(normalizeIdentityEmail(" Buyer@Example.Test ")).toBe("buyer@example.test");
    expect(normalizeIdentityEmail(null)).toBe("");
  });

  it("adds only buyer/seller roles without replacing the locked current set", () => {
    expect(rolesAfterSelfSelection(["ADMIN"], ["SELLER"], "merge")).toEqual([
      "ADMIN",
      "SELLER",
    ]);
    expect(rolesAfterSelfSelection(["ADMIN"], ["BUYER"], "initialize")).toEqual([
      "ADMIN",
    ]);
    expect(rolesAfterSelfSelection([], ["BUYER", "SELLER"], "initialize")).toEqual([
      "BUYER",
      "SELLER",
    ]);
  });

  it("rejects ADMIN from every customer role-selection caller", () => {
    expect(() => rolesAfterSelfSelection([], ["ADMIN"], "merge")).toThrow(
      "ADMIN cannot be assigned",
    );
  });
});
