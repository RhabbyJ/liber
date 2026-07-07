"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { loadMapboxGl } from "../lib/mapbox-gl-loader";
import { activePilotAreas } from "../lib/launch-market";
import type { PublicBuyerPreview } from "../server/buyer-preview";

type Props = {
  previews: PublicBuyerPreview[];
  token?: string;
};

type PreviewPoint = {
  index: number;
  lat: number;
  lng: number;
  preview: PublicBuyerPreview;
};

/**
 * Public Zillow-style buyer-demand map. Pins are anonymized budget bands at
 * approximate locations only. There are no buyer ids, names, or profile
 * links here — the only action is signing up.
 */
export function PublicDemandMap({ previews, token }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<any>(null);
  const markersRef = useRef<any[]>([]);
  const [status, setStatus] = useState("");
  const [didFail, setDidFail] = useState(false);
  const [isReady, setIsReady] = useState(false);

  const points = useMemo<PreviewPoint[]>(
    () =>
      previews
        .map((preview, index) => ({ index, lat: preview.lat ?? NaN, lng: preview.lng ?? NaN, preview }))
        .filter((point) => Number.isFinite(point.lat) && Number.isFinite(point.lng)),
    [previews],
  );
  const mapboxToken = token?.trim() ?? "";
  const shouldUseMapbox = Boolean(mapboxToken);

  useEffect(() => {
    let canceled = false;

    async function setupMap() {
      if (!containerRef.current || !shouldUseMapbox) return;

      try {
        const mapboxgl = await loadMapboxGl();
        if (canceled || !containerRef.current) return;

        mapboxgl.accessToken = mapboxToken;
        mapRef.current = new mapboxgl.Map({
          antialias: true,
          attributionControl: true,
          center: [pilotCenter.lng, pilotCenter.lat],
          container: containerRef.current,
          cooperativeGestures: true,
          maxBounds: [[-118.75, 34.08], [-118.3, 34.37]],
          style: "mapbox://styles/mapbox/light-v11",
          zoom: 10.6,
        });

        let loaded = false;
        mapRef.current.addControl(new mapboxgl.NavigationControl({ showCompass: false }), "top-right");
        mapRef.current.on("load", () => {
          if (canceled) return;
          loaded = true;
          setIsReady(true);
          setStatus("");
        });
        // Only treat errors before first load as fatal; later tile hiccups are recoverable.
        mapRef.current.on("error", () => {
          if (!canceled && !loaded) setDidFail(true);
        });
      } catch {
        if (!canceled) setDidFail(true);
      }
    }

    setupMap();

    return () => {
      canceled = true;
      markersRef.current.forEach((marker) => marker.remove());
      markersRef.current = [];
      mapRef.current?.remove();
      mapRef.current = null;
    };
  }, [mapboxToken, shouldUseMapbox]);

  useEffect(() => {
    if (!isReady || !mapRef.current || !window.mapboxgl) return;

    markersRef.current.forEach((marker) => marker.remove());
    markersRef.current = [];

    for (const point of points) {
      const markerNode = document.createElement("button");
      markerNode.type = "button";
      markerNode.className = "buyer-map-marker";
      markerNode.setAttribute("aria-label", `Buyer demand around ${point.preview.area}`);
      markerNode.innerHTML = `<span>${escapeHtml(point.preview.budgetLabel)}</span>`;

      const popup = new window.mapboxgl.Popup({ closeButton: true, offset: 18 }).setHTML(previewPopupHtml(point.preview));
      const marker = new window.mapboxgl.Marker({ element: markerNode })
        .setLngLat([point.lng, point.lat])
        .setPopup(popup)
        .addTo(mapRef.current);

      markersRef.current.push(marker);
    }

    if (points.length > 1) {
      const bounds = new window.mapboxgl.LngLatBounds();
      points.forEach((point) => bounds.extend([point.lng, point.lat]));
      mapRef.current.fitBounds(bounds, { maxZoom: 12, padding: 90 });
    }
  }, [isReady, points]);

  if (!shouldUseMapbox || didFail) {
    return <PublicStaticDemandMap points={points} />;
  }

  return (
    <div className="public-map-shell">
      <StaticDemandLayer points={points} />
      <div className="map-canvas" ref={containerRef} />
      {status ? <div className="map-status">{status}</div> : null}
      <div className="public-map-note">Approximate areas · anonymized preview</div>
    </div>
  );
}

