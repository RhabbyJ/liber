import { describe, expect, it } from "vitest";
import type { SellerBuyerSearchDto } from "./buyer-dto-types";
import { approximateBuyerPoint } from "./buyer-map-point";

describe("approximate buyer map points", () => {
  it("uses the canonical service-area center for seller-facing pins", () => {
    const buyer = {
      mapPoint: { latitude: 34.233923, longitude: -118.519279 },
    } as SellerBuyerSearchDto;
    const point = approximateBuyerPoint(buyer);

    expect(point).toEqual({ lat: 34.233923, lng: -118.519279 });
  });
});
