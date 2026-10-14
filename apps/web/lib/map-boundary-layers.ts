import polygonClipping, { type Polygon as ClipPolygon } from "polygon-clipping";
import type { MapboxMap } from "./mapbox-gl-loader";

type Position = [number, number];
type Ring = Position[];
type PolygonCoordinates = Ring[];
type GeoJson = Record<string, unknown>;

const selectedAreaSourceId = "liber-selected-service-area-source";
const selectedAreaMaskSourceId = "liber-selected-service-area-mask-source";
const selectedAreaOutlineSourceId = "liber-selected-service-area-outline-source";
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
  selectedOutlineSource: selectedAreaOutlineSourceId,
  selectedSource: selectedAreaSourceId,
} as const;

// Covers the visible Web Mercator world so everything outside the selection dims.
const WORLD_RING: Ring = [[-180, -85], [180, -85], [180, 85], [-180, 85], [-180, -85]];

/**
 * The selection as one shape. Areas drawn as adjacent parts (Encino is two) are
 * unioned so the outline has no internal seams and the mask's holes never touch.
 */
export function dissolvedAreaPolygons(data: GeoJson | null): { dissolved: boolean; polygons: PolygonCoordinates[] } {
  const polygons = polygonsOf(data)
    .map((polygon) => polygon.filter(isRing))
    .filter((polygon) => polygon.length > 0);
  if (polygons.length <= 1) return { dissolved: true, polygons };
  try {
    const [first, ...rest] = polygons as unknown as ClipPolygon[];
    const merged = polygonClipping.union(first, ...rest) as unknown as PolygonCoordinates[];
    // Parts that almost meet leave hairline gaps; drop holes under 0.1% of their polygon.
    return {
      dissolved: true,
      polygons: merged.map(([outer, ...holes]) => [outer, ...holes.filter((hole) => ringArea(hole) >= ringArea(outer) * 0.001)]),
    };
  } catch {
    return { dissolved: false, polygons };
  }
}

/**
 * Inverse of the selected area: the world with the area's outer rings cut out.
 * Holes inside the area (enclaves that are not part of it) stay dimmed.
 */
export function selectedAreaMask(data: GeoJson | null): GeoJson | null {
  const { dissolved, polygons } = dissolvedAreaPolygons(data);
  // Undissolved touching parts would make an invalid mask that renders stray triangles.
  if (polygons.length === 0 || (!dissolved && polygons.length > 1)) return null;
  const outerRings = polygons.map((polygon) => polygon[0]);
  const enclaves = polygons.flatMap((polygon) => polygon.slice(1).map((ring) => [ring]));
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
  if (!data || polygonsOf(data).filter((polygon) => isRing(polygon[0])).length === 0) {
    removeSelectedAreaLayer(map);
    return;
  }

  setSourceData(map, selectedAreaSourceId, data);
  setSourceData(map, selectedAreaOutlineSourceId, selectedAreaOutline(data));
  const beforeId = firstLabelLayerId(map);
  const mask = selectedAreaMask(data);
  if (mask) {
    setSourceData(map, selectedAreaMaskSourceId, mask);
    addLayerIfMissing(map, {
      id: selectedAreaMaskLayerId,
      paint: { "fill-color": "#16231c", "fill-opacity": 0.2 },
      source: selectedAreaMaskSourceId,
      type: "fill",
    }, beforeId);
  } else {
    if (map.getLayer(selectedAreaMaskLayerId)) map.removeLayer(selectedAreaMaskLayerId);
    if (map.getSource(selectedAreaMaskSourceId)) map.removeSource(selectedAreaMaskSourceId);
  }
  addLayerIfMissing(map, {
    id: selectedAreaFillLayerId,
    paint: { "fill-color": "#16834c", "fill-opacity": 0.05 },
    source: selectedAreaSourceId,
    type: "fill",
  }, beforeId);
  addLayerIfMissing(map, {
    id: selectedAreaCasingLayerId,
    layout: { "line-cap": "round", "line-join": "round" },
    paint: { "line-color": "#ffffff", "line-opacity": 0.92, "line-width": ["interpolate", ["linear"], ["zoom"], 9, 4, 14, 7] },
    source: selectedAreaOutlineSourceId,
    type: "line",
  }, beforeId);
  addLayerIfMissing(map, {
    id: selectedAreaLineLayerId,
    layout: { "line-cap": "round", "line-join": "round" },
    paint: { "line-color": "#0e5f38", "line-width": ["interpolate", ["linear"], ["zoom"], 9, 2, 14, 3.5] },
    source: selectedAreaOutlineSourceId,
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
  for (const id of [selectedAreaSourceId, selectedAreaMaskSourceId, selectedAreaOutlineSourceId]) {
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

/** The area's border as one boundary: the dissolved shape, so internal seams never draw. */
export function selectedAreaOutline(data: GeoJson): GeoJson {
  return { geometry: { coordinates: dissolvedAreaPolygons(data).polygons, type: "MultiPolygon" }, properties: {}, type: "Feature" };
}

function ringArea(ring: Ring) {
  let twiceArea = 0;
  for (let index = 0; index < ring.length - 1; index += 1) {
    twiceArea += ring[index][0] * ring[index + 1][1] - ring[index + 1][0] * ring[index][1];
  }
  return Math.abs(twiceArea / 2);
}
