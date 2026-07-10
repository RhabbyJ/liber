"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { PublicBuyerPreviewDto } from "../lib/buyer-dto-types";
import { loadMapboxGl, type MapboxMap, type MapboxMarker } from "../lib/mapbox-gl-loader";
import { marketMapBounds, marketMapInstanceKey, selectedAreaBounds, type MarketMapContext, type SelectedMapArea } from "../lib/map-area";
import { useSelectedAreaGeoJson } from "../lib/use-selected-area-geojson";

type Props = {
  market: MarketMapContext;
  primaryCtaHref: string;
  primaryCtaLabel: string;
  previews: PublicBuyerPreviewDto[];
  secondaryCtaHref?: string;
  secondaryCtaLabel?: string;
  selectedArea?: SelectedMapArea | null;
  selectedAreaLabel?: string;
  token?: string;
};

type PreviewPoint = {
  index: number;
  lat: number;
  lng: number;
  preview: PublicBuyerPreviewDto;
};

/**
 * Public Zillow-style buyer-demand map. Pins show anonymized demand at
 * approximate locations only. There are no buyer ids, names, budget labels, or profile
 * links here. Calls to action route users into the authenticated seller workflow.
 */
export function PublicDemandMap({
  market,
  previews,
  primaryCtaHref,
  primaryCtaLabel,
  secondaryCtaHref,
  secondaryCtaLabel,
  selectedArea = null,
  selectedAreaLabel,
  token,
}: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MapboxMap | null>(null);
  const markersRef = useRef<MapboxMarker[]>([]);
  const [didFail, setDidFail] = useState(false);
  const [isReady, setIsReady] = useState(false);
  const [hasLiveMarkers, setHasLiveMarkers] = useState(false);
  const selectedAreaGeojson = useSelectedAreaGeoJson(selectedArea);

  const points = useMemo<PreviewPoint[]>(
    () =>
      previews
        .map((preview, index) => ({
          index,
          lat: preview.pin?.latitude ?? NaN,
          lng: preview.pin?.longitude ?? NaN,
          preview,
        }))
        .filter((point) => Number.isFinite(point.lat) && Number.isFinite(point.lng)),
    [previews],
  );
  const mapboxToken = token?.trim() ?? "";
  const shouldUseMapbox = Boolean(mapboxToken);
  const mapInstanceKey = marketMapInstanceKey(market, mapboxToken);

  useEffect(() => {
    setDidFail(false);
  }, [mapInstanceKey]);

  useEffect(() => {
    if (didFail) return;
    let canceled = false;
    setIsReady(false);

    async function setupMap() {
      if (!containerRef.current || !shouldUseMapbox) return;

      try {
        const mapboxgl = await loadMapboxGl();
        if (canceled || !containerRef.current) return;

        mapboxgl.accessToken = mapboxToken;
        mapRef.current = new mapboxgl.Map({
          antialias: true,
          attributionControl: true,
          center: [market.center.lng, market.center.lat],
          container: containerRef.current,
          cooperativeGestures: false,
          maxBounds: marketMapBounds(market),
          style: "mapbox://styles/mapbox/streets-v12",
          zoom: 10.6,
        });

        let loaded = false;
        mapRef.current.addControl(new mapboxgl.NavigationControl({ showCompass: false }), "bottom-right");
        mapRef.current.on("load", () => {
          if (canceled) return;
          loaded = true;
          setIsReady(true);
        });
        // Only treat errors before first load as fatal; later tile hiccups are recoverable.
        mapRef.current.on("error", () => {
          if (!canceled && !loaded) setDidFail(true);
        });
      } catch {
        if (!canceled) setDidFail(true);
      }
    }

    setHasLiveMarkers(false);
    setupMap();

    return () => {
      canceled = true;
      markersRef.current.forEach((marker) => marker.remove());
      markersRef.current = [];
      mapRef.current?.remove();
      mapRef.current = null;
    };
  }, [didFail, mapInstanceKey, shouldUseMapbox]);

  useEffect(() => {
    if (!isReady || !mapRef.current || !window.mapboxgl) return;

    markersRef.current.forEach((marker) => marker.remove());
    markersRef.current = [];
    syncSelectedAreaLayer(mapRef.current, selectedAreaGeojson);
    setHasLiveMarkers(false);

    for (const point of points) {
      const markerNode = document.createElement("button");
      markerNode.type = "button";
      markerNode.className = "buyer-map-marker public-demand-pin";
      markerNode.setAttribute("aria-label", `Buyer demand around ${point.preview.area}`);
      markerNode.innerHTML = `<span aria-hidden="true"></span>`;

      const popup = new window.mapboxgl.Popup({ closeButton: true, offset: 18 }).setHTML(
        previewPopupHtml(point.preview, {
          primaryHref: primaryCtaHref,
          primaryLabel: primaryCtaLabel,
          secondaryHref: secondaryCtaHref,
          secondaryLabel: secondaryCtaLabel,
        }),
      );
      const marker = new window.mapboxgl.Marker({ element: markerNode })
        .setLngLat([point.lng, point.lat])
        .setPopup(popup)
        .addTo(mapRef.current);

      markersRef.current.push(marker);
    }
    setHasLiveMarkers(points.length > 0);

    if (selectedArea) {
      mapRef.current.fitBounds(selectedAreaBounds(selectedArea), { maxZoom: 12.6, padding: 92 });
    } else if (points.length > 1) {
      const bounds = new window.mapboxgl.LngLatBounds();
      points.forEach((point) => bounds.extend([point.lng, point.lat]));
      mapRef.current.fitBounds(bounds, { maxZoom: 12, padding: 90 });
    }
  }, [
    isReady,
    points,
    primaryCtaHref,
    primaryCtaLabel,
    secondaryCtaHref,
    secondaryCtaLabel,
    selectedArea,
    selectedAreaGeojson,
  ]);

  if (!shouldUseMapbox || didFail) {
    return <PublicStaticDemandMap points={points} />;
  }

  return (
    <div
      aria-label={selectedAreaLabel ? `Buyer demand preview map around ${selectedAreaLabel}` : "Buyer demand preview map"}
      className="public-map-shell"
    >
      {hasLiveMarkers ? null : <StaticDemandLayer points={points} />}
      <div className="map-canvas" ref={containerRef} />
      <div className="public-map-note">Approximate service area - anonymized preview</div>
    </div>
  );
}

