"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef } from "react";
import { approximateBuyerPoint } from "../lib/buyer-map-point";
import { buyerPopupAvatarHtml, buyerPopupDetailsHtml } from "../lib/buyer-card-popup";
import { sellerCardView } from "../lib/buyer-card-view";
import { compactBudgetRange, pinBudgetLabel } from "../lib/listing-format";
import { syncSelectedAreaLayer } from "../lib/map-boundary-layers";
import { selectedAreaBounds, type MarketMapContext, type SelectedMapArea } from "../lib/map-area";
import { clusterBounds, clusterMarkerGroups, clusterZoomLimit } from "../lib/map-marker-clusters";
import { groupMapPoints } from "../lib/map-point-groups";
import { canHover, escapeHtml, quietBasemap } from "../lib/map-presentation";
import type { MapboxMarker, MapboxPopup } from "../lib/mapbox-gl-loader";
import type { SellerBuyerSummaryDTO } from "../lib/buyer-dtos";
import { useKeyedGeoJson } from "../lib/use-keyed-geojson";
import { fitMapTo, fitMapToMarket, useMarketMap } from "../lib/use-market-map";
import { StaticBuyerMap } from "./static-buyer-map";

type Props = {
  buyers: SellerBuyerSummaryDTO[];
  clearAreaHref?: string;
  market: MarketMapContext;
  selectedServiceArea?: SelectedMapArea | null;
  token: string;
};

type BuyerPoint = {
  buyer: SellerBuyerSummaryDTO;
  lat: number;
  lng: number;
};

type MarkerGroup = {
  lat: number;
  lng: number;
  points: BuyerPoint[];
};

