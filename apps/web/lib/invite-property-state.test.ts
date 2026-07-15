import { describe, expect, it } from "vitest";
import type { SellerPropertyDTO } from "./marketplace-dtos";
import { sellerInvitePropertyState } from "./invite-property-state";

function property(overrides: Partial<SellerPropertyDTO> = {}): SellerPropertyDTO {
  return {
    id: "property-1",
    title: "123 Main Street",
    location: "Glendale, CA",
    price: 750_000,
    propertyType: "HOME",
    condition: "",
    features: [],
    description: "",
    status: "Ownership not submitted",
    lifecycleStatus: "DRAFT",
    identityVersion: 1,
    ...overrides,
  };
}

describe("sellerInvitePropertyState", () => {
  it("distinguishes a missing property from an existing property that needs evidence", () => {
    expect(sellerInvitePropertyState([])).toEqual({ kind: "missing" });
    expect(sellerInvitePropertyState([property()])).toMatchObject({
      kind: "blocked",
      property: { id: "property-1" },
      reason: "needs-evidence",
    });
  });

  it("returns every invite-ready property for the compose form", () => {
    const first = property({ id: "ready-1", lifecycleStatus: "READY_FOR_INVITES", status: "Ownership verified" });
    const second = property({ id: "ready-2", lifecycleStatus: "READY_FOR_INVITES", status: "Ownership verified" });

    expect(sellerInvitePropertyState([first, property({ id: "draft" }), second])).toEqual({
      kind: "ready",
      property: first,
      readyProperties: [first, second],
    });
  });

  it("prefers an active blocked property over an archived property", () => {
    expect(sellerInvitePropertyState([
      property({ id: "archived", lifecycleStatus: "ARCHIVED" }),
      property({ id: "pending", lifecycleStatus: "READY_FOR_REVIEW", status: "Ownership pending" }),
    ])).toMatchObject({
      kind: "blocked",
      property: { id: "pending" },
      reason: "review-pending",
    });
  });
});
