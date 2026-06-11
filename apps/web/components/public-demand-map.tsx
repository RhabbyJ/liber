"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { loadMapboxGl } from "../lib/mapbox-gl-loader";
import { activePilotAreas } from "../lib/launch-market";
import type { PublicBuyerPreview } from "../server/buyer-preview";

type Props = {
  previews: PublicBuyerPreview[];
  token: string;
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
  const [status, setStatus] = useState("Loading buyer demand map");
  const [didFail, setDidFail] = useState(false);
  const [isReady, setIsReady] = useState(false);

  const points = useMemo<PreviewPoint[]>(
    () =>
      previews
        .map((preview, index) => ({ index, lat: preview.lat ?? NaN, lng: preview.lng ?? NaN, preview }))
        .filter((point) => Number.isFinite(point.lat) && Number.isFinite(point.lng)),
    [previews],
  );

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
          center: [pilotCenter.lng, pilotCenter.lat],
          container: containerRef.current,
          cooperativeGestures: true,
          maxBounds: [[-118.75, 34.08], [-118.3, 34.37]],
          style: "mapbox://styles/mapbox/streets-v12",
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
  }, [token]);

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

  if (didFail) {
    return (
      <div className="public-map-shell unavailable">
        <div className="public-map-fallback">
          <strong>Buyer demand map is unavailable right now.</strong>
          <span>The buyer previews beside this panel are still live. Sign up to search all buyer demand.</span>
        </div>
      </div>
    );
  }

  return (
    <div className="public-map-shell">
      <div className="map-canvas" ref={containerRef} />
      {status ? <div className="map-status">{status}</div> : null}
      <div className="public-map-note">Approximate areas · anonymized preview</div>
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
