import { describe, expect, it } from "vitest";
import { buyers } from "./mock-data";
import { approximateBuyerPoint, findPilotArea, isActivePilotZip } from "./launch-market";

describe("San Fernando Valley pilot market helpers", () => {
  it("recognizes supported service-area ZIPs and neighborhoods", () => {
    expect(isActivePilotZip("91423")).toBe(true);
    expect(isActivePilotZip("91325")).toBe(true);
    expect(findPilotArea("Northridge")?.slug).toBe("northridge");
    expect(findPilotArea("91325")?.type).toBe("zip");
  });

  it("uses approximate buyer points for seller-facing map pins", () => {
    const point = approximateBuyerPoint(buyers[0]);

    expect(point).toEqual({ lat: 34.233923, lng: -118.536252 });
    expect(point).not.toEqual({ lat: buyers[0].lat, lng: buyers[0].lng });
  });
});
