"use client";

import { useEffect, useRef, useState, type RefObject } from "react";
import { marketMapBounds, marketMapInstanceKey, type MarketMapContext } from "./map-area";
import { loadMapboxGl, type MapboxBounds, type MapboxLngLatBounds, type MapboxMap } from "./mapbox-gl-loader";

type Options = {
  containerRef: RefObject<HTMLDivElement | null>;
  enabled?: boolean;
  /** Open directly on this area (e.g. a deep-linked selection) instead of the market center. */
  initialBounds?: MapboxBounds | null;
  initialZoom?: number;
  market: MarketMapContext;
  token: string;
};

/**
 * One Mapbox map per market/token. The camera is clamped to the market bbox and
 * failures before the first load hand control to the caller's static fallback.
 */
export function useMarketMap({ containerRef, enabled = true, initialBounds = null, initialZoom = 10.4, market, token }: Options) {
  const mapRef = useRef<MapboxMap | null>(null);
  // Read only when a map is created; later selections move the camera instead.
  const initialBoundsRef = useRef(initialBounds);
  const [isReady, setIsReady] = useState(false);
  const [didFail, setDidFail] = useState(false);
  const instanceKey = marketMapInstanceKey(market, token);
  const [west, south, east, north] = market.bbox;
  const centerLat = market.center.lat;
  const centerLng = market.center.lng;

  useEffect(() => {
    initialBoundsRef.current = initialBounds;
  }, [initialBounds]);

  useEffect(() => {
    setDidFail(false);
  }, [instanceKey]);

  useEffect(() => {
    if (!enabled || didFail || !token) return;
    let canceled = false;
    setIsReady(false);

    async function setup() {
      if (!containerRef.current) return;
      try {
        const mapboxgl = await loadMapboxGl();
        if (canceled || !containerRef.current) return;
        mapboxgl.accessToken = token;
        let loaded = false;
        const startBounds = initialBoundsRef.current;
        const map = new mapboxgl.Map({
          antialias: true,
          attributionControl: true,
          ...(startBounds
            ? { bounds: startBounds, fitBoundsOptions: { maxZoom: 13.2, padding: 48 } }
            : { center: [centerLng, centerLat], zoom: initialZoom }),
          cooperativeGestures: false,
          container: containerRef.current,
          dragRotate: false,
          maxBounds: [[west, south], [east, north]],
          pitchWithRotate: false,
          style: "mapbox://styles/mapbox/streets-v12",
          touchPitch: false,
        });
        mapRef.current = map;
        map.addControl(new mapboxgl.NavigationControl({ showCompass: false }), "bottom-right");
        map.on("load", () => {
          if (canceled) return;
          loaded = true;
          setIsReady(true);
        });
        // Only errors before the first load are fatal; later tile hiccups recover.
        map.on("error", () => {
          if (!canceled && !loaded) {
            mapRef.current?.remove();
            mapRef.current = null;
            setDidFail(true);
          }
        });
      } catch {
        if (!canceled) setDidFail(true);
      }
    }

    void setup();
    return () => {
      canceled = true;
      mapRef.current?.remove();
      mapRef.current = null;
      setIsReady(false);
    };
  }, [centerLat, centerLng, containerRef, didFail, east, enabled, initialZoom, instanceKey, north, south, token, west]);

  return { didFail, isReady, mapRef };
}

/** Camera padding that keeps the area clear of overlay controls on any screen size. */
export function responsiveMapPadding(map: MapboxMap) {
  const container = map.getContainer();
  const width = container?.clientWidth || 800;
  const height = container?.clientHeight || 600;
  const base = Math.round(Math.min(width, height) * 0.09);
  const padding = Math.min(Math.max(base, 28), 88);
  return { bottom: padding + 28, left: padding, right: padding, top: padding };
}

export function fitMapTo(map: MapboxMap, bounds: MapboxBounds | MapboxLngLatBounds, maxZoom = 13) {
  map.fitBounds(bounds, {
    duration: prefersReducedMotion() ? 0 : 700,
    maxZoom,
    padding: responsiveMapPadding(map),
  });
}

export function fitMapToMarket(map: MapboxMap, market: Pick<MarketMapContext, "bbox">) {
  fitMapTo(map, marketMapBounds(market), 11);
}

function prefersReducedMotion() {
  return typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
}
