"use client";

import { useEffect, useRef, useState } from "react";
import type { SelectedMapArea } from "./map-area";
import { LatestRequestGate, runLatestRequest } from "./latest-request";

export function useSelectedAreaGeoJson(area: SelectedMapArea | null) {
  const gateRef = useRef(new LatestRequestGate());
  const [geojson, setGeojson] = useState<Record<string, unknown> | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    setGeojson(null);
    if (!area) {
      gateRef.current.invalidate();
      return () => controller.abort();
    }
    void runLatestRequest({
      gate: gateRef.current,
      load: async () => {
        const response = await fetch(area.geojsonPath, { cache: "force-cache", signal: controller.signal });
        if (!response.ok) throw new Error("Unable to load service-area geometry.");
        const payload = await response.json() as Record<string, unknown>;
        if (payload.type !== "FeatureCollection" && payload.type !== "Feature") {
          throw new Error("Service-area geometry is not GeoJSON.");
        }
        return payload;
      },
      onError: () => setGeojson(null),
      onSuccess: setGeojson,
    });
    return () => {
      controller.abort();
      gateRef.current.invalidate();
    };
  }, [area?.geojsonPath, area?.id, area?.marketSlug, area?.slug]);

  return geojson;
}
