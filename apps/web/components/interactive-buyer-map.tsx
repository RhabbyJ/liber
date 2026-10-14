"use client";

import { useCallback, useEffect, useMemo, useRef } from "react";
import { formatRange } from "../lib/format";
import { groupMapPoints } from "../lib/map-point-groups";
import { approximateBuyerPoint } from "../lib/buyer-map-point";
import { syncSelectedAreaLayer } from "../lib/map-boundary-layers";
import { clusterBounds, clusterMarkerGroups, clusterZoomLimit } from "../lib/map-marker-clusters";
import { selectedAreaBounds, type MarketMapContext, type SelectedMapArea } from "../lib/map-area";
import type { MapboxMarker } from "../lib/mapbox-gl-loader";
import type { SellerBuyerSummaryDTO } from "../lib/buyer-dtos";
import { useKeyedGeoJson } from "../lib/use-keyed-geojson";
import { fitMapTo, fitMapToMarket, useMarketMap } from "../lib/use-market-map";
import { StaticBuyerMap } from "./static-buyer-map";

type Props = {
  buyers: SellerBuyerSummaryDTO[];
  market: MarketMapContext;
  selectedServiceArea?: SelectedMapArea | null;
  token: string;
};

type BuyerPoint = {
  buyer: SellerBuyerSummaryDTO;
  lat: number;
  lng: number;
};

export function InteractiveBuyerMap({ buyers, market, selectedServiceArea: selectedArea = null, token }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const markersRef = useRef<MapboxMarker[]>([]);
  const markerNodesRef = useRef<Map<string, HTMLElement>>(new Map());
  const { didFail, isReady, mapRef } = useMarketMap({
    containerRef,
    initialBounds: selectedArea ? selectedAreaBounds(selectedArea) : null,
    market,
    token,
  });
  const selectedAreaGeojson = useKeyedGeoJson(selectedArea?.geojsonPath);

  const buyerPoints = useMemo(
    () =>
      buyers
        .map((buyer) => {
          const point = approximateBuyerPoint(buyer);
          return point ? { buyer, ...point } : null;
        })
        .filter((point): point is BuyerPoint => point !== null),
    [buyers],
  );
  const centerGroups = useMemo(() => groupMapPoints(buyerPoints), [buyerPoints]);
  const highlightBuyer = useCallback((buyerId: string, active: boolean) => {
    markerNodesRef.current.get(buyerId)?.classList.toggle("active", active);
    document
      .querySelector<HTMLElement>(`.buyer-card[data-buyer-id="${cssEscape(buyerId)}"], .buyer-row[data-buyer-id="${cssEscape(buyerId)}"]`)
      ?.classList.toggle("active", active);
  }, []);

  useEffect(() => {
    if (!isReady || !mapRef.current) return;
    syncSelectedAreaLayer(mapRef.current, selectedAreaGeojson);
  }, [isReady, mapRef, selectedAreaGeojson]);

  // Markers re-cluster after every zoom so overlapping centers combine and split.
  useEffect(() => {
    const map = mapRef.current;
    const mapboxgl = window.mapboxgl;
    if (!isReady || !map || !mapboxgl) return;

    const clearMarkers = () => {
      markersRef.current.forEach((marker) => marker.remove());
      markersRef.current = [];
      markerNodesRef.current.clear();
    };

    const renderMarkers = () => {
      clearMarkers();
      for (const cluster of clusterMarkerGroups(centerGroups, (lngLat) => map.project(lngLat))) {
        const buyersHere = cluster.members.flatMap((group) => group.points.map((point) => point.buyer));
        const markerNode = document.createElement("button");
        markerNode.type = "button";
        const isMultiCenter = cluster.members.length > 1;
        let marker = new mapboxgl.Marker({ anchor: "center", element: markerNode })
          .setLngLat([cluster.anchor.lng, cluster.anchor.lat]);

        if (isMultiCenter) {
          markerNode.className = "buyer-map-marker cluster";
          markerNode.setAttribute("aria-label", `Zoom in to ${buyersHere.length} buyers in ${cluster.members.length} nearby areas`);
          markerNode.innerHTML = `<span>${buyersHere.length} buyers</span>`;
          markerNode.addEventListener("click", () => fitMapTo(map, clusterBounds(cluster.members), clusterZoomLimit(map)));
        } else {
          markerNode.className = buyersHere.length > 1 ? "buyer-map-marker group" : "buyer-map-marker";
          markerNode.setAttribute("aria-label", buyersHere.length > 1
            ? `Open ${buyersHere.length} buyers targeting ${buyersHere[0].location}`
            : `Open ${buyersHere[0].isDemo ? "demo buyer " : ""}${buyersHere[0].name} map marker`);
          markerNode.innerHTML = `<span>${buyersHere.length > 1 ? `${buyersHere.length} buyers` : escapeHtml(budgetPinLabel(buyersHere[0]))}</span>`;
          const popup = new mapboxgl.Popup({ closeButton: true, maxWidth: "300px", offset: 20 }).setHTML(
            `<div class="buyer-map-popup-group">${buyersHere.map(popupHtml).join("")}</div>`,
          );
          marker = marker.setPopup(popup);
        }

        markerNode.addEventListener("mouseenter", () => buyersHere.forEach((buyer) => highlightBuyer(buyer.id, true)));
        markerNode.addEventListener("mouseleave", () => buyersHere.forEach((buyer) => highlightBuyer(buyer.id, false)));
        markersRef.current.push(marker.addTo(map));
        for (const buyer of buyersHere) markerNodesRef.current.set(buyer.id, markerNode);
      }
    };

    renderMarkers();
    map.on("zoomend", renderMarkers);
    return () => {
      map.off("zoomend", renderMarkers);
      clearMarkers();
    };
  }, [centerGroups, highlightBuyer, isReady, mapRef]);

  // The camera follows the search: the selected boundary first, otherwise the buyers.
  useEffect(() => {
    const map = mapRef.current;
    if (!isReady || !map || !window.mapboxgl) return;
    if (selectedArea) {
      fitMapTo(map, selectedAreaBounds(selectedArea), 13.2);
    } else if (buyerPoints.length > 1) {
      const bounds = new window.mapboxgl.LngLatBounds();
      buyerPoints.forEach((point) => bounds.extend([point.lng, point.lat]));
      fitMapTo(map, bounds, 12.4);
    } else if (buyerPoints.length === 1) {
      map.easeTo({ center: [buyerPoints[0].lng, buyerPoints[0].lat], duration: 600, zoom: 11.5 });
    }
  }, [buyerPoints, isReady, mapRef, selectedArea]);

  useEffect(() => {
    const cards = Array.from(document.querySelectorAll<HTMLElement>(".buyer-card[data-buyer-id], .buyer-row[data-buyer-id]"));
    const cleanup: Array<() => void> = [];

    for (const card of cards) {
      const buyerId = card.dataset.buyerId;
      if (!buyerId) continue;
      const onEnter = () => highlightBuyer(buyerId, true);
      const onLeave = () => highlightBuyer(buyerId, false);
      card.addEventListener("mouseenter", onEnter);
      card.addEventListener("mouseleave", onLeave);
      card.addEventListener("focusin", onEnter);
      card.addEventListener("focusout", onLeave);
      cleanup.push(() => {
        card.removeEventListener("mouseenter", onEnter);
        card.removeEventListener("mouseleave", onLeave);
        card.removeEventListener("focusin", onEnter);
        card.removeEventListener("focusout", onLeave);
      });
    }

    return () => cleanup.forEach((callback) => callback());
  }, [buyers, highlightBuyer]);

  if (didFail) {
    return <StaticBuyerMap buyers={buyers} label="Map preview" market={market} selectedServiceArea={selectedArea} token={token} />;
  }

  return (
    <aside className="map-shell interactive">
      <div className="map-toolbar">
        <div>
          <strong>Map</strong>
          <span className="muted">{buyers.length} active buyers in {market.label} service areas</span>
        </div>
        <div className="map-toolbar-pills">
          <span>{selectedArea ? selectedArea.label : "All service areas"}</span>
          <span>Buyer target areas · not home addresses</span>
        </div>
        <a className="button secondary map-filter-button" href="#search-filters">
          Filter
        </a>
      </div>
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
      <div className="map-legend">
        <span><i className="legend-dot primary" /> Buyer profile</span>
        <span><i className="legend-dot active" /> Hover match</span>
        <span>{selectedArea ? "Selected area boundary" : "Search an area to show its boundary"}</span>
      </div>
      {isReady ? null : <div className="map-status">Loading interactive map</div>}
      {buyers.length === 0 ? <div className="map-empty">No active buyers match this area yet.</div> : null}
    </aside>
  );
}

