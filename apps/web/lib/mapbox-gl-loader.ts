"use client";

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
  addLayer(layer: Record<string, unknown>): void;
  addSource(id: string, source: Record<string, unknown>): void;
  fitBounds(bounds: MapboxBoundsLike | MapboxLngLatBounds, options?: Record<string, unknown>): void;
  flyTo(options: Record<string, unknown>): void;
  getLayer(id: string): unknown;
  getSource(id: string): MapboxGeoJsonSource | undefined;
  on(event: string, listener: () => void): void;
  remove(): void;
  removeLayer(id: string): void;
  removeSource(id: string): void;
};

export type MapboxMarker = {
  addTo(map: MapboxMap): MapboxMarker;
  remove(): void;
  setLngLat(coordinates: [number, number]): MapboxMarker;
  setPopup(popup: MapboxPopup): MapboxMarker;
};

export type MapboxPopup = {
  setHTML(html: string): MapboxPopup;
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

export async function loadMapboxGl(): Promise<MapboxGl> {
  if (window.mapboxgl) return window.mapboxgl;

  if (!document.querySelector(`link[href="${mapboxCssUrl}"]`)) {
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
    const timeoutId = window.setTimeout(() => finish(() => reject(new Error("Mapbox timed out."))), 8000);
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
    script.onerror = () => finish(() => reject(new Error("Mapbox failed to load.")));
    document.head.appendChild(script);
  });

  if (!window.mapboxgl) throw new Error("Mapbox failed to initialize.");
  return window.mapboxgl;
}