function PublicStaticDemandMap({ points }: { points: PreviewPoint[] }) {
  return (
    <div className="public-map-shell fallback" aria-label="Buyer demand preview map">
      <StaticDemandLayer points={points} />
      <div className="public-map-note">Approximate areas - privacy-safe preview</div>
    </div>
  );
}

function StaticDemandLayer({ points }: { points: PreviewPoint[] }) {
  return (
    <div className="public-map-static-grid">
      {points.length === 0 ? (
        <div className="public-map-static-empty">
          <strong>Buyer demand map</strong>
          <span>Preview pins will appear as active buyer demand is added.</span>
        </div>
      ) : (
        points.map((point) => {
          const position = publicPinPosition(point, points);
          return (
            <span
              aria-label={`Buyer demand around ${point.preview.area}`}
              className="buyer-map-marker public-map-static-pin"
              key={`${point.preview.area}-${point.index}`}
              style={{ left: `${position.left}%`, top: `${position.top}%` }}
            >
              <span>{staticBudgetLabel(point.preview.budgetLabel)}</span>
            </span>
          );
        })
      )}
    </div>
  );
}

const pilotCenter = activePilotAreas.reduce(
  (sum, area, _, list) => ({ lat: sum.lat + area.lat / list.length, lng: sum.lng + area.lng / list.length }),
  { lat: 0, lng: 0 },
);

function previewPopupHtml(preview: PublicBuyerPreview) {
  const facts = [
    preview.bedroomsMin ? `${preview.bedroomsMin}+ bed` : null,
    preview.bathroomsMin ? `${preview.bathroomsMin}+ bath` : null,
    preview.squareFeetMin ? `${preview.squareFeetMin.toLocaleString()}+ sqft` : null,
    preview.condition || null,
  ].filter(Boolean) as string[];

  return `
    <div class="buyer-map-popup">
      <strong>${escapeHtml(preview.budgetLabel)}</strong>
      ${facts.length > 0 ? `<span>${escapeHtml(facts.join(" · "))}</span>` : ""}
      <span>${escapeHtml(preview.label)} · ${escapeHtml(preview.area)}</span>
      <div>
        <a href="/signup?role=seller&next=/seller/search">Sign up to view buyers</a>
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

function publicPinPosition(point: PreviewPoint, points: PreviewPoint[]) {
  const lats = points.map((item) => item.lat);
  const lngs = points.map((item) => item.lng);
  const minLat = Math.min(...lats);
  const maxLat = Math.max(...lats);
  const minLng = Math.min(...lngs);
  const maxLng = Math.max(...lngs);
  const latSpan = maxLat - minLat || 0.1;
  const lngSpan = maxLng - minLng || 0.1;
  const offset = staticPinOffset(point.index);

  return {
    left: clamp(((point.lng - minLng) / lngSpan) * 76 + 12 + offset.left),
    top: clamp((1 - (point.lat - minLat) / latSpan) * 76 + 12 + offset.top),
  };
}

function staticPinOffset(index: number) {
  const offsets = [
    { left: 0, top: 0 },
    { left: 8, top: -5 },
    { left: -7, top: 5 },
    { left: 7, top: 6 },
    { left: -8, top: -6 },
    { left: 10, top: 3 },
  ];
  return offsets[index % offsets.length];
}

function staticBudgetLabel(value: string) {
  if (value.startsWith("Up to")) return value;
  return value.replace(/\u2013.*$/, "+");
}

function clamp(value: number) {
  return Math.max(24, Math.min(76, value));
}
