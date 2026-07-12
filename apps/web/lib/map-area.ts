import { serviceAreaBounds, type ServiceArea } from "./service-areas";

export type MarketMapContext = {
  bbox: [number, number, number, number];
  boundaryGeojsonPath?: string;
  center: {
    lat: number;
    lng: number;
  };
  label: string;
  slug: string;
};

export type SelectedMapArea = Pick<
  ServiceArea,
  "bbox" | "center" | "geojsonPath" | "label"
>;

export function selectedMapArea(area?: ServiceArea | null): SelectedMapArea | null {
  if (!area?.active) return null;
  return {
    bbox: area.bbox,
    center: area.center,
    geojsonPath: area.geojsonPath,
    label: area.label,
  };
}

export function selectedAreaBounds(area: SelectedMapArea) {
  return serviceAreaBounds(area);
}

export function marketMapBounds(market: Pick<MarketMapContext, "bbox">): [[number, number], [number, number]] {
  return serviceAreaBounds(market);
}

export function marketMapInstanceKey(market: MarketMapContext, rendererKey = "") {
  return [rendererKey, market.slug, ...market.bbox, market.center.lng, market.center.lat].join(":");
}
