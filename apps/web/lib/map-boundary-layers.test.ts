import { describe, expect, it } from "vitest";
import { mapBoundaryLayerIds, syncMarketBoundaryLayers, syncSelectedAreaLayer } from "./map-boundary-layers";
import type { MapboxMap } from "./mapbox-gl-loader";

describe("map boundary layers", () => {
  it("renders line-only county, city, and ZIP layers at the requested zoom thresholds", () => {
    const map = new FakeMap();
    const boundaries = featureCollection("county");

    syncMarketBoundaryLayers(map.asMap(), boundaries);

    expect(map.sources.get(mapBoundaryLayerIds.marketSource)?.data).toBe(boundaries);
    expect(map.layer(mapBoundaryLayerIds.marketCounty)).toMatchObject({ type: "line" });
    expect(map.layer(mapBoundaryLayerIds.marketCity)).toMatchObject({ minzoom: 7.5, type: "line" });
    expect(map.layer(mapBoundaryLayerIds.marketZip)).toMatchObject({ minzoom: 9.5, type: "line" });
    expect(map.layers.every((layer) => layer.type === "line")).toBe(true);
  });

  it("keeps overview borders beneath the selected fill and outline", () => {
    const map = new FakeMap();
    syncSelectedAreaLayer(map.asMap(), featureCollection("zip"));
    syncMarketBoundaryLayers(map.asMap(), featureCollection("county"));

    expect(map.layerIds()).toEqual([
      mapBoundaryLayerIds.marketZip,
      mapBoundaryLayerIds.marketCity,
      mapBoundaryLayerIds.marketCounty,
      mapBoundaryLayerIds.selectedFill,
      mapBoundaryLayerIds.selectedLine,
    ]);
  });

  it("updates existing sources and removes all overview layers when cleared", () => {
    const map = new FakeMap();
    const first = featureCollection("county");
    const second = featureCollection("city");
    syncMarketBoundaryLayers(map.asMap(), first);
    syncMarketBoundaryLayers(map.asMap(), second);

    expect(map.sources.get(mapBoundaryLayerIds.marketSource)?.data).toBe(second);
    syncMarketBoundaryLayers(map.asMap(), null);
    expect(map.layerIds()).toEqual([]);
    expect(map.sources.has(mapBoundaryLayerIds.marketSource)).toBe(false);
  });
});

function featureCollection(kind: string) {
  return {
    features: [{ geometry: null, properties: { kind, label: "Area", slug: "area" }, type: "Feature" }],
    type: "FeatureCollection",
  };
}

class FakeMap {
  layers: Array<Record<string, unknown>> = [];
  sources = new Map<string, { data: Record<string, unknown>; setData(data: Record<string, unknown>): void }>();

  asMap() {
    return this as unknown as MapboxMap;
  }

  addControl() {}

  addLayer(layer: Record<string, unknown>, beforeId?: string) {
    const index = beforeId ? this.layers.findIndex((candidate) => candidate.id === beforeId) : -1;
    if (index === -1) this.layers.push(layer);
    else this.layers.splice(index, 0, layer);
  }

  addSource(id: string, source: Record<string, unknown>) {
    const entry = {
      data: source.data as Record<string, unknown>,
      setData(data: Record<string, unknown>) {
        entry.data = data;
      },
    };
    this.sources.set(id, entry);
  }

  fitBounds() {}
  flyTo() {}
  getLayer(id: string) { return this.layers.find((layer) => layer.id === id); }
  getSource(id: string) { return this.sources.get(id); }
  layer(id: string) { return this.getLayer(id); }
  layerIds() { return this.layers.map((layer) => String(layer.id)); }
  on() {}
  remove() {}
  removeLayer(id: string) { this.layers = this.layers.filter((layer) => layer.id !== id); }
  removeSource(id: string) { this.sources.delete(id); }
}
