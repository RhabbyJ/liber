import { describe, expect, it } from "vitest";
import { requiredRoleForPath, requiresAuthenticatedUser } from "./route-access";

describe("route access", () => {
  it("protects the messages inbox and thread without imposing a single role", () => {
    expect(requiresAuthenticatedUser("/messages")).toBe(true);
    expect(requiresAuthenticatedUser("/messages/00000000-0000-0000-0000-000000000001")).toBe(true);
    expect(requiredRoleForPath("/messages")).toBeNull();
  });

  it("does not match paths that only share the messages prefix", () => {
    expect(requiresAuthenticatedUser("/messages-archive")).toBe(false);
  });

  it("protects LOI negotiation pages without imposing one participant role", () => {
    expect(requiresAuthenticatedUser("/negotiations")).toBe(true);
    expect(requiresAuthenticatedUser("/negotiations/00000000-0000-4000-8000-000000000001")).toBe(true);
    expect(requiresAuthenticatedUser("/negotiations-archive")).toBe(false);
    expect(requiredRoleForPath("/negotiations/00000000-0000-4000-8000-000000000001")).toBeNull();
  });
});
