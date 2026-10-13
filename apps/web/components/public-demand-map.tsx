"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import type { PublicBuyerPreviewDto } from "../lib/buyer-dto-types";
import { syncSelectedAreaLayer } from "../lib/map-boundary-layers";
import {
  isFatalMapError,
  liberMapOptions,
  mapCameraTarget,
  mapFitPadding,
  readMapView,
  saveMapView,
  type MapCameraTarget,
} from "../lib/map-camera";
import { canHover, escapeHtml, lockMapOrientation, quietBasemap, wirePopupInteractions } from "../lib/map-presentation";
import { loadMapboxGl, preloadMapboxGl, type MapboxMap, type MapboxMarker, type MapboxPopup } from "../lib/mapbox-gl-loader";
import { marketMapBounds, marketMapInstanceKey, type MarketMapContext, type SelectedMapArea } from "../lib/map-area";
import { mapboxStaticImageUrl } from "../lib/mapbox-static-image";
import { useKeyedGeoJson } from "../lib/use-keyed-geojson";
import { criteriaFacts } from "../lib/listing-format";
import { propertyArtworkSrc } from "./property-type-artwork";

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
  const mapboxToken = token?.trim() ?? "";
  if (mapboxToken) preloadMapboxGl();
  const router = useRouter();
  const viewScope = `${usePathname()}?${useSearchParams().toString()}`;
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MapboxMap | null>(null);
  const markersRef = useRef<MapboxMarker[]>([]);
  const popupRef = useRef<MapboxPopup | null>(null);
  const pinnedPopupRef = useRef<number | null>(null);
  const cameraKeyRef = useRef<string | null>(null);
  const latestCameraRef = useRef<{ target: MapCameraTarget; viewScope: string } | null>(null);
  const [didFail, setDidFail] = useState(false);
  const [isReady, setIsReady] = useState(false);
  const [hasLiveMarkers, setHasLiveMarkers] = useState(false);
  const shouldUseMapbox = Boolean(mapboxToken);
  const selectedAreaGeojson = useKeyedGeoJson(shouldUseMapbox ? selectedArea?.geojsonPath : undefined);

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
  const mapInstanceKey = marketMapInstanceKey(market, mapboxToken);
  const [marketWest, marketSouth, marketEast, marketNorth] = market.bbox;
  const marketBoundsContext = useMemo(
    () => ({ bbox: [marketWest, marketSouth, marketEast, marketNorth] as [number, number, number, number] }),
    [marketEast, marketNorth, marketSouth, marketWest],
  );
  const cameraTarget = useMemo(() => mapCameraTarget(market, selectedArea, points), [market, points, selectedArea]);

  useEffect(() => {
    setDidFail(false);
  }, [mapInstanceKey]);

  useEffect(() => {
    latestCameraRef.current = { target: cameraTarget, viewScope };
  }, [cameraTarget, viewScope]);

  useEffect(() => {
    if (didFail) return;
    let canceled = false;
    let resizeObserver: ResizeObserver | null = null;
    setIsReady(false);

    async function setupMap() {
      if (!containerRef.current || !shouldUseMapbox) return;

      try {
        const mapboxgl = await loadMapboxGl();
        if (canceled || !containerRef.current) return;

        mapboxgl.accessToken = mapboxToken;
        const camera = latestCameraRef.current;
        const savedView = camera ? readMapView(camera.viewScope, marketBoundsContext) : null;
        cameraKeyRef.current = camera?.target.key ?? null;
        const map = new mapboxgl.Map(liberMapOptions(containerRef.current, marketBoundsContext, savedView, camera?.target));
        mapRef.current = map;
        lockMapOrientation(map);

        let loaded = false;
        map.addControl(new mapboxgl.NavigationControl({ showCompass: false }), "bottom-right");
        popupRef.current = new mapboxgl.Popup({
          className: "liber-map-popup",
          closeButton: false,
          closeOnClick: true,
          focusAfterOpen: false,
          maxWidth: "300px",
          offset: 14,
        });
        popupRef.current.on("close", () => {
          pinnedPopupRef.current = null;
        });
        map.on("style.load", () => {
          if (canceled) return;
          quietBasemap(map);
          setIsReady(true);
        });
        map.on("load", () => {
          loaded = true;
        });
        map.on("moveend", () => {
          const scope = latestCameraRef.current?.viewScope;
          if (!canceled && scope) saveMapView(scope, { center: [map.getCenter().lng, map.getCenter().lat], zoom: map.getZoom() });
        });
        // Style, auth, or network failure before first render is fatal; a failed tile is not.
        map.on("error", (event) => {
          if (!canceled && !loaded && isFatalMapError(event)) setDidFail(true);
        });
        resizeObserver = new ResizeObserver(() => mapRef.current?.resize());
        resizeObserver.observe(containerRef.current);
      } catch {
        if (!canceled) setDidFail(true);
      }
    }

    setHasLiveMarkers(false);
    setupMap();

    return () => {
      canceled = true;
      resizeObserver?.disconnect();
      markersRef.current.forEach((marker) => marker.remove());
      markersRef.current = [];
      popupRef.current?.remove();
      popupRef.current = null;
      mapRef.current?.remove();
      mapRef.current = null;
    };
  }, [didFail, mapInstanceKey, mapboxToken, marketBoundsContext, shouldUseMapbox]);

  useEffect(() => {
    const map = mapRef.current;
    if (!isReady || !map || cameraKeyRef.current === cameraTarget.key) return;
    cameraKeyRef.current = cameraTarget.key;
    const savedView = readMapView(viewScope, marketBoundsContext);
    if (savedView) {
      map.jumpTo(savedView);
      return;
    }
    map.fitBounds(cameraTarget.bounds, { duration: 600, maxZoom: cameraTarget.maxZoom, padding: mapFitPadding });
  }, [cameraTarget, isReady, marketBoundsContext, viewScope]);

  useEffect(() => {
    if (!isReady || !mapRef.current) return;
    syncSelectedAreaLayer(mapRef.current, selectedAreaGeojson);
  }, [isReady, selectedAreaGeojson]);

  useEffect(() => {
    if (!isReady || !mapRef.current || !window.mapboxgl) return;

    popupRef.current?.remove();
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
    function showPopup(point: PreviewPoint, pinned: boolean, markerNode: HTMLElement, viaKeyboard = false) {
      const popup = popupRef.current;
      if (!popup) return;
      popup.setLngLat([point.lng, point.lat]).setHTML(previewPopupHtml(point.preview, cta)).addTo(map);
      // addTo() closes an already-open popup first, which clears the pin; record the new state after it.
      pinnedPopupRef.current = pinned ? point.index : null;
      wirePopupInteractions(popup, { focusLink: viaKeyboard, navigate: (href) => router.push(href), returnFocusTo: markerNode });
    }

    for (const point of points) {
      const markerNode = document.createElement("button");
      markerNode.type = "button";
      // Mapbox gives custom marker elements role="img" unless they already declare a role.
      markerNode.setAttribute("role", "button");
      markerNode.className = "map-dot-pin public-demand-pin";
      markerNode.dataset.publicDemandPreviewIndex = String(point.index);
      markerNode.setAttribute("aria-label", `Buyer demand around ${point.preview.area}`);
      markerNode.innerHTML = `<span aria-hidden="true"></span>`;
      markerNode.addEventListener("mouseenter", () => {
        if (canHover() && pinnedPopupRef.current === null) showPopup(point, false, markerNode);
      });
      markerNode.addEventListener("mouseleave", () => {
        if (pinnedPopupRef.current === null) popupRef.current?.remove();
      });
      markerNode.addEventListener("click", (event) => {
        event.stopPropagation();
        showPopup(point, true, markerNode, event.detail === 0);
      });

      const marker = new window.mapboxgl.Marker({ element: markerNode })
        .setLngLat([point.lng, point.lat])
        .addTo(map);

      markersRef.current.push(marker);
    }
    setHasLiveMarkers(points.length > 0);
  }, [
    isReady,
    points,
    primaryCtaHref,
    primaryCtaLabel,
    router,
    secondaryCtaHref,
    secondaryCtaLabel,
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
        {selectedArea ? "Selected area boundary · anonymized demand" : "Approximate locations · anonymized demand"}
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
      <p className="map-footnote">Approximate locations · privacy-safe preview</p>
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
  preview: PublicBuyerPreviewDto,
  cta: {
    primaryHref: string;
    primaryLabel: string;
    secondaryHref?: string;
    secondaryLabel?: string;
  },
) {
  const facts = criteriaFacts(preview).map((fact) => `<b>${escapeHtml(fact.value)}</b> ${escapeHtml(fact.label)}`);

  return `
    <div class="map-card preview">
      <span class="map-card-media"><img alt="" src="${escapeHtml(propertyArtworkSrc(preview.label))}" /></span>
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
