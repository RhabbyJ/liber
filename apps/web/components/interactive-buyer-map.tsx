"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { formatRange } from "../lib/format";
import { approximateBuyerPoint } from "../lib/buyer-map-point";
import { syncMarketBoundaryLayers, syncSelectedAreaLayer } from "../lib/map-boundary-layers";
import { marketMapBounds, marketMapInstanceKey, selectedAreaBounds, type MarketMapContext, type SelectedMapArea } from "../lib/map-area";
import { loadMapboxGl, type MapboxMap, type MapboxMarker } from "../lib/mapbox-gl-loader";
import type { SellerBuyerSummaryDTO } from "../lib/buyer-dtos";
import { useKeyedGeoJson } from "../lib/use-keyed-geojson";
import { useSelectedAreaGeoJson } from "../lib/use-selected-area-geojson";
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

type MarkerBuyerPoint = BuyerPoint & {
  markerOffset: [number, number];
};

export function InteractiveBuyerMap({ buyers, market, selectedServiceArea = null, token }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MapboxMap | null>(null);
  const markersRef = useRef<Map<string, MapboxMarker>>(new Map());
  const markerNodesRef = useRef<Map<string, HTMLElement>>(new Map());
  const [isReady, setIsReady] = useState(false);
  const [status, setStatus] = useState("Loading interactive map");
  const [didFail, setDidFail] = useState(false);
  const marketBoundaryGeojson = useKeyedGeoJson(
    market.boundaryGeojsonPath,
    `${market.slug}:${market.boundaryGeojsonPath ?? ""}`,
  );
  const selectedAreaGeojson = useSelectedAreaGeoJson(selectedServiceArea);

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
  const markerPoints = useMemo(() => withMarkerOffsets(buyerPoints), [buyerPoints]);
  const selectedArea = selectedServiceArea;
  const initialCenter = useMemo(() => mapCenter(buyerPoints, selectedArea, market), [buyerPoints, selectedArea, market]);
  const highlightBuyer = useCallback((buyerId: string, active: boolean) => {
    markerNodesRef.current.get(buyerId)?.classList.toggle("active", active);
    document
      .querySelector<HTMLElement>(`.buyer-card[data-buyer-id="${cssEscape(buyerId)}"], .buyer-row[data-buyer-id="${cssEscape(buyerId)}"]`)
      ?.classList.toggle("active", active);
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
    setStatus("Loading interactive map");

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
          cooperativeGestures: true,
          container: containerRef.current,
          maxBounds: [[marketWest, marketSouth], [marketEast, marketNorth]],
          style: "mapbox://styles/mapbox/streets-v12",
          zoom: 10.4,
        });

        mapRef.current.addControl(new mapboxgl.NavigationControl({ showCompass: false }), "bottom-right");
        mapRef.current.on("load", () => {
          loaded = true;
          setIsReady(true);
          setStatus("");
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
    syncMarketBoundaryLayers(mapRef.current, marketBoundaryGeojson);
    syncSelectedAreaLayer(mapRef.current, selectedAreaGeojson);
  }, [isReady, marketBoundaryGeojson, selectedAreaGeojson]);

  useEffect(() => {
    if (!isReady || !mapRef.current || !window.mapboxgl) return;

    markersRef.current.forEach((marker) => marker.remove());
    markersRef.current.clear();
    markerNodesRef.current.clear();

    for (const point of markerPoints) {
      const markerNode = document.createElement("button");
      markerNode.type = "button";
      markerNode.className = "buyer-map-marker";
      markerNode.setAttribute("aria-label", `Open ${point.buyer.isDemo ? "demo buyer " : ""}${point.buyer.name} map marker`);
      markerNode.dataset.buyerId = point.buyer.id;
      // Budget-first pins: buyer demand reads like price pins, but represents buyers.
      markerNode.innerHTML = `<span>${escapeHtml(budgetPinLabel(point.buyer))}</span>`;
      markerNode.addEventListener("mouseenter", () => highlightBuyer(point.buyer.id, true));
      markerNode.addEventListener("mouseleave", () => highlightBuyer(point.buyer.id, false));

      const popup = new window.mapboxgl.Popup({ closeButton: true, offset: 18 }).setHTML(popupHtml(point.buyer));
      const marker = new window.mapboxgl.Marker({ element: markerNode, offset: point.markerOffset })
        .setLngLat([point.lng, point.lat])
        .setPopup(popup)
        .addTo(mapRef.current);

      markersRef.current.set(point.buyer.id, marker);
      markerNodesRef.current.set(point.buyer.id, markerNode);
    }

    if (selectedArea) {
      mapRef.current.fitBounds(selectedAreaBounds(selectedArea), { maxZoom: 12.6, padding: 104 });
    } else if (buyerPoints.length > 1) {
      const bounds = new window.mapboxgl.LngLatBounds();
      buyerPoints.forEach((point) => bounds.extend([point.lng, point.lat]));
      mapRef.current.fitBounds(bounds, { maxZoom: 12.4, padding: 96 });
    } else {
      mapRef.current.flyTo({ center: [initialCenter.lng, initialCenter.lat], zoom: buyerPoints.length === 1 ? 11.5 : 10.4 });
    }

  }, [buyerPoints, highlightBuyer, initialCenter.lat, initialCenter.lng, isReady, markerPoints, selectedArea]);

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
    return <StaticBuyerMap buyers={buyers} label="Mapbox unavailable" market={market} selectedServiceArea={selectedArea} />;
  }

  return (
    <aside className="map-shell interactive">
      <div className="map-toolbar">
        <div>
          <strong>Buyer demand map</strong>
          <span className="muted">{buyers.length} active buyers in {market.label} service areas</span>
        </div>
        <div className="map-toolbar-pills">
          <span>{selectedArea ? selectedArea.label : "All service areas"}</span>
          <span>Approximate service area</span>
          <span>Approximate pins</span>
        </div>
        <a className="button secondary map-filter-button" href="#search-filters">
          Filter
        </a>
      </div>
      <div className="map-canvas" ref={containerRef} />
      <button
        aria-label="Fit map to all of Los Angeles County"
        className="map-view-all-control"
        onClick={() => mapRef.current?.fitBounds(marketMapBounds(market), { padding: 72 })}
        type="button"
      >
        View all LA County
      </button>
      <div className="map-legend">
        <span><i className="legend-dot primary" /> Buyer profile</span>
        <span><i className="legend-dot active" /> Hover match</span>
        <span>County · City · Approx. ZIP boundaries</span>
      </div>
      {status ? <div className="map-status">{status}</div> : null}
      {buyers.length === 0 ? <div className="map-empty">No active buyers match this area yet.</div> : null}
    </aside>
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

function withMarkerOffsets(points: BuyerPoint[]): MarkerBuyerPoint[] {
  const groups = new Map<string, BuyerPoint[]>();
  for (const point of points) {
    const key = `${point.lat.toFixed(5)},${point.lng.toFixed(5)}`;
    groups.set(key, [...(groups.get(key) ?? []), point]);
  }

  return points.map((point) => {
    const group = groups.get(`${point.lat.toFixed(5)},${point.lng.toFixed(5)}`) ?? [point];
    const index = group.findIndex((item) => item.buyer.id === point.buyer.id);
    return {
      ...point,
      markerOffset: markerOffset(index, group.length),
    };
  });
}

function markerOffset(index: number, count: number): [number, number] {
  if (count <= 1) return [0, 0];

  const angle = (Math.PI * 2 * index) / count - Math.PI / 2;
  const radius = count <= 2 ? 32 : count <= 4 ? 42 : 52;
  return [Math.round(Math.cos(angle) * radius), Math.round(Math.sin(angle) * radius)];
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