function budgetPinLabel(buyer: SellerBuyerSummaryDTO) {
  const budget = buyer.budgetMax || buyer.budgetMin;
  if (!budget) return "Buyer";
  if (budget >= 1_000_000) {
    const millions = budget / 1_000_000;
    return `$${millions.toFixed(1).replace(/\.0$/, "")}M`;
  }
  return `$${Math.round(budget / 1000)}K`;
}

function popupHtml(buyer: SellerBuyerSummaryDTO) {
  const activeBadges = buyer.badges.filter((badge) => badge.status === "active").map((badge) => badge.label).slice(0, 2);
  const canInvite = buyer.canInvite;

  return `
    <div class="buyer-map-popup">
      <strong>${escapeHtml(buyer.name)}</strong>
      ${buyer.isDemo ? "<span>Demo buyer</span>" : ""}
      <span>${escapeHtml(buyer.type)}</span>
      <span>${escapeHtml(buyer.location)}</span>
      <span>${escapeHtml(formatRange(buyer.budgetMin, buyer.budgetMax))}</span>
      ${activeBadges.length > 0 ? `<span>${escapeHtml(activeBadges.join(", "))}</span>` : ""}
      <div>
        <a href="/buyers/${encodeURIComponent(buyer.id)}">View profile</a>
        ${canInvite ? `<a href="/seller/invite/${encodeURIComponent(buyer.id)}">Send invite</a>` : ""}
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

function cssEscape(value: string) {
  if (typeof CSS !== "undefined" && CSS.escape) return CSS.escape(value);
  return value.replaceAll('"', '\\"');
}
