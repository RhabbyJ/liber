import { describe, expect, it } from "vitest";
import { clusterBounds, clusterMarkerGroups } from "./map-marker-clusters";

const group = (lng: number, lat: number, count = 1) => ({ lat, lng, points: Array.from({ length: count }, (_, index) => index) });
// One degree is 100 screen pixels in this projection.
const project = ([lng, lat]: [number, number]) => ({ x: lng * 100, y: -lat * 100 });

describe("marker clustering", () => {
  it("combines overlapping centers at the busiest real center", () => {
    const quiet = group(0, 0, 1);
    const busy = group(0.2, 0.1, 3);
    const far = group(5, 5, 2);
    const clusters = clusterMarkerGroups([quiet, busy, far], project, 40);

    expect(clusters).toHaveLength(2);
    expect(clusters[0]).toMatchObject({ anchor: busy, count: 4 });
    expect(clusters[0].members).toEqual([busy, quiet]);
    expect(clusters[1]).toMatchObject({ anchor: far, count: 2, members: [far] });
  });

  it("splits apart once the zoom spreads the centers out", () => {
    const zoomedIn = ([lng, lat]: [number, number]) => ({ x: lng * 1000, y: -lat * 1000 });
    expect(clusterMarkerGroups([group(0, 0), group(0.2, 0.1)], zoomedIn, 40)).toHaveLength(2);
  });

  it("keeps member coordinates unchanged and bounds them for zooming", () => {
    const members = [group(-118.5, 34.2), group(-118.3, 34.1)];
    expect(clusterBounds(members)).toEqual([[-118.5, 34.1], [-118.3, 34.2]]);
    expect(members[0]).toMatchObject({ lat: 34.2, lng: -118.5 });
  });
});
