"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { formatRange } from "../lib/format";
import { activePilotAreas, approximateBuyerPoint } from "../lib/launch-market";
import type { Buyer } from "../lib/mock-data";

declare global {
  interface Window {
    mapboxgl?: any;
  }
}

const mapboxScriptUrl = "https://api.mapbox.com/mapbox-gl-js/v3.24.0/mapbox-gl.js";
const mapboxCssUrl = "https://api.mapbox.com/mapbox-gl-js/v3.24.0/mapbox-gl.css";

type Props = {
  buyers: Buyer[];
  centerLat?: number;
  centerLng?: number;
  radiusMiles?: number;
  token: string;
};

type BuyerPoint = {
  buyer: Buyer;
  lat: number;
  lng: number;
};

export function InteractiveBuyerMap({ buyers, centerLat, centerLng, radiusMiles = 8, token }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<any>(null);
  const markersRef = useRef<Map<string, any>>(new Map());
  const markerNodesRef = useRef<Map<string, HTMLElement>>(new Map());
  const router = useRouter();
  const searchParams = useSearchParams();
  const [isReady, setIsReady] = useState(false);
  const [status, setStatus] = useState("Loading interactive map");
  const [showSearchArea, setShowSearchArea] = useState(false);

  const buyerPoints = useMemo(
    () =>
      buyers
        .map((buyer) => ({ buyer, ...approximateBuyerPoint(buyer) }))
        .filter((point) => Number.isFinite(point.lat) && Number.isFinite(point.lng)),
    [buyers],
  );
  const initialCenter = useMemo(() => mapCenter(buyerPoints, centerLat, centerLng), [buyerPoints, centerLat, centerLng]);

  useEffect(() => {
    let canceled = false;

    async function setupMap() {
      if (!containerRef.current) return;

      try {
        const mapboxgl = await loadMapboxGl();
        if (canceled || !containerRef.current) return;

        mapboxgl.accessToken = token;
        mapRef.current = new mapboxgl.Map({
          antialias: true,
          attributionControl: true,
          bearing: -8,
          center: [initialCenter.lng, initialCenter.lat],
          cooperativeGestures: true,
          container: containerRef.current,
          maxBounds: [[-118.75, 34.08], [-118.3, 34.37]],
          pitch: 38,
          style: "mapbox://styles/mapbox/streets-v12",
          zoom: buyerPoints.length > 1 ? 10.4 : 11.4,
        });

        mapRef.current.addControl(new mapboxgl.NavigationControl({ showCompass: true }), "top-right");
        mapRef.current.addControl(new mapboxgl.ScaleControl({ maxWidth: 120, unit: "imperial" }), "bottom-left");
        if (mapboxgl.FullscreenControl) {
          mapRef.current.addControl(new mapboxgl.FullscreenControl(), "top-right");
        }
        mapRef.current.on("load", () => {
          setIsReady(true);
          setStatus("");
        });
        mapRef.current.on("moveend", () => setShowSearchArea(true));
        mapRef.current.on("error", () => {
          setStatus("Map could not load. The buyer list is still available.");
        });
      } catch {
        setStatus("Mapbox could not load. The buyer list is still available.");
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

    for (const [index, point] of buyerPoints.entries()) {
      const markerNode = document.createElement("button");
      markerNode.type = "button";
      markerNode.className = "buyer-map-marker";
      markerNode.setAttribute("aria-label", `Open ${point.buyer.name} map marker`);
      markerNode.dataset.buyerId = point.buyer.id;
      markerNode.innerHTML = `<span>${index + 1}</span>`;
      markerNode.addEventListener("mouseenter", () => highlightBuyer(point.buyer.id, true));
      markerNode.addEventListener("mouseleave", () => highlightBuyer(point.buyer.id, false));

      const popup = new window.mapboxgl.Popup({ closeButton: true, offset: 18 }).setHTML(popupHtml(point.buyer));
      const marker = new window.mapboxgl.Marker({ element: markerNode })
        .setLngLat([point.lng, point.lat])
        .setPopup(popup)
        .addTo(mapRef.current);

      markersRef.current.set(point.buyer.id, marker);
      markerNodesRef.current.set(point.buyer.id, markerNode);
    }

    if (buyerPoints.length > 1) {
      const bounds = new window.mapboxgl.LngLatBounds();
      buyerPoints.forEach((point) => bounds.extend([point.lng, point.lat]));
      mapRef.current.fitBounds(bounds, { bearing: -8, maxZoom: 12.4, padding: 96, pitch: 38 });
    } else {
      mapRef.current.flyTo({ bearing: -8, center: [initialCenter.lng, initialCenter.lat], pitch: 38, zoom: buyerPoints.length === 1 ? 11.5 : 10.4 });
    }

    setShowSearchArea(false);
  }, [buyerPoints, initialCenter.lat, initialCenter.lng, isReady]);

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

  function searchCurrentArea() {
    if (!mapRef.current) return;
    const center = mapRef.current.getCenter();
    const nextParams = new URLSearchParams(searchParams.toString());
    nextParams.delete("area");
    nextParams.delete("city");
    nextParams.delete("state");
    nextParams.set("centerLat", center.lat.toFixed(5));
    nextParams.set("centerLng", center.lng.toFixed(5));
    nextParams.set("radiusMiles", String(radiusMiles));
    router.push(`/seller/search?${nextParams.toString()}`);
  }

  return (
    <aside className="map-shell interactive">
      <div className="map-toolbar">
        <div>
          <strong>Buyer demand map</strong>
          <span className="muted">{buyers.length} active buyers in the San Fernando Valley pilot</span>
        </div>
        <div className="map-toolbar-pills">
          <span>{radiusMiles} mi radius</span>
          <span>Approximate pins</span>
        </div>
      </div>
      <div className="map-canvas" ref={containerRef} />
      <div className="map-legend">
        <span><i className="legend-dot primary" /> Buyer profile</span>
        <span><i className="legend-dot active" /> Hover match</span>
      </div>
      {status ? <div className="map-status">{status}</div> : null}
      {buyers.length === 0 ? <div className="map-empty">No active buyers match this area yet.</div> : null}
      {showSearchArea ? (
        <button className="button map-search-area" onClick={searchCurrentArea} type="button">
          Search this area
        </button>
      ) : null}
    </aside>
  );
}

async function loadMapboxGl() {
  if (window.mapboxgl) return window.mapboxgl;

  if (!document.querySelector(`link[href="${mapboxCssUrl}"]`)) {
    const link = document.createElement("link");
    link.href = mapboxCssUrl;
    link.rel = "stylesheet";
    document.head.appendChild(link);
  }

  await new Promise<void>((resolve, reject) => {
    const existingScript = document.querySelector<HTMLScriptElement>(`script[src="${mapboxScriptUrl}"]`);
    if (existingScript) {
      existingScript.addEventListener("load", () => resolve(), { once: true });
      existingScript.addEventListener("error", () => reject(new Error("Mapbox failed to load.")), { once: true });
      return;
    }

    const script = document.createElement("script");
    script.src = mapboxScriptUrl;
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error("Mapbox failed to load."));
    document.head.appendChild(script);
  });

  if (!window.mapboxgl) throw new Error("Mapbox failed to initialize.");
  return window.mapboxgl;
}

function mapCenter(points: BuyerPoint[], centerLat?: number, centerLng?: number) {
  if (Number.isFinite(centerLat) && Number.isFinite(centerLng)) {
    return { lat: centerLat as number, lng: centerLng as number };
  }

  if (points.length > 0) {
    const total = points.reduce((sum, point) => ({ lat: sum.lat + point.lat, lng: sum.lng + point.lng }), { lat: 0, lng: 0 });
    return { lat: total.lat / points.length, lng: total.lng / points.length };
  }

  const total = activePilotAreas.reduce((sum, area) => ({ lat: sum.lat + area.lat, lng: sum.lng + area.lng }), { lat: 0, lng: 0 });
  return { lat: total.lat / activePilotAreas.length, lng: total.lng / activePilotAreas.length };
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
