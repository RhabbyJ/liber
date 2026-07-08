"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { formatRange } from "../lib/format";
import { activePilotAreas, approximateBuyerPoint } from "../lib/launch-market";
import { selectedAreaBounds, type SelectedMapArea } from "../lib/map-area";
import { loadMapboxGl } from "../lib/mapbox-gl-loader";
import type { Buyer } from "../lib/mock-data";
import { StaticBuyerMap } from "./static-buyer-map";

type Props = {
  buyers: Buyer[];
  selectedServiceArea?: SelectedMapArea | null;
  token: string;
};

type BuyerPoint = {
  buyer: Buyer;
  lat: number;
  lng: number;
};

type MarkerBuyerPoint = BuyerPoint & {
  markerOffset: [number, number];
};

export function InteractiveBuyerMap({ buyers, selectedServiceArea = null, token }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<any>(null);
  const markersRef = useRef<Map<string, any>>(new Map());
  const markerNodesRef = useRef<Map<string, HTMLElement>>(new Map());
  const suppressMoveEndRef = useRef(false);
  const [isReady, setIsReady] = useState(false);
  const [status, setStatus] = useState("Loading interactive map");
  const [didFail, setDidFail] = useState(false);
  const [selectedAreaGeojson, setSelectedAreaGeojson] = useState<Record<string, unknown> | null>(null);

  const buyerPoints = useMemo(
    () =>
      buyers
        .map((buyer) => ({ buyer, ...approximateBuyerPoint(buyer) }))
        .filter((point) => Number.isFinite(point.lat) && Number.isFinite(point.lng)),
    [buyers],
  );
  const markerPoints = useMemo(() => withMarkerOffsets(buyerPoints), [buyerPoints]);
  const selectedArea = selectedServiceArea;
  const initialCenter = useMemo(() => mapCenter(buyerPoints, selectedArea), [buyerPoints, selectedArea]);

  useEffect(() => {
    let canceled = false;

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
          center: [initialCenter.lng, initialCenter.lat],
          cooperativeGestures: true,
          container: containerRef.current,
          maxBounds: [[-118.75, 34.08], [-118.15, 34.37]],
          style: "mapbox://styles/mapbox/streets-v12",
          zoom: buyerPoints.length > 1 ? 10.4 : 11.4,
        });

        mapRef.current.addControl(new mapboxgl.NavigationControl({ showCompass: false }), "bottom-right");
        mapRef.current.on("load", () => {
          loaded = true;
          setIsReady(true);
          setStatus("");
        });
        mapRef.current.on("moveend", () => {
          if (suppressMoveEndRef.current) {
            suppressMoveEndRef.current = false;
            return;
          }
        });
        mapRef.current.on("error", () => {
          if (!loaded) fallBackToStaticMap();
        });
      } catch {
        fallBackToStaticMap();
      }
    }

    setupMap();

    return () => {
      canceled = true;
      markersRef.current.forEach((marker) => marker.remove());
      markersRef.current.clear();
      markerNodesRef.current.clear();
      mapRef.current?.remove();
      mapRef.current = null;
    };
  }, [buyerPoints.length, initialCenter.lat, initialCenter.lng, token]);

  useEffect(() => {
    if (!isReady || !mapRef.current || !window.mapboxgl) return;

    markersRef.current.forEach((marker) => marker.remove());
    markersRef.current.clear();
    markerNodesRef.current.clear();
    syncSelectedAreaLayer(mapRef.current, selectedAreaGeojson);

    for (const point of markerPoints) {
      const markerNode = document.createElement("button");
      markerNode.type = "button";
      markerNode.className = "buyer-map-marker";
      markerNode.setAttribute("aria-label", `Open ${point.buyer.name} map marker`);
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
      suppressMoveEndRef.current = true;
      mapRef.current.fitBounds(selectedAreaBounds(selectedArea), { maxZoom: 12.6, padding: 104 });
    } else if (buyerPoints.length > 1) {
      const bounds = new window.mapboxgl.LngLatBounds();
      buyerPoints.forEach((point) => bounds.extend([point.lng, point.lat]));
      suppressMoveEndRef.current = true;
      mapRef.current.fitBounds(bounds, { maxZoom: 12.4, padding: 96 });
    } else {
      suppressMoveEndRef.current = true;
      mapRef.current.flyTo({ center: [initialCenter.lng, initialCenter.lat], zoom: buyerPoints.length === 1 ? 11.5 : 10.4 });
    }

  }, [buyerPoints, initialCenter.lat, initialCenter.lng, isReady, markerPoints, selectedArea, selectedAreaGeojson]);

  useEffect(() => {
    let canceled = false;

    async function loadSelectedArea() {
      if (!selectedArea) {
        setSelectedAreaGeojson(null);
        return;
      }

      try {
        const response = await fetch(selectedArea.geojsonPath, { cache: "force-cache" });
        if (!response.ok) throw new Error("Unable to load service area.");
        const geojson = await response.json();
        if (!canceled) setSelectedAreaGeojson(geojson);
      } catch {
        if (!canceled) setSelectedAreaGeojson(null);
      }
    }

    void loadSelectedArea();
    return () => {
      canceled = true;
    };
  }, [selectedArea]);

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
  }, [buyers]);

  function highlightBuyer(buyerId: string, active: boolean) {
    markerNodesRef.current.get(buyerId)?.classList.toggle("active", active);
    document
      .querySelector<HTMLElement>(`.buyer-card[data-buyer-id="${cssEscape(buyerId)}"], .buyer-row[data-buyer-id="${cssEscape(buyerId)}"]`)
      ?.classList.toggle("active", active);
  }

  if (didFail) {
    return <StaticBuyerMap buyers={buyers} label="Mapbox unavailable" selectedServiceArea={selectedArea} />;
  }

  return (
    <aside className="map-shell interactive">
      <div className="map-toolbar">
        <div>
          <strong>Buyer demand map</strong>
          <span className="muted">{buyers.length} active buyers in the San Fernando Valley pilot</span>
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
      <div className="map-legend">
        <span><i className="legend-dot primary" /> Buyer profile</span>
        <span><i className="legend-dot active" /> Hover match</span>
      </div>
      {status ? <div className="map-status">{status}</div> : null}
      {buyers.length === 0 ? <div className="map-empty">No active buyers match this area yet.</div> : null}
    </aside>
  );
}

