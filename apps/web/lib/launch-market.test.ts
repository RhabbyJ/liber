import { describe, expect, it } from "vitest";
import { buyers } from "./mock-data";
import { findServiceArea } from "./service-areas";
import { approximateBuyerPoint, isActiveServiceAreaZip } from "./launch-market";

describe("Los Angeles service-area market helpers", () => {
  it("recognizes supported service-area ZIPs and neighborhoods", () => {
    expect(isActiveServiceAreaZip("91423")).toBe(true);
    expect(isActiveServiceAreaZip("91325")).toBe(true);
    expect(findServiceArea("Northridge")?.slug).toBe("northridge");
    expect(findServiceArea("91325")?.type).toBe("zip");
    expect(findServiceArea("Studio City")?.slug).toBe("91604");
  });

  it("uses approximate buyer points for seller-facing map pins", () => {
    const point = approximateBuyerPoint(buyers[0]);

    expect(point).toEqual({ lat: 34.233923, lng: -118.519279 });
    expect(point).not.toEqual({ lat: buyers[0].lat, lng: buyers[0].lng });
  });

  it("falls back to rounded coordinates for broad unsupported buyer geography", () => {
    const point = approximateBuyerPoint(buyers[2]);

    expect(point).toEqual({ lat: 34.05, lng: -118.24 });
  });
});
