import { describe, expect, it } from "vitest";
import { sendInviteSchema } from "@liber/validators";
import { buyerLocationFromSelectedServiceArea } from "./canonical-buyer-location";
import { normalizeInput } from "./normalize-input";

describe("server contract input normalization", () => {
  it("preserves only the blank canonical buyer area as an explicit null", () => {
    const form = new FormData();
    form.set("buyerType", "Cash");
    form.set("bio", "");
    form.set("desiredLocationText", "");
    form.set("desiredCity", "");
    form.set("desiredNeighborhood", "");
    form.set("desiredPostalCode", "");
    form.set("desiredServiceAreaSlug", "");
    form.set("desiredState", "");
    form.set("desiredLat", "");
    form.set("desiredLng", "");

    expect(normalizeInput(form)).toEqual({
      buyerType: "Cash",
      desiredServiceAreaSlug: null,
    });
  });

  it("normalizes the invite template version from HTML FormData before strict validation", () => {
    const form = new FormData();
    form.set("buyerProfileId", "buyer-profile-1");
    form.set("propertyId", "property-1");
    form.set("templateKey", "SELLER_PRIVATE_VIEWING");
    form.set("templateVersion", "1");
    form.set("note", "");
    form.set("termsAccepted", "true");

    expect(sendInviteSchema.parse(normalizeInput(form))).toEqual({
      buyerProfileId: "buyer-profile-1",
      propertyId: "property-1",
      templateKey: "SELLER_PRIVATE_VIEWING",
      templateVersion: 1,
      termsAccepted: true,
    });
  });
});

describe("canonical buyer geography mapping", () => {
  it("derives all display data from the selected area", () => {
    const buyer = buyerLocationFromSelectedServiceArea({
      active: true,
      centerLat: 34.233923,
      centerLng: -118.519279,
      city: "Northridge",
      label: "91325",
      market: { active: true },
      postalCode: "91325",
      state: "CA",
      type: "zip",
    });

    expect(buyer).toMatchObject({
      city: "Northridge",
      lat: 34.233923,
      lng: -118.519279,
      location: "Northridge, CA 91325",
      postalCode: "91325",
      state: "CA",
    });
  });

  it("does not fall back to compatibility geography when no selection exists", () => {
    expect(buyerLocationFromSelectedServiceArea(null)).toMatchObject({
      active: false,
      city: "",
      lat: 0,
      lng: 0,
      location: "",
      state: "",
    });
  });
});
