export type SelectedMapArea = {
  lat: number;
  lng: number;
  radiusMiles: number;
};

export function selectedMapArea(centerLat?: number, centerLng?: number, radiusMiles?: number): SelectedMapArea | null {
  if (!Number.isFinite(centerLat) || !Number.isFinite(centerLng) || !Number.isFinite(radiusMiles)) return null;
  if ((radiusMiles as number) <= 0) return null;
  return { lat: centerLat as number, lng: centerLng as number, radiusMiles: radiusMiles as number };
}

export function selectedAreaFeature(area: SelectedMapArea) {
  return {
    geometry: {
      coordinates: [circleCoordinates(area, 96)],
      type: "Polygon",
    },
    properties: {},
    type: "Feature",
  };
}

export function selectedAreaBounds(area: SelectedMapArea) {
  const coordinates = circleCoordinates(area, 48);
  const lats = coordinates.map(([, lat]) => lat);
  const lngs = coordinates.map(([lng]) => lng);

  return [
    [Math.min(...lngs), Math.min(...lats)],
    [Math.max(...lngs), Math.max(...lats)],
  ];
}

function circleCoordinates(area: SelectedMapArea, steps: number) {
  const earthRadiusMiles = 3958.8;
  const angularDistance = area.radiusMiles / earthRadiusMiles;
  const lat = toRadians(area.lat);
  const lng = toRadians(area.lng);
  const coordinates: Array<[number, number]> = [];

  for (let index = 0; index <= steps; index += 1) {
    const bearing = (2 * Math.PI * index) / steps;
    const pointLat = Math.asin(
      Math.sin(lat) * Math.cos(angularDistance) +
        Math.cos(lat) * Math.sin(angularDistance) * Math.cos(bearing),
    );
    const pointLng =
      lng +
      Math.atan2(
        Math.sin(bearing) * Math.sin(angularDistance) * Math.cos(lat),
        Math.cos(angularDistance) - Math.sin(lat) * Math.sin(pointLat),
      );

    coordinates.push([toDegrees(pointLng), toDegrees(pointLat)]);
  }

  return coordinates;
}

function toRadians(value: number) {
  return value * (Math.PI / 180);
}

function toDegrees(value: number) {
  return value * (180 / Math.PI);
}
