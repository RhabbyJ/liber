import { describe, expect, it } from "vitest";
import { buyers } from "./mock-data";
import { approximateBuyerPoint, findPilotArea, isActivePilotZip } from "./launch-market";

describe("San Fernando Valley pilot market helpers", () => {
  it("distinguishes active pilot ZIPs from next-market ZIPs", () => {
    expect(isActivePilotZip("91423")).toBe(true);
    expect(isActivePilotZip("91324")).toBe(false);
    expect(findPilotArea("Northridge 91324")).toBeNull();
    expect(findPilotArea("Northridge 91324", { includeNext: true })?.status).toBe("next");
  });

  it("uses approximate buyer points for seller-facing map pins", () => {
    const point = approximateBuyerPoint(buyers[0]);

    expect(point).toEqual({ lat: 34.241, lng: -118.5504 });
    expect(point).not.toEqual({ lat: buyers[0].lat, lng: buyers[0].lng });
  });
});
