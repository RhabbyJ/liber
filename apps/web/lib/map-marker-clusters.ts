type CenterGroup = { lat: number; lng: number; points: readonly unknown[] };

export type MarkerCluster<G extends CenterGroup> = {
  /** The busiest real area center; clusters never sit at synthetic coordinates. */
  anchor: G;
  members: G[];
  count: number;
};

export const MARKER_CLUSTER_RADIUS_PX = 46;

/**
 * Combine area-center markers whose screen positions would overlap at the
 * current zoom. Each cluster stays anchored at one member's real center, and
 * every member keeps its own unchanged coordinates for when it splits apart.
 */
export function clusterMarkerGroups<G extends CenterGroup>(
  groups: readonly G[],
  project: (lngLat: [number, number]) => { x: number; y: number },
  radiusPx = MARKER_CLUSTER_RADIUS_PX,
): MarkerCluster<G>[] {
  const ordered = [...groups].sort((left, right) =>
    right.points.length - left.points.length || left.lat - right.lat || left.lng - right.lng,
  );
  const positions = new Map(ordered.map((group) => [group, project([group.lng, group.lat])]));
  const assigned = new Set<G>();
  const clusters: MarkerCluster<G>[] = [];
  const radiusSquared = radiusPx * radiusPx;

  for (const anchor of ordered) {
    if (assigned.has(anchor)) continue;
    assigned.add(anchor);
    const origin = positions.get(anchor)!;
    const members = [anchor];
    for (const candidate of ordered) {
      if (assigned.has(candidate)) continue;
      const position = positions.get(candidate)!;
      const dx = position.x - origin.x;
      const dy = position.y - origin.y;
      if (dx * dx + dy * dy <= radiusSquared) {
        assigned.add(candidate);
        members.push(candidate);
      }
    }
    clusters.push({ anchor, count: members.reduce((sum, member) => sum + member.points.length, 0), members });
  }
  return clusters;
}

export function clusterBounds(members: ReadonlyArray<{ lat: number; lng: number }>): [[number, number], [number, number]] {
  const lngs = members.map((member) => member.lng);
  const lats = members.map((member) => member.lat);
  return [[Math.min(...lngs), Math.min(...lats)], [Math.max(...lngs), Math.max(...lats)]];
}

/** Zoom a cluster click far enough to split nearby centers without losing street context. */
export function clusterZoomLimit(map: { getZoom(): number }) {
  return Math.min(map.getZoom() + 2.5, 13.5);
}