function mapCenter(points: BuyerPoint[], selectedArea: SelectedMapArea | null) {
  if (selectedArea) {
    return selectedArea.center;
  }

  if (points.length > 0) {
    const total = points.reduce((sum, point) => ({ lat: sum.lat + point.lat, lng: sum.lng + point.lng }), { lat: 0, lng: 0 });
    return { lat: total.lat / points.length, lng: total.lng / points.length };
  }

  const total = activePilotAreas.reduce((sum, area) => ({ lat: sum.lat + area.lat, lng: sum.lng + area.lng }), { lat: 0, lng: 0 });
  return { lat: total.lat / activePilotAreas.length, lng: total.lng / activePilotAreas.length };
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

function budgetPinLabel(buyer: Buyer) {
  const budget = buyer.budgetMax || buyer.budgetMin;
  if (!budget) return "Buyer";
  if (budget >= 1_000_000) {
    const millions = budget / 1_000_000;
    return `$${millions.toFixed(1).replace(/\.0$/, "")}M`;
  }
  return `$${Math.round(budget / 1000)}K`;
}

function popupHtml(buyer: Buyer) {
  const activeBadges = buyer.badges.filter((badge) => badge.status === "active").map((badge) => badge.label).slice(0, 2);

  return `
    <div class="buyer-map-popup">
      <strong>${escapeHtml(buyer.name)}</strong>
      <span>${escapeHtml(buyer.type)}</span>
      <span>${escapeHtml(buyer.location)}</span>
      <span>${escapeHtml(formatRange(buyer.budgetMin, buyer.budgetMax))}</span>
      ${activeBadges.length > 0 ? `<span>${escapeHtml(activeBadges.join(", "))}</span>` : ""}
      <div>
        <a href="/buyers/${encodeURIComponent(buyer.id)}">View profile</a>
        <a href="/seller/invite/${encodeURIComponent(buyer.id)}">Send invite</a>
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

const selectedAreaSourceId = "liber-selected-service-area-source";
const selectedAreaFillLayerId = "liber-selected-service-area-fill";
const selectedAreaLineLayerId = "liber-selected-service-area-outline";

function syncSelectedAreaLayer(map: any, data: Record<string, unknown> | null) {
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
      "line-opacity": 0.86,
      "line-width": 3,
    },
    source: selectedAreaSourceId,
    type: "line",
  });
}

function removeSelectedAreaLayer(map: any) {
  if (map.getLayer(selectedAreaLineLayerId)) map.removeLayer(selectedAreaLineLayerId);
  if (map.getLayer(selectedAreaFillLayerId)) map.removeLayer(selectedAreaFillLayerId);
  if (map.getSource(selectedAreaSourceId)) map.removeSource(selectedAreaSourceId);
}
