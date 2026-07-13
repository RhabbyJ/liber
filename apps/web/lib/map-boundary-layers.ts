import type { MapboxMap } from "./mapbox-gl-loader";

const selectedAreaSourceId = "liber-selected-service-area-source";
const selectedAreaFillLayerId = "liber-selected-service-area-fill";
const selectedAreaLineLayerId = "liber-selected-service-area-outline";

export const selectedAreaLayerIds = {
  selectedFill: selectedAreaFillLayerId,
  selectedLine: selectedAreaLineLayerId,
  selectedSource: selectedAreaSourceId,
} as const;

export function syncSelectedAreaLayer(map: MapboxMap, data: Record<string, unknown> | null) {
  if (!data) {
    removeSelectedAreaLayer(map);
    return;
  }

  const source = map.getSource(selectedAreaSourceId);
  if (source) source.setData(data);
  else map.addSource(selectedAreaSourceId, { data, type: "geojson" });

  addLayerIfMissing(map, {
    id: selectedAreaFillLayerId,
    paint: {
      "fill-color": "#16834c",
      "fill-opacity": 0.08,
    },
    source: selectedAreaSourceId,
    type: "fill",
  });
  addLayerIfMissing(map, {
    id: selectedAreaLineLayerId,
    paint: {
      "line-color": "#0e5f38",
      "line-dasharray": [2, 1],
      "line-opacity": 0.86,
      "line-width": 3,
    },
    source: selectedAreaSourceId,
    type: "line",
  });
}

function addLayerIfMissing(map: MapboxMap, layer: Record<string, unknown>) {
  if (!map.getLayer(String(layer.id))) map.addLayer(layer);
}

function removeSelectedAreaLayer(map: MapboxMap) {
  if (map.getLayer(selectedAreaLineLayerId)) map.removeLayer(selectedAreaLineLayerId);
  if (map.getLayer(selectedAreaFillLayerId)) map.removeLayer(selectedAreaFillLayerId);
  if (map.getSource(selectedAreaSourceId)) map.removeSource(selectedAreaSourceId);
}
