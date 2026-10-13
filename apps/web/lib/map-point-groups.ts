/** Group overlapping area centers without moving the geographic coordinates. */
export function groupMapPoints<T extends { lat: number; lng: number }>(points: readonly T[]) {
  const groups = new Map<string, { lat: number; lng: number; points: T[] }>();
  for (const point of points) {
    if (!Number.isFinite(point.lat) || !Number.isFinite(point.lng)) continue;
    const key = `${point.lat},${point.lng}`;
    const group = groups.get(key);
    if (group) group.points.push(point);
    else groups.set(key, { lat: point.lat, lng: point.lng, points: [point] });
  }
  return [...groups.values()];
}
