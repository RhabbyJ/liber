import type { MapboxMap } from "./mapbox-gl-loader";

const marketBoundarySourceId = "liber-market-boundaries-source";
const marketCountyLayerId = "liber-market-county-outline";
const marketCityLayerId = "liber-market-city-outline";
const marketZipLayerId = "liber-market-zip-outline";
const selectedAreaSourceId = "liber-selected-service-area-source";
const selectedAreaFillLayerId = "liber-selected-service-area-fill";
const selectedAreaLineLayerId = "liber-selected-service-area-outline";

export const mapBoundaryLayerIds = {
  marketCity: marketCityLayerId,
  marketCounty: marketCountyLayerId,
  marketSource: marketBoundarySourceId,
  marketZip: marketZipLayerId,
  selectedFill: selectedAreaFillLayerId,
  selectedLine: selectedAreaLineLayerId,
  selectedSource: selectedAreaSourceId,
} as const;

export function syncMarketBoundaryLayers(map: MapboxMap, data: Record<string, unknown> | null) {
  if (!data) {
    removeMarketBoundaryLayers(map);
    return;
  }

  const source = map.getSource(marketBoundarySourceId);
  if (source) source.setData(data);
  else map.addSource(marketBoundarySourceId, { data, type: "geojson" });

  const beforeId = map.getLayer(selectedAreaFillLayerId)
    ? selectedAreaFillLayerId
    : map.getLayer(selectedAreaLineLayerId) ? selectedAreaLineLayerId : undefined;

  addLayerIfMissing(map, {
    filter: ["==", ["get", "kind"], "zip"],
    id: marketZipLayerId,
    minzoom: 9.5,
    paint: {
      "line-color": "#87968e",
      "line-dasharray": [2, 2],
      "line-opacity": 0.58,
      "line-width": 0.9,
    },
    source: marketBoundarySourceId,
    type: "line",
  }, beforeId);
  addLayerIfMissing(map, {
    filter: ["==", ["get", "kind"], "city"],
    id: marketCityLayerId,
    minzoom: 7.5,
    paint: {
      "line-color": "#65766d",
      "line-opacity": 0.68,
      "line-width": 1.2,
    },
    source: marketBoundarySourceId,
    type: "line",
  }, beforeId);
  addLayerIfMissing(map, {
    filter: ["==", ["get", "kind"], "county"],
    id: marketCountyLayerId,
    paint: {
      "line-color": "#334b40",
      "line-opacity": 0.9,
      "line-width": 2.2,
    },
    source: marketBoundarySourceId,
    type: "line",
  }, beforeId);
}

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

function addLayerIfMissing(map: MapboxMap, layer: Record<string, unknown>, beforeId?: string) {
  if (!map.getLayer(String(layer.id))) map.addLayer(layer, beforeId);
}

function removeMarketBoundaryLayers(map: MapboxMap) {
  if (map.getLayer(marketCountyLayerId)) map.removeLayer(marketCountyLayerId);
  if (map.getLayer(marketCityLayerId)) map.removeLayer(marketCityLayerId);
  if (map.getLayer(marketZipLayerId)) map.removeLayer(marketZipLayerId);
  if (map.getSource(marketBoundarySourceId)) map.removeSource(marketBoundarySourceId);
}

function removeSelectedAreaLayer(map: MapboxMap) {
  if (map.getLayer(selectedAreaLineLayerId)) map.removeLayer(selectedAreaLineLayerId);
  if (map.getLayer(selectedAreaFillLayerId)) map.removeLayer(selectedAreaFillLayerId);
  if (map.getSource(selectedAreaSourceId)) map.removeSource(selectedAreaSourceId);
}
