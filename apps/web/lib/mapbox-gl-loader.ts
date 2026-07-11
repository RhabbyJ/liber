"use client";

declare global {
  interface Window {
    mapboxgl?: any;
  }
}

const mapboxScriptUrl = "https://api.mapbox.com/mapbox-gl-js/v3.24.0/mapbox-gl.js";
const mapboxCssUrl = "https://api.mapbox.com/mapbox-gl-js/v3.24.0/mapbox-gl.css";

export async function loadMapboxGl() {
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
