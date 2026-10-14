"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { PublicBuyerPreviewDTO } from "../lib/buyer-dtos";
import { syncSelectedAreaLayer } from "../lib/map-boundary-layers";
import type { MapboxMarker } from "../lib/mapbox-gl-loader";
import { selectedAreaBounds, type MarketMapContext, type SelectedMapArea } from "../lib/map-area";
import { clusterBounds, clusterMarkerGroups, clusterZoomLimit } from "../lib/map-marker-clusters";
import { groupMapPoints } from "../lib/map-point-groups";
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
  const centerGroups = useMemo(() => groupMapPoints(points), [points]);

  useEffect(() => {
    if (!isReady || !mapRef.current) return;
    syncSelectedAreaLayer(mapRef.current, selectedAreaGeojson);
  }, [isReady, mapRef, selectedAreaGeojson]);

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

    const clearMarkers = () => {
      markersRef.current.forEach((marker) => marker.remove());
      markersRef.current = [];
    };

    const renderMarkers = () => {
      clearMarkers();
      for (const cluster of clusterMarkerGroups(centerGroups, (lngLat) => map.project(lngLat))) {
        const items = cluster.members.flatMap((group) => group.points);
        const markerNode = document.createElement("button");
        markerNode.type = "button";
        markerNode.className = "buyer-map-marker public-demand-pin";
        markerNode.dataset.publicDemandPreviewIndexes = items.map((item) => item.index).join(",");
        markerNode.innerHTML = items.length > 1
          ? `<span class="public-demand-count" aria-hidden="true">${items.length}</span>`
          : `<span aria-hidden="true"></span>`;
        let marker = new mapboxgl.Marker({ anchor: "center", element: markerNode })
          .setLngLat([cluster.anchor.lng, cluster.anchor.lat]);

        if (cluster.members.length > 1) {
          markerNode.setAttribute("aria-label", `Zoom in to ${items.length} buyers in ${cluster.members.length} nearby areas`);
          markerNode.addEventListener("click", () => fitMapTo(map, clusterBounds(cluster.members), clusterZoomLimit(map)));
        } else {
          markerNode.setAttribute("aria-label", `${items.length} ${items.length === 1 ? "buyer targeting" : "buyers targeting"} ${items[0].preview.area}`);
          marker = marker.setPopup(new mapboxgl.Popup({ closeButton: true, maxWidth: "300px", offset: 18 }).setHTML(
            `<div class="buyer-map-popup-group">${items.map((item) => previewPopupHtml(item.preview, cta)).join("")}</div>`,
          ));
        }
        markersRef.current.push(marker.addTo(map));
      }
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
      className="public-map-shell"
    >
      {hasLiveMarkers ? null : <div className="public-map-loading">Loading map…</div>}
      <div className="map-canvas" ref={containerRef} />
      <button
        aria-label="Fit map to all of Los Angeles County"
        className="map-view-all-control"
        onClick={() => {
          if (mapRef.current) fitMapToMarket(mapRef.current, market);
        }}
        type="button"
      >
        View all LA County
      </button>
      <div className="public-map-note">
        {selectedArea ? "Selected boundary · buyer target areas" : "Buyer target areas · not home addresses"}
      </div>
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
    <div className="public-map-shell fallback" aria-label="Buyer demand preview map">
      <StaticDemandLayer market={market} points={points} selectedArea={selectedArea} token={token} />
      <div className="public-map-note">Buyer target areas · not home addresses</div>
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
