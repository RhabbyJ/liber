"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { PublicBuyerPreviewDTO } from "../lib/buyer-dtos";
import { syncSelectedAreaLayer } from "../lib/map-boundary-layers";
import { canHover, escapeHtml, quietBasemap } from "../lib/map-presentation";
import { loadMapboxGl, type MapboxMap, type MapboxMarker, type MapboxPopup } from "../lib/mapbox-gl-loader";
import { marketMapBounds, marketMapInstanceKey, selectedAreaBounds, type MarketMapContext, type SelectedMapArea } from "../lib/map-area";
import { groupMapPoints } from "../lib/map-point-groups";
import { mapboxStaticImageUrl } from "../lib/mapbox-static-image";
import { useKeyedGeoJson } from "../lib/use-keyed-geojson";
import { criteriaFacts } from "../lib/listing-format";
import { distinctPropertyPhotos } from "../lib/property-photos";

type Props = {
  market: MarketMapContext;
  primaryCtaHref: string;
  primaryCtaLabel: string;
  previews: PublicBuyerPreviewDTO[];
  secondaryCtaHref?: string;
  secondaryCtaLabel?: string;
  selectedArea?: SelectedMapArea | null;
  selectedAreaLabel?: string;
  token?: string;
};

type PreviewPoint = {
  index: number;
  photo: string;
  lat: number;
  lng: number;
  preview: PublicBuyerPreviewDTO;
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
  const popupRef = useRef<MapboxPopup | null>(null);
  const pinnedPopupRef = useRef<number | null>(null);
  const [didFail, setDidFail] = useState(false);
  const [isReady, setIsReady] = useState(false);
  const [hasLiveMarkers, setHasLiveMarkers] = useState(false);
  const mapboxToken = token?.trim() ?? "";
  const shouldUseMapbox = Boolean(mapboxToken);
  const selectedAreaGeojson = useKeyedGeoJson(shouldUseMapbox ? selectedArea?.geojsonPath : undefined);

  const points = useMemo<PreviewPoint[]>(() => {
    const photos = distinctPropertyPhotos(previews.map((preview) => ({ seed: preview.alias, value: preview.label })));
    return previews
        .map((preview, index) => ({
          index,
          photo: photos[index],
          lat: preview.pin?.latitude ?? NaN,
          lng: preview.pin?.longitude ?? NaN,
          preview,
        }))
        .filter((point) => Number.isFinite(point.lat) && Number.isFinite(point.lng));
  }, [previews]);
  const mapInstanceKey = marketMapInstanceKey(market, mapboxToken);
  const [marketWest, marketSouth, marketEast, marketNorth] = market.bbox;
  const marketCenterLat = market.center.lat;
  const marketCenterLng = market.center.lng;

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
          center: [marketCenterLng, marketCenterLat],
          container: containerRef.current,
          cooperativeGestures: false,
          maxBounds: [[marketWest, marketSouth], [marketEast, marketNorth]],
          style: "mapbox://styles/mapbox/streets-v12",
          zoom: 10.6,
        });

        let loaded = false;
        mapRef.current.addControl(new mapboxgl.NavigationControl({ showCompass: false }), "bottom-right");
        popupRef.current = new mapboxgl.Popup({
          className: "liber-map-popup",
          closeButton: false,
          closeOnClick: true,
          focusAfterOpen: false,
          maxWidth: "300px",
          offset: 14,
        });
        mapRef.current.on("load", () => {
          if (canceled || !mapRef.current) return;
          loaded = true;
          quietBasemap(mapRef.current);
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
      popupRef.current?.remove();
      popupRef.current = null;
      mapRef.current?.remove();
      mapRef.current = null;
    };
  }, [
    didFail,
    mapInstanceKey,
    mapboxToken,
    marketCenterLat,
    marketCenterLng,
    marketEast,
    marketNorth,
    marketSouth,
    marketWest,
    shouldUseMapbox,
  ]);

  useEffect(() => {
    if (!isReady || !mapRef.current) return;
    syncSelectedAreaLayer(mapRef.current, selectedAreaGeojson);
  }, [isReady, selectedAreaGeojson]);

  useEffect(() => {
    if (!isReady || !mapRef.current || !window.mapboxgl) return;

    markersRef.current.forEach((marker) => marker.remove());
    markersRef.current = [];
    setHasLiveMarkers(false);

    const map = mapRef.current;
    const cta = {
      primaryHref: primaryCtaHref,
      primaryLabel: primaryCtaLabel,
      secondaryHref: secondaryCtaHref,
      secondaryLabel: secondaryCtaLabel,
    };
    function showPopup(group: { lat: number; lng: number; points: PreviewPoint[] }, pinned: boolean) {
      if (!popupRef.current) return;
      pinnedPopupRef.current = pinned ? group.points[0].index : null;
      const html = group.points.length > 1
        ? `<div class="buyer-map-popup-group">${group.points.map((item) => previewPopupHtml(item.preview, cta, item.photo)).join("")}</div>`
        : previewPopupHtml(group.points[0].preview, cta, group.points[0].photo);
      popupRef.current.setLngLat([group.lng, group.lat]).setHTML(html).addTo(map);
    }

    // Previews that share an area center share one pin; coordinates are never nudged.
    for (const group of groupMapPoints(points)) {
      const point = group.points[0];
      const markerNode = document.createElement("button");
      markerNode.type = "button";
      markerNode.className = "map-dot-pin public-demand-pin";
      markerNode.dataset.publicDemandPreviewIndexes = group.points.map((item) => item.index).join(",");
      markerNode.setAttribute("aria-label", `${group.points.length} ${group.points.length === 1 ? "buyer targeting" : "buyers targeting"} ${point.preview.area}`);
      markerNode.innerHTML = group.points.length > 1
        ? `<span class="public-demand-count" aria-hidden="true">${group.points.length}</span>`
        : `<span aria-hidden="true"></span>`;
      markerNode.addEventListener("mouseenter", () => {
        if (canHover() && pinnedPopupRef.current === null) showPopup(group, false);
      });
      markerNode.addEventListener("mouseleave", () => {
        if (pinnedPopupRef.current === null) popupRef.current?.remove();
      });
      markerNode.addEventListener("click", (event) => {
        event.stopPropagation();
        showPopup(group, true);
      });

      const marker = new window.mapboxgl.Marker({ anchor: "center", element: markerNode })
        .setLngLat([group.lng, group.lat])
        .addTo(map);

      markersRef.current.push(marker);
    }
    setHasLiveMarkers(true);

    if (selectedArea) {
      map.fitBounds(selectedAreaBounds(selectedArea), { duration: 600, maxZoom: 12.6, padding: 72 });
    } else if (points.length > 1) {
      const bounds = new window.mapboxgl.LngLatBounds();
      points.forEach((point) => bounds.extend([point.lng, point.lat]));
      map.fitBounds(bounds, { duration: 600, maxZoom: 12, padding: 72 });
    }
  }, [
    isReady,
    points,
    primaryCtaHref,
    primaryCtaLabel,
    secondaryCtaHref,
    secondaryCtaLabel,
    selectedArea,
  ]);

  if (!shouldUseMapbox || didFail) {
    return <PublicStaticDemandMap market={market} points={points} selectedArea={selectedArea} token={mapboxToken} />;
  }

  return (
    <div
      aria-label={selectedAreaLabel ? `Buyer demand preview map around ${selectedAreaLabel}` : "Buyer demand preview map"}
      className="map-shell"
      role="region"
    >
      <div className="map-canvas" ref={containerRef} />
      <div className="map-overlay-top">
        <button
          aria-label="Fit map to all of Los Angeles County"
          className="map-chip-button"
          onClick={() => mapRef.current?.fitBounds(marketMapBounds(market), { duration: 700, padding: 48 })}
          type="button"
        >
          View all LA County
        </button>
      </div>
      {hasLiveMarkers || isReady ? null : (
        <div className="map-toast" role="status">
          <span className="map-toast-spinner" aria-hidden="true" />
          Loading map
        </div>
      )}
      <p className="map-footnote">
        {selectedArea ? "Selected boundary · buyer target areas" : "Buyer target areas · not home addresses"}
      </p>
    </div>
  );
}

