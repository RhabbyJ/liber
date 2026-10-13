import { describe, expect, it } from "vitest";
import { groupMapPoints } from "./map-point-groups";

describe("area-center marker groups", () => {
  it("keeps all buyers accessible at their unchanged area center", () => {
    const points = [
      { id: "first", lat: 34.174435, lng: -118.610821294697 },
      { id: "second", lat: 34.174435, lng: -118.610821294697 },
      { id: "other-zip", lat: 34.1393405, lng: -118.389809919573 },
    ];
    const groups = groupMapPoints(points);
    expect(groups).toHaveLength(2);
    expect(groups[0]).toEqual({ lat: points[0].lat, lng: points[0].lng, points: points.slice(0, 2) });
    expect(groupMapPoints([...points].reverse()).find((group) => group.points.length === 2))
      .toMatchObject({ lat: points[0].lat, lng: points[0].lng });
    expect(groupMapPoints([points[0]])[0]).toMatchObject({ lat: points[0].lat, lng: points[0].lng });
  });

  it("does not merge nearby distinct centers and ignores invalid points", () => {
    expect(groupMapPoints([
      { lat: 34.2, lng: -118.5 }, { lat: 34.200001, lng: -118.5 }, { lat: NaN, lng: -118.5 },
    ])).toHaveLength(2);
  });
});
