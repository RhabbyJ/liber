import { marketMapBounds, selectedAreaBounds, type MarketMapContext, type SelectedMapArea } from "./map-area";

type Bounds = [[number, number], [number, number]];

export type MapCameraTarget = {
  bounds: Bounds;
  /** Changes only when the framing intent changes (market or selected area), never with filters or sort. */
  key: string;
  maxZoom: number;
};

export type MapView = { center: [number, number]; zoom: number };

export const mapFitPadding = 64;

/**
 * Shared Mapbox construction options: flat Mercator, north-up, clamped near the market, and
 * opening directly on the saved view or the framing target so tiles load once.
 */
export function liberMapOptions(
  container: HTMLElement,
  market: Pick<MarketMapContext, "bbox">,
  savedView: MapView | null,
  target: MapCameraTarget | undefined,
) {
  const camera = savedView
    ? { center: savedView.center, zoom: savedView.zoom }
    : {
      bounds: target?.bounds ?? marketMapBounds(market),
      fitBoundsOptions: { maxZoom: target?.maxZoom ?? 12.4, padding: mapFitPadding },
    };
  return {
    antialias: true,
    attributionControl: true,
    container,
    cooperativeGestures: false,
    dragRotate: false,
    maxBounds: mapPanBounds(market),
    minZoom: 7,
    pitchWithRotate: false,
    projection: "mercator",
    style: "mapbox://styles/mapbox/streets-v12",
    touchPitch: false,
    ...camera,
  };
}

/**
 * Where the map should frame: the selected area, else the spread of result pins, else the market.
 * Callers refit only when `key` changes, so result, filter, sort, and page changes keep the user's view.
 */
export function mapCameraTarget(
  market: MarketMapContext,
  selectedArea: SelectedMapArea | null,
  points: Array<{ lat: number; lng: number }>,
): MapCameraTarget {
  if (selectedArea) {
    return { bounds: selectedAreaBounds(selectedArea), key: `area:${selectedArea.bbox.join(",")}`, maxZoom: 12.6 };
  }
  const key = `market:${market.slug}`;
  if (points.length > 1) {
    const lngs = points.map((point) => point.lng);
    const lats = points.map((point) => point.lat);
    return {
      bounds: [[Math.min(...lngs), Math.min(...lats)], [Math.max(...lngs), Math.max(...lats)]],
      key,
      maxZoom: 12.4,
    };
  }
  if (points.length === 1) {
    const [point] = points;
    const delta = 0.04;
    return { bounds: [[point.lng - delta, point.lat - delta], [point.lng + delta, point.lat + delta]], key, maxZoom: 11.5 };
  }
  return { bounds: marketMapBounds(market), key, maxZoom: 12.4 };
}

/** Pan limit: the market plus half its size on every side, so "View all" can always fit with padding. */
export function mapPanBounds(market: Pick<MarketMapContext, "bbox">): Bounds {
  const [west, south, east, north] = market.bbox;
  const padLng = (east - west) / 2;
  const padLat = (north - south) / 2;
  return [[west - padLng, south - padLat], [east + padLng, north + padLat]];
}

/** Style, auth, and network failures before first render are fatal; a single failed tile is not. */
export function isFatalMapError(event: unknown) {
  if (!event || typeof event !== "object") return true;
  const details = event as { sourceId?: unknown; tile?: unknown };
  return details.sourceId === undefined && details.tile === undefined;
}

function viewStorageKey(scope: string) {
  return `liber:map-view:${scope}`;
}

/** Remembers the last camera per search URL so Back restores the seller's place on the map. */
export function saveMapView(scope: string, view: MapView) {
  try {
    window.sessionStorage.setItem(viewStorageKey(scope), JSON.stringify({
      center: [round(view.center[0]), round(view.center[1])],
      zoom: Math.round(view.zoom * 100) / 100,
    }));
  } catch {
    // Session storage is optional.
  }
}

export function readMapView(scope: string, market: Pick<MarketMapContext, "bbox">): MapView | null {
  try {
    const parsed = JSON.parse(window.sessionStorage.getItem(viewStorageKey(scope)) ?? "null") as Partial<MapView> | null;
    const [lng, lat] = Array.isArray(parsed?.center) ? parsed.center : [];
    const zoom = parsed?.zoom;
    if (typeof lng !== "number" || typeof lat !== "number" || typeof zoom !== "number") return null;
    const [[west, south], [east, north]] = mapPanBounds(market);
    if (lng < west || lng > east || lat < south || lat > north || zoom < 0 || zoom > 22) return null;
    return { center: [lng, lat], zoom };
  } catch {
    return null;
  }
}

function round(value: number) {
  return Math.round(value * 1e5) / 1e5;
}
