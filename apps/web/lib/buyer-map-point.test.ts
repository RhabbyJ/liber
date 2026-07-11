import { describe, expect, it } from "vitest";
import { approximateBuyerPoint } from "./buyer-map-point";

describe("approximate buyer map points", () => {
  it("uses the canonical service-area center for seller-facing pins", () => {
    const buyer = {
      lat: 34.233923,
      lng: -118.519279,
      serviceAreaSlug: "northridge",
    };
    const point = approximateBuyerPoint(buyer);

    expect(point).toEqual({ lat: 34.233923, lng: -118.519279 });
  });
});
