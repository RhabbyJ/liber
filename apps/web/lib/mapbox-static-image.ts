import type { MarketMapContext, SelectedMapArea } from "./map-area";

type StaticMapPoint = {
  lat: number;
  lng: number;
};

type StaticMapImageOptions = {
  market: MarketMapContext;
  points: StaticMapPoint[];
  selectedArea?: SelectedMapArea | null;
  token?: string;
};

const imageWidth = 1280;
const imageHeight = 1000;
const mapboxTileSize = 512;
const viewportPadding = 112;

export function mapboxStaticImageUrl({ market, points, selectedArea = null, token = "" }: StaticMapImageOptions) {
  const accessToken = token.trim();
  if (!accessToken) return null;

  const bounds = selectedArea?.bbox ?? pointBounds(points, market.bbox);
  const center = boundsCenter(bounds);
  const zoom = fitBoundsZoom(bounds);
  const markers = points
    .filter((point) => Number.isFinite(point.lat) && Number.isFinite(point.lng))
    .map((point) => `pin-s+16834c(${coordinate(point.lng)},${coordinate(point.lat)})`)
    .join(",");
  const overlay = markers ? `${markers}/` : "";
  const camera = `${coordinate(center.lng)},${coordinate(center.lat)},${zoom.toFixed(2)},0,0`;

  return `https://api.mapbox.com/styles/v1/mapbox/streets-v12/static/${overlay}${camera}/${imageWidth}x${imageHeight}?access_token=${encodeURIComponent(accessToken)}`;
}

function pointBounds(points: StaticMapPoint[], marketBounds: [number, number, number, number]) {
  const validPoints = points.filter((point) => Number.isFinite(point.lat) && Number.isFinite(point.lng));
  if (validPoints.length < 2) return marketBounds;

  const west = Math.min(...validPoints.map((point) => point.lng));
  const south = Math.min(...validPoints.map((point) => point.lat));
  const east = Math.max(...validPoints.map((point) => point.lng));
  const north = Math.max(...validPoints.map((point) => point.lat));
  const longitudePadding = Math.max((east - west) * 0.28, 0.025);
  const latitudePadding = Math.max((north - south) * 0.28, 0.025);

  return [
    Math.max(marketBounds[0], west - longitudePadding),
    Math.max(marketBounds[1], south - latitudePadding),
    Math.min(marketBounds[2], east + longitudePadding),
    Math.min(marketBounds[3], north + latitudePadding),
  ] as [number, number, number, number];
}

function boundsCenter([west, south, east, north]: [number, number, number, number]) {
  return {
    lat: (south + north) / 2,
    lng: (west + east) / 2,
  };
}

function fitBoundsZoom([west, south, east, north]: [number, number, number, number]) {
  const longitudeFraction = Math.max((east - west) / 360, Number.EPSILON);
  const latitudeFraction = Math.max(Math.abs(mercatorY(north) - mercatorY(south)), Number.EPSILON);
  const availableWidth = imageWidth - viewportPadding * 2;
  const availableHeight = imageHeight - viewportPadding * 2;
  const longitudeZoom = Math.log2(availableWidth / mapboxTileSize / longitudeFraction);
  const latitudeZoom = Math.log2(availableHeight / mapboxTileSize / latitudeFraction);

  return Math.max(0, Math.min(12.5, longitudeZoom, latitudeZoom));
}

function mercatorY(latitude: number) {
  const clampedLatitude = Math.max(-85.051129, Math.min(85.051129, latitude));
  const sinLatitude = Math.sin((clampedLatitude * Math.PI) / 180);
  return 0.5 - Math.log((1 + sinLatitude) / (1 - sinLatitude)) / (4 * Math.PI);
}

function coordinate(value: number) {
  return Number(value.toFixed(6)).toString();
}
