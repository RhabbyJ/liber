"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef } from "react";
import { approximateBuyerPoint } from "../lib/buyer-map-point";
import { compactBudgetRange, criteriaFacts, pinBudgetLabel } from "../lib/listing-format";
import { syncSelectedAreaLayer } from "../lib/map-boundary-layers";
import { selectedAreaBounds, type MarketMapContext, type SelectedMapArea } from "../lib/map-area";
import { clusterBounds, clusterMarkerGroups, clusterZoomLimit } from "../lib/map-marker-clusters";
import { groupMapPoints } from "../lib/map-point-groups";
import { canHover, escapeHtml, quietBasemap } from "../lib/map-presentation";
import type { MapboxMarker, MapboxPopup } from "../lib/mapbox-gl-loader";
import type { SellerBuyerSummaryDTO } from "../lib/buyer-dtos";
import { distinctPropertyPhotos } from "../lib/property-photos";
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
  const popupRef = useRef<MapboxPopup | null>(null);
  const pinnedPopupRef = useRef<string | null>(null);
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
  // Same per-page assignment as the result cards, so a pin's mini-card matches its card.
  const photoById = useMemo(() => {
    const photos = distinctPropertyPhotos(buyers.map((buyer) => ({ seed: buyer.id, value: buyer.purpose })));
    return new Map(buyers.map((buyer, index) => [buyer.id, photos[index]]));
  }, [buyers]);
  const highlightBuyer = useCallback((buyerId: string, active: boolean) => {
    const marker = markerNodesRef.current.get(buyerId);
    marker?.classList.toggle("active", active);
    marker?.classList.toggle("map-pin-raised", active);
    document
      .querySelector<HTMLElement>(`.listing-card[data-buyer-id="${cssEscape(buyerId)}"]`)
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
    };
  }, [isReady, mapRef]);

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
      popup
        .setLngLat([group.lng, group.lat])
        .setOffset(popupOffsets([0, 0]))
        .setHTML(buyersHere.length > 1
          ? `<div class="buyer-map-popup-group">${buyersHere.map((buyer) => popupHtml(buyer, photoById.get(buyer.id) ?? "")).join("")}</div>`
          : popupHtml(buyersHere[0], photoById.get(buyersHere[0].id) ?? ""))
        .addTo(map);
    }

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
        for (const buyer of buyersHere) markerNodesRef.current.set(buyer.id, markerNode);
      }
    };

    renderMarkers();
    map.on("zoomend", renderMarkers);
    return () => {
      map.off("zoomend", renderMarkers);
      clearMarkers();
    };
  }, [centerGroups, highlightBuyer, isReady, mapRef, photoById]);

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
    const cards = Array.from(document.querySelectorAll<HTMLElement>(".listing-card[data-buyer-id]"));
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

function popupHtml(buyer: SellerBuyerSummaryDTO, photo: string) {
  const badges = buyer.badges.filter((badge) => badge.status === "active").map((badge) => (badge.type === "PRE_APPROVED" ? "Pre-approved" : badge.label));
  const facts = criteriaFacts(buyer.criteriaDetails[0]).map((fact) => `<b>${escapeHtml(fact.value)}</b> ${escapeHtml(fact.label)}`);
  const meta = [badges[0], buyer.name].filter(Boolean).join(" · ");

  return `
    <a class="map-card" href="/buyers/${encodeURIComponent(buyer.id)}">
      <span class="map-card-media"><img alt="" src="${escapeHtml(photo)}" /></span>
      <span class="map-card-body">
        <strong class="map-card-price">${escapeHtml(compactBudgetRange(buyer.budgetMin, buyer.budgetMax))}</strong>
        ${facts.length > 0 ? `<span class="map-card-facts">${facts.join("<i></i>")}</span>` : ""}
        <span class="map-card-address">${escapeHtml(buyer.location || "Liber service area")}</span>
        <span class="map-card-meta">${buyer.isDemo ? "Demo buyer · " : ""}${escapeHtml(meta)}</span>
      </span>
    </a>
  `;
}

function cssEscape(value: string) {
  if (typeof CSS !== "undefined" && CSS.escape) return CSS.escape(value);
  return value.replaceAll('"', '\\"');
}
