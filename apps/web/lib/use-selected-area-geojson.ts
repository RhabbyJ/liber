"use client";

import type { SelectedMapArea } from "./map-area";
import { useKeyedGeoJson } from "./use-keyed-geojson";

export function useSelectedAreaGeoJson(area: SelectedMapArea | null) {
  const requestKey = area
    ? [area.marketSlug, area.slug, area.geojsonPath].filter(Boolean).join(":")
    : "";
  return useKeyedGeoJson(area?.geojsonPath, requestKey);
}
