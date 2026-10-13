import { describe, expect, it } from "vitest";
import { selectedAreaLayerIds, syncSelectedAreaLayer } from "./map-boundary-layers";
import type { MapboxMap } from "./mapbox-gl-loader";

describe("map boundary layers", () => {
  it("renders only the selected-area fill and outline", () => {
    const map = new FakeMap();
    const selectedArea = featureCollection("zip");

    syncSelectedAreaLayer(map.asMap(), selectedArea);

    expect(map.sources.get(selectedAreaLayerIds.selectedSource)?.data).toBe(selectedArea);
    expect(map.layerIds()).toEqual([selectedAreaLayerIds.selectedFill, selectedAreaLayerIds.selectedLine]);
    expect(map.layer(selectedAreaLayerIds.selectedFill)).toMatchObject({ type: "fill" });
    expect(map.layer(selectedAreaLayerIds.selectedLine)).toMatchObject({ type: "line" });
  });

  it("draws the boundary beneath the basemap labels", () => {
    const map = new FakeMap();
    map.styleLayers = [
      { id: "land", type: "background" },
      { id: "road-street", type: "line" },
      { id: "road-label", type: "symbol" },
      { id: "place-label", type: "symbol" },
    ];

    syncSelectedAreaLayer(map.asMap(), featureCollection("neighborhood"));

    expect(map.beforeIds).toEqual(["road-label", "road-label"]);
  });

  it("updates and clears the selected boundary", () => {
    const map = new FakeMap();
    const first = featureCollection("zip");
    const second = featureCollection("city");
    syncSelectedAreaLayer(map.asMap(), first);
    syncSelectedAreaLayer(map.asMap(), second);

    expect(map.sources.get(selectedAreaLayerIds.selectedSource)?.data).toBe(second);
    syncSelectedAreaLayer(map.asMap(), null);
    expect(map.layerIds()).toEqual([]);
    expect(map.sources.has(selectedAreaLayerIds.selectedSource)).toBe(false);
  });
});

function featureCollection(kind: string) {
  return {
    features: [{ geometry: null, properties: { kind, label: "Area", slug: "area" }, type: "Feature" }],
    type: "FeatureCollection",
  };
}

class FakeMap {
  beforeIds: Array<string | undefined> = [];
  layers: Array<Record<string, unknown>> = [];
  styleLayers: Array<{ id: string; type: string }> = [];
  sources = new Map<string, { data: Record<string, unknown>; setData(data: Record<string, unknown>): void }>();

  asMap() {
    return this as unknown as MapboxMap;
  }

  addLayer(layer: Record<string, unknown>, beforeId?: string) {
    this.layers.push(layer);
    this.beforeIds.push(beforeId);
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

  getLayer(id: string) { return this.layers.find((layer) => layer.id === id); }
  getSource(id: string) { return this.sources.get(id); }
  getStyle() { return { layers: this.styleLayers }; }
  layer(id: string) { return this.getLayer(id); }
  layerIds() { return this.layers.map((layer) => String(layer.id)); }
  removeLayer(id: string) { this.layers = this.layers.filter((layer) => layer.id !== id); }
  removeSource(id: string) { this.sources.delete(id); }
}
