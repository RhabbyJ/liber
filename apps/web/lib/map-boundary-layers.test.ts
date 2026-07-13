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
  layers: Array<Record<string, unknown>> = [];
  sources = new Map<string, { data: Record<string, unknown>; setData(data: Record<string, unknown>): void }>();

  asMap() {
    return this as unknown as MapboxMap;
  }

  addLayer(layer: Record<string, unknown>) {
    this.layers.push(layer);
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
  layer(id: string) { return this.getLayer(id); }
  layerIds() { return this.layers.map((layer) => String(layer.id)); }
  removeLayer(id: string) { this.layers = this.layers.filter((layer) => layer.id !== id); }
  removeSource(id: string) { this.sources.delete(id); }
}
