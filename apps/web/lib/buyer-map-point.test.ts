import { describe, expect, it } from "vitest";
import { approximateBuyerPoint } from "./buyer-map-point";
import { buyers } from "./mock-data";

describe("approximate buyer map points", () => {
  it("uses the canonical service-area center for seller-facing pins", () => {
    const point = approximateBuyerPoint(buyers[0]);

    expect(point).toEqual({ lat: 34.233923, lng: -118.519279 });
    expect(point).not.toEqual({ lat: buyers[0].lat, lng: buyers[0].lng });
  });

  it("fails closed when canonical service-area geography is missing", () => {
    expect(approximateBuyerPoint(buyers[2])).toBeNull();
  });
});
