import type { MapboxMap } from "./mapbox-gl-loader";

type Position = [number, number];
type Ring = Position[];
type PolygonCoordinates = Ring[];
type GeoJson = Record<string, unknown>;

const selectedAreaSourceId = "liber-selected-service-area-source";
const selectedAreaMaskSourceId = "liber-selected-service-area-mask-source";
const selectedAreaMaskLayerId = "liber-selected-service-area-mask";
const selectedAreaFillLayerId = "liber-selected-service-area-fill";
const selectedAreaCasingLayerId = "liber-selected-service-area-casing";
const selectedAreaLineLayerId = "liber-selected-service-area-outline";

export const selectedAreaLayerIds = {
  selectedCasing: selectedAreaCasingLayerId,
  selectedFill: selectedAreaFillLayerId,
  selectedLine: selectedAreaLineLayerId,
  selectedMask: selectedAreaMaskLayerId,
  selectedMaskSource: selectedAreaMaskSourceId,
  selectedSource: selectedAreaSourceId,
} as const;

// Covers the visible Web Mercator world so everything outside the selection dims.
const WORLD_RING: Ring = [[-180, -85], [180, -85], [180, 85], [-180, 85], [-180, -85]];

/**
 * Inverse of the selected area: the world with the area's outer rings cut out.
 * Holes inside the area (enclaves that are not part of it) stay dimmed.
 */
export function selectedAreaMask(data: GeoJson | null): GeoJson | null {
  const polygons = polygonsOf(data);
  if (polygons.length === 0) return null;
  const outerRings = polygons.map((polygon) => polygon[0]).filter(isRing);
  const enclaves = polygons.flatMap((polygon) => polygon.slice(1).filter(isRing).map((ring) => [ring]));
  return {
    geometry: { coordinates: [[WORLD_RING, ...outerRings], ...enclaves], type: "MultiPolygon" },
    properties: {},
    type: "Feature",
  };
}

/**
 * Draw only the searched service area: a dimmed surround, a light fill, and a
 * cased outline. Layers sit beneath the basemap labels so street and place
 * names stay readable over the selection.
 */
export function syncSelectedAreaLayer(map: MapboxMap, data: GeoJson | null) {
  const mask = selectedAreaMask(data);
  if (!data || !mask) {
    removeSelectedAreaLayer(map);
    return;
  }

  setSourceData(map, selectedAreaSourceId, data);
  setSourceData(map, selectedAreaMaskSourceId, mask);
  const beforeId = firstLabelLayerId(map);

  addLayerIfMissing(map, {
    id: selectedAreaMaskLayerId,
    paint: { "fill-color": "#16231c", "fill-opacity": 0.16 },
    source: selectedAreaMaskSourceId,
    type: "fill",
  }, beforeId);
  addLayerIfMissing(map, {
    id: selectedAreaFillLayerId,
    paint: { "fill-color": "#16834c", "fill-opacity": 0.05 },
    source: selectedAreaSourceId,
    type: "fill",
  }, beforeId);
  addLayerIfMissing(map, {
    id: selectedAreaCasingLayerId,
    layout: { "line-join": "round" },
    paint: { "line-color": "#ffffff", "line-opacity": 0.92, "line-width": ["interpolate", ["linear"], ["zoom"], 9, 4, 14, 7] },
    source: selectedAreaSourceId,
    type: "line",
  }, beforeId);
  addLayerIfMissing(map, {
    id: selectedAreaLineLayerId,
    layout: { "line-join": "round" },
    paint: { "line-color": "#0e5f38", "line-width": ["interpolate", ["linear"], ["zoom"], 9, 2, 14, 3.5] },
    source: selectedAreaSourceId,
    type: "line",
  }, beforeId);
}

function setSourceData(map: MapboxMap, id: string, data: GeoJson) {
  const source = map.getSource(id);
  if (source) source.setData(data);
  else map.addSource(id, { data, type: "geojson" });
}

function addLayerIfMissing(map: MapboxMap, layer: Record<string, unknown>, beforeId?: string) {
  if (map.getLayer(String(layer.id))) return;
  if (beforeId) map.addLayer(layer, beforeId);
  else map.addLayer(layer);
}

/**
 * The first label layer above every road, building, and admin layer. Basemaps
 * interleave small symbol layers (one-way arrows) among the roads, so "first
 * symbol layer" would place the selection beneath the streets.
 */
function firstLabelLayerId(map: MapboxMap) {
  try {
    const layers = map.getStyle?.()?.layers ?? [];
    let lastGeometryIndex = -1;
    layers.forEach((layer, index) => {
      if (layer.type !== "symbol" && layer.type !== "sky" && !layer.id.startsWith("liber-")) lastGeometryIndex = index;
    });
    return layers.slice(lastGeometryIndex + 1).find((layer) => layer.type === "symbol")?.id;
  } catch {
    return undefined;
  }
}

function removeSelectedAreaLayer(map: MapboxMap) {
  for (const id of [selectedAreaLineLayerId, selectedAreaCasingLayerId, selectedAreaFillLayerId, selectedAreaMaskLayerId]) {
    if (map.getLayer(id)) map.removeLayer(id);
  }
  for (const id of [selectedAreaSourceId, selectedAreaMaskSourceId]) {
    if (map.getSource(id)) map.removeSource(id);
  }
}

function polygonsOf(data: GeoJson | null): PolygonCoordinates[] {
  if (!data) return [];
  if (data.type === "FeatureCollection" && Array.isArray(data.features)) {
    return data.features.flatMap((feature) => polygonsOf(feature as GeoJson));
  }
  if (data.type === "Feature") return polygonsOf((data.geometry ?? null) as GeoJson | null);
  if (data.type === "Polygon" && Array.isArray(data.coordinates)) return [data.coordinates as PolygonCoordinates];
  if (data.type === "MultiPolygon" && Array.isArray(data.coordinates)) return data.coordinates as PolygonCoordinates[];
  if (data.type === "GeometryCollection" && Array.isArray(data.geometries)) {
    return data.geometries.flatMap((geometry) => polygonsOf(geometry as GeoJson));
  }
  return [];
}

function isRing(ring: unknown): ring is Ring {
  return Array.isArray(ring) && ring.length >= 4;
}
