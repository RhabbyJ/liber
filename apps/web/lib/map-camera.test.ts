import { afterEach, describe, expect, it, vi } from "vitest";
import {
  isFatalMapError,
  liberMapOptions,
  mapCameraTarget,
  mapPanBounds,
  readMapView,
  saveMapView,
} from "./map-camera";

const market = {
  bbox: [-118.95, 32.75, -117.65, 34.82] as [number, number, number, number],
  center: { lat: 34.2, lng: -118.2 },
  label: "Los Angeles County",
  slug: "los-angeles",
};
const granadaHills = {
  bbox: [-118.547, 34.257, -118.467, 34.334] as [number, number, number, number],
  center: { lat: 34.29, lng: -118.5 },
  geojsonPath: "/api/service-areas/granada-hills/geometry?market=los-angeles",
  label: "Granada Hills",
};

describe("map camera target", () => {
  it("keys framing to the selected area or market, never to result data", () => {
    const pointsA = [{ lat: 34.1, lng: -118.3 }, { lat: 34.2, lng: -118.4 }];
    const pointsB = [{ lat: 33.9, lng: -118.1 }, { lat: 34.3, lng: -118.6 }, { lat: 34.0, lng: -118.2 }];

    expect(mapCameraTarget(market, null, pointsA).key).toBe(mapCameraTarget(market, null, pointsB).key);
    expect(mapCameraTarget(market, granadaHills, pointsA).key).toBe(mapCameraTarget(market, { ...granadaHills }, pointsB).key);
    expect(mapCameraTarget(market, granadaHills, []).key).not.toBe(mapCameraTarget(market, null, []).key);
  });

  it("frames the selected area, else the result spread, else the market", () => {
    expect(mapCameraTarget(market, granadaHills, []).bounds).toEqual([[-118.547, 34.257], [-118.467, 34.334]]);
    expect(mapCameraTarget(market, null, [{ lat: 34.1, lng: -118.3 }, { lat: 34.2, lng: -118.4 }]).bounds)
      .toEqual([[-118.4, 34.1], [-118.3, 34.2]]);
    expect(mapCameraTarget(market, null, []).bounds).toEqual([[-118.95, 32.75], [-117.65, 34.82]]);
    const single = mapCameraTarget(market, null, [{ lat: 34.1, lng: -118.3 }]);
    expect(single.maxZoom).toBe(11.5);
    expect(single.bounds[0][0]).toBeLessThan(-118.3);
  });
});

describe("map construction options", () => {
  it("keeps maps flat, north-up, and near the market, opening on the target", () => {
    const container = {} as HTMLElement;
    const target = mapCameraTarget(market, granadaHills, []);
    const options = liberMapOptions(container, market, null, target);

    expect(options).toMatchObject({
      cooperativeGestures: false,
      dragRotate: false,
      minZoom: 7,
      pitchWithRotate: false,
      projection: "mercator",
      touchPitch: false,
      bounds: target.bounds,
      fitBoundsOptions: { maxZoom: 12.6 },
    });
    expect(options.maxBounds).toEqual(mapPanBounds(market));
    expect(liberMapOptions(container, market, { center: [-118.5, 34.3], zoom: 13 }, target))
      .toMatchObject({ center: [-118.5, 34.3], zoom: 13 });
  });

  it("pads the pan limit by half the market on every side", () => {
    const [[west, south], [east, north]] = mapPanBounds(market);
    expect(west).toBeCloseTo(-119.6, 6);
    expect(south).toBeCloseTo(31.715, 6);
    expect(east).toBeCloseTo(-117, 6);
    expect(north).toBeCloseTo(35.855, 6);
  });

  it("treats only style, auth, and network failures as fatal", () => {
    expect(isFatalMapError({ error: new Error("style 401") })).toBe(true);
    expect(isFatalMapError(undefined)).toBe(true);
    expect(isFatalMapError({ error: new Error("tile 500"), sourceId: "composite", tile: {} })).toBe(false);
  });
});

describe("saved map views", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("round-trips a rounded view per URL and rejects views far outside the market", () => {
    const store = new Map<string, string>();
    vi.stubGlobal("window", {
      sessionStorage: {
        getItem: (key: string) => store.get(key) ?? null,
        setItem: (key: string, value: string) => store.set(key, value),
      },
    });

    saveMapView("/seller/search?serviceArea=granada-hills", { center: [-118.5012345678, 34.2912345678], zoom: 12.3456 });
    expect(readMapView("/seller/search?serviceArea=granada-hills", market)).toEqual({ center: [-118.50123, 34.29123], zoom: 12.35 });
    expect(readMapView("/seller/search", market)).toBeNull();

    saveMapView("/elsewhere", { center: [-73.98, 40.75], zoom: 12 });
    expect(readMapView("/elsewhere", market)).toBeNull();
  });

  it("ignores unavailable or corrupt storage", () => {
    vi.stubGlobal("window", {
      sessionStorage: {
        getItem: () => "{not json",
        setItem: () => {
          throw new Error("blocked");
        },
      },
    });
    expect(readMapView("/", market)).toBeNull();
    expect(() => saveMapView("/", { center: [-118.2, 34.1], zoom: 10 })).not.toThrow();
  });
});
