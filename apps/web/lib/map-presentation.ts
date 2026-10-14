import type { MapboxMap } from "./mapbox-gl-loader";

// Real-estate maps read cleaner without business POIs and transit labels competing with pins.
const quietLayerPattern = /(poi-label|transit-label|airport-label)/;

export function quietBasemap(map: MapboxMap) {
  for (const layer of map.getStyle?.()?.layers ?? []) {
    if (quietLayerPattern.test(layer.id)) map.setLayoutProperty(layer.id, "visibility", "none");
  }
}

export function canHover() {
  return typeof window !== "undefined" && window.matchMedia("(hover: hover) and (pointer: fine)").matches;
}

export function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}