export function InteractiveBuyerMap({ buyers, clearAreaHref, market, selectedServiceArea: selectedArea = null, token }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const markersRef = useRef<MapboxMarker[]>([]);
  const markerNodesRef = useRef<Map<string, HTMLElement>>(new Map());
  const markerMembersRef = useRef<Map<HTMLElement, string[]>>(new Map());
  const popupRef = useRef<MapboxPopup | null>(null);
  const pinnedPopupRef = useRef<string | null>(null);
  // First buyer of the marker whose mini-card is showing, to send focus back on Escape.
  const popupOwnerRef = useRef<string | null>(null);
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
    const marker = markerNodesRef.current.get(buyerId);
    marker?.classList.toggle("active", active);
    marker?.classList.toggle("map-pin-raised", active);
    document
      .querySelector<HTMLElement>(`.buyer-card[data-buyer-id="${cssEscape(buyerId)}"]`)
      ?.classList.toggle("map-linked", active);
  }, []);

  // One quiet basemap and one reusable mini-card popup per map instance.
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
      if (focusWasInPopup && owner) markerNodesRef.current.get(owner)?.focus({ preventScroll: true });
    }
    document.addEventListener("keydown", closePopupOnEscape);
    return () => document.removeEventListener("keydown", closePopupOnEscape);
  }, [isReady]);

  useEffect(() => {
    if (!isReady || !mapRef.current) return;
    syncSelectedAreaLayer(mapRef.current, selectedAreaGeojson);
  }, [isReady, mapRef, selectedAreaGeojson]);

  // Budget pins re-cluster after every zoom: nearby areas merge into one count and split as you zoom in.
  useEffect(() => {
    const map = mapRef.current;
    const mapboxgl = window.mapboxgl;
    if (!isReady || !map || !mapboxgl) return;

    function showPopup(group: MarkerGroup, pinned: boolean) {
      const popup = popupRef.current;
      if (!popup || !map) return;
      const buyersHere = group.points.map((point) => point.buyer);
      pinnedPopupRef.current = pinned ? buyersHere[0].id : null;
      popupOwnerRef.current = buyersHere[0].id;
      popup
        .setLngLat([group.lng, group.lat])
        .setOffset(popupOffsets([0, 0]))
        .setHTML(buyersHere.length > 1
          ? `<div class="buyer-map-popup-group">${buyersHere.map((buyer) => popupHtml(buyer)).join("")}</div>`
          : popupHtml(buyersHere[0]))
        .addTo(map);
    }

    const clearMarkers = () => {
      markersRef.current.forEach((marker) => marker.remove());
      markersRef.current = [];
      markerNodesRef.current.clear();
      markerMembersRef.current.clear();
    };

    const renderMarkers = () => {
      // Re-clustering replaces every marker. A keyboard-focused marker hands focus to the new
      // marker holding its first buyer, so zooming into a cluster keeps your place.
      const active = document.activeElement;
      const focusedBuyerIds = active instanceof HTMLElement ? markerMembersRef.current.get(active) : undefined;
      const keepFocus = Boolean(focusedBuyerIds && active instanceof HTMLElement && active.matches(":focus-visible"));
      focusedBuyerIds?.forEach((buyerId) => highlightBuyer(buyerId, false));
      clearMarkers();
      for (const cluster of clusterMarkerGroups(centerGroups, (lngLat) => map.project(lngLat))) {
        const buyersHere = cluster.members.flatMap((group) => group.points.map((point) => point.buyer));
        const markerNode = document.createElement("button");
        markerNode.type = "button";
        const highlightGroup = (active: boolean) => buyersHere.forEach((buyer) => highlightBuyer(buyer.id, active));

        if (cluster.members.length > 1) {
          markerNode.className = "map-price-pin cluster";
          markerNode.setAttribute("aria-label", `Zoom in to ${buyersHere.length} buyers in ${cluster.members.length} nearby areas`);
          markerNode.innerHTML = `<span>${buyersHere.length} buyers</span>`;
          markerNode.addEventListener("click", (event) => {
            event.stopPropagation();
            popupRef.current?.remove();
            fitMapTo(map, clusterBounds(cluster.members), clusterZoomLimit(map));
          });
        } else {
          const group = cluster.anchor;
          const [firstBuyer] = buyersHere;
          markerNode.className = buyersHere.length > 1 ? "map-price-pin group" : "map-price-pin";
          markerNode.setAttribute("aria-label", buyersHere.length > 1
            ? `${buyersHere.length} buyers targeting ${firstBuyer.location || "this area"}`
            : `${firstBuyer.isDemo ? "Demo buyer " : ""}${firstBuyer.name}, budget ${compactBudgetRange(firstBuyer.budgetMin, firstBuyer.budgetMax)}`);
          markerNode.dataset.buyerId = firstBuyer.id;
          // Budget-first pins read like listing price pins but represent buyers.
          markerNode.innerHTML = `<span>${escapeHtml(buyersHere.length > 1 ? `${buyersHere.length} buyers` : pinBudgetLabel(firstBuyer.budgetMin, firstBuyer.budgetMax))}</span>`;
          markerNode.addEventListener("mouseenter", () => {
            if (canHover() && !pinnedPopupRef.current) showPopup(group, false);
          });
          markerNode.addEventListener("mouseleave", () => {
            if (!pinnedPopupRef.current) popupRef.current?.remove();
          });
          markerNode.addEventListener("click", (event) => {
            event.stopPropagation();
            showPopup(group, true);
            // Enter or Space on a marker moves into its mini-card so the links are reachable.
            if (event.detail === 0) focusPopupLink(popupRef.current);
          });
        }

        markerNode.addEventListener("mouseenter", () => highlightGroup(true));
        markerNode.addEventListener("mouseleave", () => highlightGroup(false));
        markerNode.addEventListener("focus", () => highlightGroup(true));
        markerNode.addEventListener("blur", () => highlightGroup(false));
        const marker = new mapboxgl.Marker({ anchor: "bottom", element: markerNode })
          .setLngLat([cluster.anchor.lng, cluster.anchor.lat])
          .addTo(map);
        markersRef.current.push(marker);
        markerMembersRef.current.set(markerNode, buyersHere.map((buyer) => buyer.id));
        for (const buyer of buyersHere) markerNodesRef.current.set(buyer.id, markerNode);
      }
      if (keepFocus && focusedBuyerIds?.length) markerNodesRef.current.get(focusedBuyerIds[0])?.focus({ preventScroll: true });
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
    const cards = Array.from(document.querySelectorAll<HTMLElement>(".buyer-card[data-buyer-id]"));
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
    <div className="map-shell">
      <div className="map-canvas" ref={containerRef} />
      <div className="map-overlay-top">
        {clearAreaHref ? (
          <Link className="map-chip-button" href={clearAreaHref} scroll={false}>
            Remove boundary
          </Link>
        ) : null}
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
      {!isReady ? (
        <div className="map-toast" role="status">
          <span className="map-toast-spinner" aria-hidden="true" />
          Loading map
        </div>
      ) : buyers.length === 0 ? (
        <div className="map-toast" role="status">No buyers in this area yet</div>
      ) : null}
      <p className="map-footnote">Approximate service-area pins · exact locations stay private</p>
    </div>
  );
}

function focusPopupLink(popup: MapboxPopup | null) {
  popup?.getElement()?.querySelector<HTMLElement>("a[href]")?.focus({ preventScroll: true });
}

function popupOffsets([x, y]: [number, number]): Record<string, [number, number]> {
  return {
    bottom: [x, y - 40],
    "bottom-left": [x, y - 40],
    "bottom-right": [x, y - 40],
    center: [x, y],
    left: [x + 34, y - 18],
    right: [x - 34, y - 18],
    top: [x, y + 6],
    "top-left": [x, y + 6],
    "top-right": [x, y + 6],
  };
}

function popupHtml(buyer: SellerBuyerSummaryDTO) {
  const view = sellerCardView(buyer);
  return `
    <a class="map-card" href="/buyers/${encodeURIComponent(buyer.id)}">
      ${buyerPopupAvatarHtml(view)}
      <span class="map-card-body">${buyerPopupDetailsHtml(view)}</span>
    </a>
  `;
}

function cssEscape(value: string) {
  if (typeof CSS !== "undefined" && CSS.escape) return CSS.escape(value);
  return value.replaceAll('"', '\\"');
}