function PublicStaticDemandMap({
  market,
  points,
  selectedArea,
  token,
}: {
  market: MarketMapContext;
  points: PreviewPoint[];
  selectedArea: SelectedMapArea | null;
  token: string;
}) {
  return (
    <div aria-label="Buyer demand preview map" className="map-shell fallback" role="region">
      <StaticDemandLayer market={market} points={points} selectedArea={selectedArea} token={token} />
      <p className="map-footnote">Buyer target areas · not home addresses</p>
    </div>
  );
}

function StaticDemandLayer({
  market,
  points,
  selectedArea,
  token,
}: {
  market: MarketMapContext;
  points: PreviewPoint[];
  selectedArea: SelectedMapArea | null;
  token: string;
}) {
  const imageUrl = mapboxStaticImageUrl({ market, points, selectedArea, token });
  const [failedImageUrl, setFailedImageUrl] = useState("");
  const canShowImage = Boolean(imageUrl && failedImageUrl !== imageUrl);

  return (
    <div className="public-map-static-grid">
      {canShowImage && imageUrl ? (
        // Mapbox already returns a fixed rendered map; proxying it through Next Image would duplicate the request.
        // eslint-disable-next-line @next/next/no-img-element
        <img
          alt=""
          className="public-map-static-image"
          key={imageUrl}
          loading="eager"
          onError={() => setFailedImageUrl(imageUrl)}
          referrerPolicy="strict-origin-when-cross-origin"
          src={imageUrl}
        />
      ) : (
        <div className="public-map-static-empty">
          <strong>Map preview unavailable</strong>
          <span>Search and buyer preview cards still work.</span>
        </div>
      )}
    </div>
  );
}

function previewPopupHtml(
  preview: PublicBuyerPreviewDTO,
  cta: {
    primaryHref: string;
    primaryLabel: string;
    secondaryHref?: string;
    secondaryLabel?: string;
  },
  photo: string,
) {
  const facts = criteriaFacts(preview).map((fact) => `<b>${escapeHtml(fact.value)}</b> ${escapeHtml(fact.label)}`);

  return `
    <div class="map-card preview">
      <span class="map-card-media"><img alt="" src="${escapeHtml(photo)}" /></span>
      <span class="map-card-body">
        <strong class="map-card-price">${escapeHtml(preview.budgetLabel)}</strong>
        ${facts.length > 0 ? `<span class="map-card-facts">${facts.join("<i></i>")}</span>` : ""}
        <span class="map-card-address">${escapeHtml(preview.area)}</span>
        <span class="map-card-actions">
          <a class="map-card-cta" href="${escapeHtml(cta.primaryHref)}">${escapeHtml(cta.primaryLabel)}</a>
          ${cta.secondaryHref && cta.secondaryLabel ? `<a class="map-card-link" href="${escapeHtml(cta.secondaryHref)}">${escapeHtml(cta.secondaryLabel)}</a>` : ""}
        </span>
      </span>
    </div>
  `;
}
