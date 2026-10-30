"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { PublicBuyerPreviewDTO } from "../lib/buyer-dtos";
import { buyerPopupAvatarHtml, buyerPopupDetailsHtml } from "../lib/buyer-card-popup";
import { previewCardView } from "../lib/buyer-card-view";
import { syncSelectedAreaLayer } from "../lib/map-boundary-layers";
import { selectedAreaBounds, type MarketMapContext, type SelectedMapArea } from "../lib/map-area";
import { clusterBounds, clusterMarkerGroups, clusterZoomLimit } from "../lib/map-marker-clusters";
import { groupMapPoints } from "../lib/map-point-groups";
import { canHover, escapeHtml, quietBasemap } from "../lib/map-presentation";
import type { MapboxMarker, MapboxPopup } from "../lib/mapbox-gl-loader";
import { mapboxStaticImageUrl } from "../lib/mapbox-static-image";
import { useKeyedGeoJson } from "../lib/use-keyed-geojson";
import { fitMapTo, fitMapToMarket, useMarketMap } from "../lib/use-market-map";

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
  const markersRef = useRef<MapboxMarker[]>([]);
  const markerNodesRef = useRef<Map<number, HTMLElement>>(new Map());
  const markerMembersRef = useRef<Map<HTMLElement, number[]>>(new Map());
  const popupRef = useRef<MapboxPopup | null>(null);
  const pinnedPopupRef = useRef<number | null>(null);
  // First preview of the marker whose mini-card is showing, to send focus back on Escape.
  const popupOwnerRef = useRef<number | null>(null);
  const [hasLiveMarkers, setHasLiveMarkers] = useState(false);
  const mapboxToken = token?.trim() ?? "";
  const shouldUseMapbox = Boolean(mapboxToken);
  const { didFail, isReady, mapRef } = useMarketMap({
    containerRef,
    enabled: shouldUseMapbox,
    initialBounds: selectedArea ? selectedAreaBounds(selectedArea) : null,
    initialZoom: 10.6,
    market,
    token: mapboxToken,
  });
  const selectedAreaGeojson = useKeyedGeoJson(shouldUseMapbox ? selectedArea?.geojsonPath : undefined);

  const points = useMemo<PreviewPoint[]>(() => {
    return previews
      .map((preview, index) => ({
        index,
        lat: preview.pin?.latitude ?? NaN,
        lng: preview.pin?.longitude ?? NaN,
        preview,
      }))
      .filter((point) => Number.isFinite(point.lat) && Number.isFinite(point.lng));
  }, [previews]);
  const centerGroups = useMemo(() => groupMapPoints(points), [points]);

  useEffect(() => {
    const map = mapRef.current;
    if (!isReady || !map || !window.mapboxgl) return;
    quietBasemap(map);
    popupRef.current = new window.mapboxgl.Popup({
      className: "liber-map-popup",
      closeButton: false,
      closeOnClick: true,
      focusAfterOpen: false,
      maxWidth: "300px",
      offset: 14,
    });
    return () => {
      popupRef.current?.remove();
      popupRef.current = null;
      pinnedPopupRef.current = null;
      popupOwnerRef.current = null;
    };
  }, [isReady, mapRef]);

  // Escape closes the mini-card (hovered or pinned) and returns focus to its marker.
  useEffect(() => {
    if (!isReady) return;
    function closePopupOnEscape(event: KeyboardEvent) {
      const popup = popupRef.current;
      if (event.key !== "Escape" || event.defaultPrevented || !popup?.isOpen()) return;
      // A modal (the filters sheet) owns Escape while it is open.
      if (event.target instanceof Element && event.target.closest('[aria-modal="true"]')) return;
      const focusWasInPopup = Boolean(popup.getElement()?.contains(document.activeElement));
      const owner = popupOwnerRef.current;
      popup.remove();
      pinnedPopupRef.current = null;
      popupOwnerRef.current = null;
      if (focusWasInPopup && owner !== null) markerNodesRef.current.get(owner)?.focus({ preventScroll: true });
    }
    document.addEventListener("keydown", closePopupOnEscape);
    return () => document.removeEventListener("keydown", closePopupOnEscape);
  }, [isReady]);

  useEffect(() => {
    if (!isReady || !mapRef.current) return;
    syncSelectedAreaLayer(mapRef.current, selectedAreaGeojson);
  }, [isReady, mapRef, selectedAreaGeojson]);

  // Pins re-cluster after every zoom so overlapping areas combine into a count and split apart.
  useEffect(() => {
    const map = mapRef.current;
    const mapboxgl = window.mapboxgl;
    if (!isReady || !map || !mapboxgl) return;
    const cta = {
      primaryHref: primaryCtaHref,
      primaryLabel: primaryCtaLabel,
      secondaryHref: secondaryCtaHref,
      secondaryLabel: secondaryCtaLabel,
    };

    function showPopup(group: { lat: number; lng: number; points: PreviewPoint[] }, pinned: boolean) {
      if (!popupRef.current || !map) return;
      pinnedPopupRef.current = pinned ? group.points[0].index : null;
      popupOwnerRef.current = group.points[0].index;
      const html = group.points.length > 1
        ? `<div class="buyer-map-popup-group">${group.points.map((item) => previewPopupHtml(item.preview, cta)).join("")}</div>`
        : previewPopupHtml(group.points[0].preview, cta);
      popupRef.current.setLngLat([group.lng, group.lat]).setHTML(html).addTo(map);
    }

    const clearMarkers = () => {
      markersRef.current.forEach((marker) => marker.remove());
      markersRef.current = [];
      markerNodesRef.current.clear();
      markerMembersRef.current.clear();
    };

    const renderMarkers = () => {
      // Re-clustering replaces every marker. A keyboard-focused marker hands focus to the new
      // marker holding its first preview, so zooming into a cluster keeps your place.
      const active = document.activeElement;
      const focusedIndexes = active instanceof HTMLElement ? markerMembersRef.current.get(active) : undefined;
      const keepFocus = Boolean(focusedIndexes && active instanceof HTMLElement && active.matches(":focus-visible"));
      clearMarkers();
      for (const cluster of clusterMarkerGroups(centerGroups, (lngLat) => map.project(lngLat))) {
        const items = cluster.members.flatMap((group) => group.points);
        const markerNode = document.createElement("button");
        markerNode.type = "button";
        markerNode.className = cluster.members.length > 1 ? "map-dot-pin public-demand-pin cluster" : "map-dot-pin public-demand-pin";
        markerNode.dataset.publicDemandPreviewIndexes = items.map((item) => item.index).join(",");
        markerNode.innerHTML = items.length > 1
          ? `<span class="public-demand-count" aria-hidden="true">${items.length}</span>`
          : `<span aria-hidden="true"></span>`;

        if (cluster.members.length > 1) {
          markerNode.setAttribute("aria-label", `Zoom in to ${items.length} buyers in ${cluster.members.length} nearby areas`);
          markerNode.addEventListener("click", (event) => {
            event.stopPropagation();
            popupRef.current?.remove();
            fitMapTo(map, clusterBounds(cluster.members), clusterZoomLimit(map));
          });
        } else {
          const group = cluster.anchor;
          markerNode.setAttribute("aria-label", `${items.length} ${items.length === 1 ? "buyer targeting" : "buyers targeting"} ${items[0].preview.area}`);
          markerNode.addEventListener("mouseenter", () => {
            if (canHover() && pinnedPopupRef.current === null) showPopup(group, false);
          });
          markerNode.addEventListener("mouseleave", () => {
            if (pinnedPopupRef.current === null) popupRef.current?.remove();
          });
          markerNode.addEventListener("click", (event) => {
            event.stopPropagation();
            showPopup(group, true);
            // Enter or Space on a marker moves into its mini-card so the links are reachable.
            if (event.detail === 0) {
              popupRef.current?.getElement()?.querySelector<HTMLElement>("a[href]")?.focus({ preventScroll: true });
            }
          });
        }

        markersRef.current.push(new mapboxgl.Marker({ anchor: "center", element: markerNode })
          .setLngLat([cluster.anchor.lng, cluster.anchor.lat])
          .addTo(map));
        markerMembersRef.current.set(markerNode, items.map((item) => item.index));
        for (const item of items) markerNodesRef.current.set(item.index, markerNode);
      }
      if (keepFocus && focusedIndexes?.length) markerNodesRef.current.get(focusedIndexes[0])?.focus({ preventScroll: true });
      setHasLiveMarkers(true);
    };

    renderMarkers();
    map.on("zoomend", renderMarkers);
    return () => {
      map.off("zoomend", renderMarkers);
      clearMarkers();
    };
  }, [centerGroups, isReady, mapRef, primaryCtaHref, primaryCtaLabel, secondaryCtaHref, secondaryCtaLabel]);

  useEffect(() => {
    const map = mapRef.current;
    if (!isReady || !map || !window.mapboxgl) return;
    if (selectedArea) {
      fitMapTo(map, selectedAreaBounds(selectedArea), 13.2);
    } else if (points.length > 1) {
      const bounds = new window.mapboxgl.LngLatBounds();
      points.forEach((point) => bounds.extend([point.lng, point.lat]));
      fitMapTo(map, bounds, 12);
    }
  }, [isReady, mapRef, points, selectedArea]);

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
          onClick={() => {
            if (mapRef.current) fitMapToMarket(mapRef.current, market);
          }}
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
) {
  const view = previewCardView(preview);
  return `
    <div class="map-card preview">
      ${buyerPopupAvatarHtml(view)}
      <span class="map-card-body">
        ${buyerPopupDetailsHtml(view)}
        <span class="map-card-actions">
          <a class="map-card-cta" href="${escapeHtml(cta.primaryHref)}">${escapeHtml(cta.primaryLabel)}</a>
          ${cta.secondaryHref && cta.secondaryLabel ? `<a class="map-card-link" href="${escapeHtml(cta.secondaryHref)}">${escapeHtml(cta.secondaryLabel)}</a>` : ""}
        </span>
      </span>
    </div>
  `;
}
