"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { approximateBuyerPoint } from "../lib/buyer-map-point";
import { compactBudgetRange, criteriaFacts, pinBudgetLabel } from "../lib/listing-format";
import { syncSelectedAreaLayer } from "../lib/map-boundary-layers";
import { groupMapPoints } from "../lib/map-point-groups";
import { marketMapBounds, marketMapInstanceKey, selectedAreaBounds, type MarketMapContext, type SelectedMapArea } from "../lib/map-area";
import { canHover, declutterPricePins, escapeHtml, quietBasemap } from "../lib/map-presentation";
import { loadMapboxGl, type MapboxMap, type MapboxMarker, type MapboxPopup } from "../lib/mapbox-gl-loader";
import type { SellerBuyerSummaryDTO } from "../lib/buyer-dtos";
import { useKeyedGeoJson } from "../lib/use-keyed-geojson";
import { propertyArtworkSrc } from "./property-type-artwork";
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
  const mapRef = useRef<MapboxMap | null>(null);
  const popupRef = useRef<MapboxPopup | null>(null);
  const pinnedPopupRef = useRef<string | null>(null);
  const markersRef = useRef<Map<string, MapboxMarker>>(new Map());
  const markerNodesRef = useRef<Map<string, HTMLElement>>(new Map());
  const [isReady, setIsReady] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [didFail, setDidFail] = useState(false);
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
  const markerGroups = useMemo(() => groupMapPoints(buyerPoints), [buyerPoints]);
  const initialCenter = useMemo(() => mapCenter(buyerPoints, selectedArea, market), [buyerPoints, selectedArea, market]);
  const highlightBuyer = useCallback((buyerId: string, active: boolean) => {
    const marker = markerNodesRef.current.get(buyerId);
    marker?.classList.toggle("active", active);
    marker?.classList.toggle("map-pin-raised", active);
    document
      .querySelector<HTMLElement>(`.listing-card[data-buyer-id="${cssEscape(buyerId)}"]`)
      ?.classList.toggle("map-linked", active);
  }, []);
  const mapInstanceKey = marketMapInstanceKey(market, token);
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
    setIsLoading(true);

    function fallBackToStaticMap() {
      if (canceled) return;
      markersRef.current.forEach((marker) => marker.remove());
      markersRef.current.clear();
      markerNodesRef.current.clear();
      mapRef.current?.remove();
      mapRef.current = null;
      setDidFail(true);
    }

    async function setupMap() {
      if (!containerRef.current) return;

      try {
        const mapboxgl = await loadMapboxGl();
        if (canceled || !containerRef.current) return;

        let loaded = false;
        mapboxgl.accessToken = token;
        mapRef.current = new mapboxgl.Map({
          antialias: true,
          attributionControl: true,
          center: [marketCenterLng, marketCenterLat],
          cooperativeGestures: false,
          container: containerRef.current,
          maxBounds: [[marketWest, marketSouth], [marketEast, marketNorth]],
          style: "mapbox://styles/mapbox/streets-v12",
          zoom: 10.4,
        });

        mapRef.current.addControl(new mapboxgl.NavigationControl({ showCompass: false }), "bottom-right");
        popupRef.current = new mapboxgl.Popup({
          className: "liber-map-popup",
          closeButton: false,
          closeOnClick: true,
          focusAfterOpen: false,
          maxWidth: "300px",
        });
        mapRef.current.on("load", () => {
          if (canceled || !mapRef.current) return;
          loaded = true;
          quietBasemap(mapRef.current);
          setIsReady(true);
          setIsLoading(false);
        });
        mapRef.current.on("error", () => {
          if (!loaded) fallBackToStaticMap();
        });
      } catch {
        fallBackToStaticMap();
      }
    }

    setupMap();

    const markers = markersRef.current;
    const markerNodes = markerNodesRef.current;
    return () => {
      canceled = true;
      markers.forEach((marker) => marker.remove());
      markers.clear();
      markerNodes.clear();
      popupRef.current?.remove();
      popupRef.current = null;
      mapRef.current?.remove();
      mapRef.current = null;
    };
  }, [
    didFail,
    mapInstanceKey,
    marketCenterLat,
    marketCenterLng,
    marketEast,
    marketNorth,
    marketSouth,
    marketWest,
    token,
  ]);

  useEffect(() => {
    if (!isReady || !mapRef.current) return;
    syncSelectedAreaLayer(mapRef.current, selectedAreaGeojson);
  }, [isReady, selectedAreaGeojson]);

  useEffect(() => {
    if (!isReady || !mapRef.current || !window.mapboxgl) return;
    const map = mapRef.current;

    markersRef.current.forEach((marker) => marker.remove());
    markersRef.current.clear();
    markerNodesRef.current.clear();

    function showPopup(group: MarkerGroup, pinned: boolean) {
      const popup = popupRef.current;
      if (!popup) return;
      const buyersHere = group.points.map((point) => point.buyer);
      pinnedPopupRef.current = pinned ? buyersHere[0].id : null;
      popup
        .setLngLat([group.lng, group.lat])
        .setOffset(popupOffsets([0, 0]))
        .setHTML(buyersHere.length > 1
          ? `<div class="buyer-map-popup-group">${buyersHere.map(popupHtml).join("")}</div>`
          : popupHtml(buyersHere[0]))
        .addTo(map);
    }

    // Buyers who target the same area center share one pin; coordinates are never nudged.
    for (const group of markerGroups) {
      const buyersHere = group.points.map((point) => point.buyer);
      const [firstBuyer] = buyersHere;
      const markerNode = document.createElement("button");
      markerNode.type = "button";
      markerNode.className = "map-price-pin";
      markerNode.setAttribute("aria-label", buyersHere.length > 1
        ? `${buyersHere.length} buyers targeting ${firstBuyer.location || "this area"}`
        : `${firstBuyer.isDemo ? "Demo buyer " : ""}${firstBuyer.name}, budget ${compactBudgetRange(firstBuyer.budgetMin, firstBuyer.budgetMax)}`);
      markerNode.dataset.buyerId = firstBuyer.id;
      // Budget-first pins read like listing price pins but represent buyers.
      markerNode.innerHTML = `<span>${escapeHtml(buyersHere.length > 1 ? `${buyersHere.length} buyers` : pinBudgetLabel(firstBuyer.budgetMin, firstBuyer.budgetMax))}</span>`;
      const highlightGroup = (active: boolean) => buyersHere.forEach((buyer) => highlightBuyer(buyer.id, active));
      markerNode.addEventListener("mouseenter", () => {
        highlightGroup(true);
        if (canHover() && !pinnedPopupRef.current) showPopup(group, false);
      });
      markerNode.addEventListener("mouseleave", () => {
        highlightGroup(false);
        if (!pinnedPopupRef.current) popupRef.current?.remove();
      });
      markerNode.addEventListener("focus", () => highlightGroup(true));
      markerNode.addEventListener("blur", () => highlightGroup(false));
      markerNode.addEventListener("click", (event) => {
        event.stopPropagation();
        showPopup(group, true);
      });

      const marker = new window.mapboxgl.Marker({ anchor: "bottom", element: markerNode })
        .setLngLat([group.lng, group.lat])
        .addTo(map);

      for (const buyer of buyersHere) {
        markersRef.current.set(buyer.id, marker);
        markerNodesRef.current.set(buyer.id, markerNode);
      }
    }

    const pinLayout = markerGroups.flatMap((group) => {
      const node = markerNodesRef.current.get(group.points[0].buyer.id);
      if (!node) return [];
      node.dataset.labelWidth = String(Math.ceil(node.getBoundingClientRect().width) || 56);
      return [{ lat: group.lat, lng: group.lng, node, offset: [0, 0] as [number, number] }];
    });
    const declutter = () => declutterPricePins(map, pinLayout);
    map.on("zoomend", declutter);
    map.on("resize", declutter);
    declutter();

    if (selectedArea) {
      map.fitBounds(selectedAreaBounds(selectedArea), { duration: 600, maxZoom: 12.6, padding: 72 });
    } else if (buyerPoints.length > 1) {
      const bounds = new window.mapboxgl.LngLatBounds();
      buyerPoints.forEach((point) => bounds.extend([point.lng, point.lat]));
      map.fitBounds(bounds, { duration: 600, maxZoom: 12.4, padding: 72 });
    } else {
      map.flyTo({ center: [initialCenter.lng, initialCenter.lat], zoom: buyerPoints.length === 1 ? 11.5 : 10.4 });
    }

    return () => {
      map.off("zoomend", declutter);
      map.off("resize", declutter);
    };
  }, [buyerPoints, highlightBuyer, initialCenter.lat, initialCenter.lng, isReady, markerGroups, selectedArea]);

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
          onClick={() => mapRef.current?.fitBounds(marketMapBounds(market), { duration: 700, padding: 48 })}
          type="button"
        >
          View all LA County
        </button>
      </div>
      {isLoading ? (
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

function mapCenter(points: BuyerPoint[], selectedArea: SelectedMapArea | null, market: MarketMapContext) {
  if (selectedArea) {
    return selectedArea.center;
  }

  if (points.length > 0) {
    const total = points.reduce((sum, point) => ({ lat: sum.lat + point.lat, lng: sum.lng + point.lng }), { lat: 0, lng: 0 });
    return { lat: total.lat / points.length, lng: total.lng / points.length };
  }

  return market.center;
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
  const badges = buyer.badges.filter((badge) => badge.status === "active").map((badge) => (badge.type === "PRE_APPROVED" ? "Pre-approved" : badge.label));
  const facts = criteriaFacts(buyer.criteriaDetails[0]).map((fact) => `<b>${escapeHtml(fact.value)}</b> ${escapeHtml(fact.label)}`);
  const meta = [badges[0], buyer.name].filter(Boolean).join(" · ");

  return `
    <a class="map-card" href="/buyers/${encodeURIComponent(buyer.id)}">
      <span class="map-card-media"><img alt="" src="${escapeHtml(propertyArtworkSrc(buyer.purpose))}" /></span>
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