function PublicStaticDemandMap({ points }: { points: PreviewPoint[] }) {
  return (
    <div className="public-map-shell fallback" aria-label="Buyer demand preview map">
      <StaticDemandLayer points={points} />
      <div className="public-map-note">Approximate service area - privacy-safe preview</div>
    </div>
  );
}

function StaticDemandLayer({ points }: { points: PreviewPoint[] }) {
  return (
    <div className="public-map-static-grid">
      {points.length === 0 ? (
        <div className="public-map-static-empty">
          <strong>Buyer demand map</strong>
          <span>Preview pins will appear as active buyer demand is added.</span>
        </div>
      ) : (
        points.map((point) => {
          const position = publicPinPosition(point, points);
          return (
            <span
              aria-label={`Buyer demand around ${point.preview.area}`}
              className="buyer-map-marker public-map-static-pin"
              key={`${point.preview.area}-${point.index}`}
              style={{ left: `${position.left}%`, top: `${position.top}%` }}
            >
              <span aria-hidden="true" />
            </span>
          );
        })
      )}
    </div>
  );
}

function previewPopupHtml(
  preview: PublicBuyerPreviewDto,
  cta: {
    primaryHref: string;
    primaryLabel: string;
    secondaryHref?: string;
    secondaryLabel?: string;
  },
) {
  const facts = [
    preview.bedroomsMin ? `${preview.bedroomsMin}+ bed` : null,
    preview.bathroomsMin ? `${preview.bathroomsMin}+ bath` : null,
    preview.squareFeetMin ? `${preview.squareFeetMin.toLocaleString()}+ sqft` : null,
    preview.condition || null,
  ].filter(Boolean) as string[];

  return `
    <div class="buyer-map-popup">
      ${facts.length > 0 ? `<span>${escapeHtml(facts.join(" - "))}</span>` : ""}
      <span>${escapeHtml(preview.label)} - ${escapeHtml(preview.area)}</span>
      <div>
        <a href="${escapeHtml(cta.primaryHref)}">${escapeHtml(cta.primaryLabel)}</a>
        ${cta.secondaryHref && cta.secondaryLabel ? `<a href="${escapeHtml(cta.secondaryHref)}">${escapeHtml(cta.secondaryLabel)}</a>` : ""}
      </div>
    </div>
  `;
}

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function publicPinPosition(point: PreviewPoint, points: PreviewPoint[]) {
  const lats = points.map((item) => item.lat);
  const lngs = points.map((item) => item.lng);
  const minLat = Math.min(...lats);
  const maxLat = Math.max(...lats);
  const minLng = Math.min(...lngs);
  const maxLng = Math.max(...lngs);
  const latSpan = maxLat - minLat || 0.1;
  const lngSpan = maxLng - minLng || 0.1;
  const offset = staticPinOffset(point.index);

  return {
    left: clamp(((point.lng - minLng) / lngSpan) * 76 + 12 + offset.left),
    top: clamp((1 - (point.lat - minLat) / latSpan) * 76 + 12 + offset.top),
  };
}

function staticPinOffset(index: number) {
  const offsets = [
    { left: 0, top: 0 },
    { left: 8, top: -5 },
    { left: -7, top: 5 },
    { left: 7, top: 6 },
    { left: -8, top: -6 },
    { left: 10, top: 3 },
  ];
  return offsets[index % offsets.length];
}

function clamp(value: number) {
  return Math.max(24, Math.min(76, value));
}

const selectedAreaSourceId = "liber-selected-service-area-source";
const selectedAreaFillLayerId = "liber-selected-service-area-fill";
const selectedAreaLineLayerId = "liber-selected-service-area-outline";

function syncSelectedAreaLayer(map: MapboxMap, data: Record<string, unknown> | null) {
  if (!data) {
    removeSelectedAreaLayer(map);
    return;
  }

  const source = map.getSource(selectedAreaSourceId);
  if (source) {
    source.setData(data);
    return;
  }

  map.addSource(selectedAreaSourceId, { data, type: "geojson" });
  map.addLayer({
    id: selectedAreaFillLayerId,
    paint: {
      "fill-color": "#16834c",
      "fill-opacity": 0.08,
    },
    source: selectedAreaSourceId,
    type: "fill",
  });
  map.addLayer({
    id: selectedAreaLineLayerId,
    paint: {
      "line-color": "#0e5f38",
      "line-dasharray": [2, 1],
      "line-opacity": 0.84,
      "line-width": 3,
    },
    source: selectedAreaSourceId,
    type: "line",
  });
}

function removeSelectedAreaLayer(map: MapboxMap) {
  if (map.getLayer(selectedAreaLineLayerId)) map.removeLayer(selectedAreaLineLayerId);
  if (map.getLayer(selectedAreaFillLayerId)) map.removeLayer(selectedAreaFillLayerId);
  if (map.getSource(selectedAreaSourceId)) map.removeSource(selectedAreaSourceId);
}
