import { describe, expect, it } from "vitest";
import { selectedAreaLayerIds, selectedAreaMask, selectedAreaOutline, syncSelectedAreaLayer } from "./map-boundary-layers";
import type { MapboxMap } from "./mapbox-gl-loader";

describe("map boundary layers", () => {
  it("renders only the selected area: dimmed surround, fill, casing, and outline", () => {
    const map = new FakeMap();
    const selectedArea = featureCollection("zip");

    syncSelectedAreaLayer(map.asMap(), selectedArea);

    expect(map.sources.get(selectedAreaLayerIds.selectedSource)?.data).toBe(selectedArea);
    expect(map.layerIds()).toEqual([
      selectedAreaLayerIds.selectedMask,
      selectedAreaLayerIds.selectedFill,
      selectedAreaLayerIds.selectedCasing,
      selectedAreaLayerIds.selectedLine,
    ]);
    expect(map.layer(selectedAreaLayerIds.selectedMask)).toMatchObject({ type: "fill" });
    expect(map.layer(selectedAreaLayerIds.selectedLine)).toMatchObject({ type: "line" });
  });

  it("draws above roads and buildings but beneath basemap labels", () => {
    const map = new FakeMap([
      { id: "land", type: "background" },
      { id: "tunnel-oneway-arrow", type: "symbol" },
      { id: "road-primary", type: "line" },
      { id: "building", type: "fill" },
      { id: "road-label", type: "symbol" },
      { id: "place-label", type: "symbol" },
    ]);
    syncSelectedAreaLayer(map.asMap(), featureCollection("city"));
    expect(map.beforeIds).toEqual(["road-label", "road-label", "road-label", "road-label"]);
  });

  it("updates and clears the selected boundary", () => {
    const map = new FakeMap();
    const first = featureCollection("zip");
    const second = featureCollection("city");
    syncSelectedAreaLayer(map.asMap(), first);
    syncSelectedAreaLayer(map.asMap(), second);

    expect(map.sources.get(selectedAreaLayerIds.selectedSource)?.data).toBe(second);
    expect(map.layerIds()).toHaveLength(4);
    syncSelectedAreaLayer(map.asMap(), null);
    expect(map.layerIds()).toEqual([]);
    expect(map.sources.has(selectedAreaLayerIds.selectedSource)).toBe(false);
    expect(map.sources.has(selectedAreaLayerIds.selectedMaskSource)).toBe(false);
    expect(map.sources.has(selectedAreaLayerIds.selectedOutlineSource)).toBe(false);
  });

  it("does not draw anything for geometry it cannot outline", () => {
    const map = new FakeMap();
    syncSelectedAreaLayer(map.asMap(), { features: [{ geometry: null, properties: {}, type: "Feature" }], type: "FeatureCollection" });
    expect(map.layerIds()).toEqual([]);
  });
});

describe("selected-area mask", () => {
  it("cuts every outer ring out of the world and keeps enclaves dimmed", () => {
    const outer = square(0, 0, 10);
    const enclave = square(4, 4, 2);
    const island = square(20, 20, 3);
    const mask = selectedAreaMask({
      geometry: { coordinates: [[outer, enclave], [island]], type: "MultiPolygon" },
      properties: {},
      type: "Feature",
    }) as { geometry: { coordinates: number[][][][]; type: string } };

    expect(mask.geometry.type).toBe("MultiPolygon");
    expect(mask.geometry.coordinates).toHaveLength(2);
    // Rings are compared as vertex sets: the union may normalize their winding.
    expect(mask.geometry.coordinates[0].slice(1).map(vertexSet)).toEqual([outer, island].map(vertexSet));
    expect(mask.geometry.coordinates[1].map(vertexSet)).toEqual([vertexSet(enclave)]);
  });

  it("unions touching parts so the mask has one clean cut-out and the outline no seam", () => {
    const adjacent = {
      geometry: { coordinates: [[square(0, 0, 10)], [square(10, 0, 10)]], type: "MultiPolygon" },
      properties: {},
      type: "Feature",
    };
    const mask = selectedAreaMask(adjacent) as { geometry: { coordinates: number[][][][] } };
    expect(mask.geometry.coordinates).toHaveLength(1);
    expect(mask.geometry.coordinates[0]).toHaveLength(2);

    const outline = selectedAreaOutline(adjacent) as { geometry: { coordinates: number[][][][]; type: string } };
    expect(outline.geometry.coordinates).toHaveLength(1);
    const [ring] = outline.geometry.coordinates[0];
    const xs = ring.map(([x]) => x);
    expect(Math.min(...xs)).toBe(0);
    expect(Math.max(...xs)).toBe(20);
    expect(ring.some(([x, y]) => x === 10 && y > 0 && y < 10)).toBe(false);

    const map = new FakeMap();
    syncSelectedAreaLayer(map.asMap(), adjacent);
    expect(map.layerIds()).toEqual([
      selectedAreaLayerIds.selectedMask,
      selectedAreaLayerIds.selectedFill,
      selectedAreaLayerIds.selectedCasing,
      selectedAreaLayerIds.selectedLine,
    ]);
  });

  it("returns null without polygon geometry", () => {
    expect(selectedAreaMask(null)).toBeNull();
    expect(selectedAreaMask({ coordinates: [0, 0], type: "Point" })).toBeNull();
  });
});

function vertexSet(ring: number[][]) {
  return [...new Set(ring.map(([x, y]) => `${x},${y}`))].sort();
}

function square(x: number, y: number, size: number) {
  return [[x, y], [x + size, y], [x + size, y + size], [x, y + size], [x, y]];
}

function featureCollection(kind: string) {
  return {
    features: [{ geometry: { coordinates: [square(-118.5, 34.2, 0.1)], type: "Polygon" }, properties: { kind, label: "Area", slug: "area" }, type: "Feature" }],
    type: "FeatureCollection",
  };
}

class FakeMap {
  beforeIds: Array<string | undefined> = [];
  layers: Array<Record<string, unknown>> = [];
  constructor(private readonly styleLayers?: Array<{ id: string; type: string }>) {}
  sources = new Map<string, { data: Record<string, unknown>; setData(data: Record<string, unknown>): void }>();

  asMap() {
    return this as unknown as MapboxMap;
  }

  addLayer(layer: Record<string, unknown>, beforeId?: string) {
    this.beforeIds.push(beforeId);
    this.layers.push(layer);
  }

  getStyle() {
    return this.styleLayers ? { layers: this.styleLayers } : undefined;
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
