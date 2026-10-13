"use client";

import { preload } from "react-dom";

declare global {
  interface Window {
    mapboxgl?: MapboxGl;
  }
}

export type MapboxGeoJsonSource = {
  setData(data: Record<string, unknown>): void;
};

export type MapboxMap = {
  addControl(control: unknown, position?: string): void;
  addLayer(layer: Record<string, unknown>, beforeId?: string): void;
  addSource(id: string, source: Record<string, unknown>): void;
  fitBounds(bounds: MapboxBoundsLike | MapboxLngLatBounds, options?: Record<string, unknown>): void;
  flyTo(options: Record<string, unknown>): void;
  getCenter(): { lat: number; lng: number };
  getLayer(id: string): unknown;
  getSource(id: string): MapboxGeoJsonSource | undefined;
  getStyle(): { layers?: Array<{ id: string; type: string }> } | undefined;
  getZoom(): number;
  jumpTo(options: Record<string, unknown>): void;
  keyboard: { disableRotation(): void };
  off(event: string, listener: (event?: unknown) => void): void;
  project(coordinates: [number, number]): { x: number; y: number };
  on(event: string, listener: (event?: unknown) => void): void;
  remove(): void;
  removeLayer(id: string): void;
  removeSource(id: string): void;
  resize(): void;
  setLayoutProperty(layerId: string, name: string, value: unknown): void;
  touchZoomRotate: { disableRotation(): void };
};

export type MapboxMarker = {
  addTo(map: MapboxMap): MapboxMarker;
  remove(): void;
  setLngLat(coordinates: [number, number]): MapboxMarker;
  setPopup(popup: MapboxPopup): MapboxMarker;
};

export type MapboxPopup = {
  addTo(map: MapboxMap): MapboxPopup;
  getElement(): HTMLElement | undefined;
  isOpen(): boolean;
  on(event: string, listener: () => void): MapboxPopup;
  remove(): MapboxPopup;
  setHTML(html: string): MapboxPopup;
  setLngLat(coordinates: [number, number]): MapboxPopup;
  setOffset(offset: Record<string, [number, number]>): MapboxPopup;
};

export type MapboxLngLatBounds = {
  extend(coordinates: [number, number]): MapboxLngLatBounds;
};

type MapboxBoundsLike = [[number, number], [number, number]];

type MapboxGl = {
  accessToken: string;
  LngLatBounds: new () => MapboxLngLatBounds;
  Map: new (options: Record<string, unknown>) => MapboxMap;
  Marker: new (options: Record<string, unknown>) => MapboxMarker;
  NavigationControl: new (options: Record<string, unknown>) => unknown;
  Popup: new (options: Record<string, unknown>) => MapboxPopup;
};

const mapboxScriptUrl = "https://api.mapbox.com/mapbox-gl-js/v3.24.0/mapbox-gl.js";
const mapboxCssUrl = "https://api.mapbox.com/mapbox-gl-js/v3.24.0/mapbox-gl.css";
const loadTimeoutMs = 15000;

/** Call during render so the server HTML starts the Mapbox downloads before hydration. */
export function preloadMapboxGl() {
  preload(mapboxScriptUrl, { as: "script" });
  preload(mapboxCssUrl, { as: "style" });
}

export async function loadMapboxGl(): Promise<MapboxGl> {
  if (window.mapboxgl) return window.mapboxgl;

  // Match the stylesheet itself; a preload hint for the same URL does not apply any styles.
  if (!document.querySelector(`link[rel="stylesheet"][href="${mapboxCssUrl}"]`)) {
    const link = document.createElement("link");
    link.href = mapboxCssUrl;
    link.rel = "stylesheet";
    document.head.appendChild(link);
  }

  await new Promise<void>((resolve, reject) => {
    let settled = false;
    const finish = (callback: () => void) => {
      if (settled) return;
      settled = true;
      window.clearTimeout(timeoutId);
      callback();
    };
    const timeoutId = window.setTimeout(() => finish(() => reject(new Error("Mapbox timed out."))), loadTimeoutMs);
    const existingScript = document.querySelector<HTMLScriptElement>(`script[src="${mapboxScriptUrl}"]`);
    if (existingScript) {
      existingScript.addEventListener("load", () => finish(resolve), { once: true });
      existingScript.addEventListener("error", () => finish(() => reject(new Error("Mapbox failed to load."))), { once: true });
      return;
    }

    const script = document.createElement("script");
    script.src = mapboxScriptUrl;
    script.async = true;
    script.onload = () => finish(resolve);
    script.onerror = () => {
      // Drop the failed tag so the next map mount retries instead of waiting on a dead element.
      script.remove();
      finish(() => reject(new Error("Mapbox failed to load.")));
    };
    document.head.appendChild(script);
  });

  if (!window.mapboxgl) throw new Error("Mapbox failed to initialize.");
  return window.mapboxgl;
}
