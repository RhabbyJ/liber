import { serviceAreaBounds, type ServiceArea } from "./service-areas";

export type MarketMapContext = {
  bbox: [number, number, number, number];
  center: {
    lat: number;
    lng: number;
  };
  label: string;
  slug: string;
};

export type SelectedMapArea = Pick<
  ServiceArea,
  "bbox" | "center" | "disclaimer" | "geojsonPath" | "label" | "slug" | "type"
>;

export function selectedMapArea(area?: ServiceArea | null): SelectedMapArea | null {
  if (!area?.active) return null;
  return {
    bbox: area.bbox,
    center: area.center,
    disclaimer: area.disclaimer,
    geojsonPath: area.geojsonPath,
    label: area.label,
    slug: area.slug,
    type: area.type,
  };
}

export function selectedAreaBounds(area: SelectedMapArea) {
  return serviceAreaBounds(area);
}

export function marketMapBounds(market: Pick<MarketMapContext, "bbox">): [[number, number], [number, number]] {
  return serviceAreaBounds(market);
}
