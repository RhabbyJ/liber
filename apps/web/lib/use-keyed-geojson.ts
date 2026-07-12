"use client";

import { useEffect, useRef, useState } from "react";
import { LatestRequestGate, runLatestRequest } from "./latest-request";

type GeoJson = Record<string, unknown>;

export type KeyedGeoJsonState = {
  data: GeoJson | null;
  key: string;
};

export function geoJsonForKey(state: KeyedGeoJsonState, key: string) {
  return state.key === key ? state.data : null;
}

export function useKeyedGeoJson(path?: string | null, requestKey = path ?? "") {
  const gateRef = useRef(new LatestRequestGate());
  const [state, setState] = useState<KeyedGeoJsonState>({ data: null, key: requestKey });

  useEffect(() => {
    const gate = gateRef.current;
    const controller = new AbortController();
    setState({ data: null, key: requestKey });

    if (!path) {
      gate.invalidate();
      return () => controller.abort();
    }

    void runLatestRequest({
      gate,
      load: async () => {
        const response = await fetch(path, { cache: "force-cache", signal: controller.signal });
        if (!response.ok) throw new Error("Unable to load map geometry.");
        const payload = await response.json() as GeoJson;
        if (payload.type !== "FeatureCollection" && payload.type !== "Feature") {
          throw new Error("Map geometry is not GeoJSON.");
        }
        return payload;
      },
      onError: () => setState({ data: null, key: requestKey }),
      onSuccess: (data) => setState({ data, key: requestKey }),
    });

    return () => {
      controller.abort();
      gate.invalidate();
    };
  }, [path, requestKey]);

  return geoJsonForKey(state, requestKey);
}
