"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { approximateBuyerPoint } from "../lib/buyer-map-point";
import { compactBudgetRange, criteriaFacts, pinBudgetLabel } from "../lib/listing-format";
import { syncSelectedAreaLayer } from "../lib/map-boundary-layers";
import { marketMapBounds, marketMapInstanceKey, type MarketMapContext, type SelectedMapArea } from "../lib/map-area";
import {
  isFatalMapError,
  liberMapOptions,
  mapCameraTarget,
  mapFitPadding,
  readMapView,
  saveMapView,
  type MapCameraTarget,
} from "../lib/map-camera";
import {
  canHover,
  declutterPricePins,
  escapeHtml,
  lockMapOrientation,
  quietBasemap,
  wirePopupInteractions,
} from "../lib/map-presentation";
import { loadMapboxGl, preloadMapboxGl, type MapboxMap, type MapboxMarker, type MapboxPopup } from "../lib/mapbox-gl-loader";
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

type MarkerBuyerPoint = BuyerPoint & {
  markerOffset: [number, number];
};

export function InteractiveBuyerMap({ buyers, clearAreaHref, market, selectedServiceArea: selectedArea = null, token }: Props) {
  if (token) preloadMapboxGl();
  const router = useRouter();
  const viewScope = `${usePathname()}?${useSearchParams().toString()}`;
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MapboxMap | null>(null);
  const popupRef = useRef<MapboxPopup | null>(null);
  const pinnedPopupRef = useRef<string | null>(null);
  const markersRef = useRef<Map<string, MapboxMarker>>(new Map());
  const markerNodesRef = useRef<Map<string, HTMLElement>>(new Map());
  const cameraKeyRef = useRef<string | null>(null);
  const latestCameraRef = useRef<{ target: MapCameraTarget; viewScope: string } | null>(null);
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
  const markerPoints = useMemo(() => withMarkerOffsets(buyerPoints), [buyerPoints]);
  const cameraTarget = useMemo(() => mapCameraTarget(market, selectedArea, buyerPoints), [buyerPoints, market, selectedArea]);
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
  const marketBoundsContext = useMemo(
    () => ({ bbox: [marketWest, marketSouth, marketEast, marketNorth] as [number, number, number, number] }),
    [marketEast, marketNorth, marketSouth, marketWest],
  );

  useEffect(() => {
    setDidFail(false);
  }, [mapInstanceKey]);

  useEffect(() => {
    latestCameraRef.current = { target: cameraTarget, viewScope };
  }, [cameraTarget, viewScope]);

  useEffect(() => {
    if (didFail) return;
    let canceled = false;
    let resizeObserver: ResizeObserver | null = null;
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
        const camera = latestCameraRef.current;
        const savedView = camera ? readMapView(camera.viewScope, marketBoundsContext) : null;
        cameraKeyRef.current = camera?.target.key ?? null;
        mapboxgl.accessToken = token;
        const map = new mapboxgl.Map(liberMapOptions(containerRef.current, marketBoundsContext, savedView, camera?.target));
        mapRef.current = map;
        lockMapOrientation(map);

        map.addControl(new mapboxgl.NavigationControl({ showCompass: false }), "bottom-right");
        popupRef.current = new mapboxgl.Popup({
          className: "liber-map-popup",
          closeButton: false,
          closeOnClick: true,
          focusAfterOpen: false,
          maxWidth: "300px",
        });
        popupRef.current.on("close", () => {
          pinnedPopupRef.current = null;
        });
        // Labels and layers can be styled as soon as the style arrives; tiles keep streaming in.
        map.on("style.load", () => {
          if (canceled) return;
          quietBasemap(map);
          setIsReady(true);
        });
        map.on("load", () => {
          if (canceled) return;
          loaded = true;
          setIsLoading(false);
        });
        map.on("moveend", () => {
          const scope = latestCameraRef.current?.viewScope;
          if (!canceled && scope) saveMapView(scope, { center: [map.getCenter().lng, map.getCenter().lat], zoom: map.getZoom() });
        });
        map.on("error", (event) => {
          if (!loaded && isFatalMapError(event)) fallBackToStaticMap();
        });
        resizeObserver = new ResizeObserver(() => mapRef.current?.resize());
        resizeObserver.observe(containerRef.current);
      } catch {
        fallBackToStaticMap();
      }
    }

    setupMap();

    const markers = markersRef.current;
    const markerNodes = markerNodesRef.current;
    return () => {
      canceled = true;
      resizeObserver?.disconnect();
      markers.forEach((marker) => marker.remove());
      markers.clear();
      markerNodes.clear();
      popupRef.current?.remove();
      popupRef.current = null;
      mapRef.current?.remove();
      mapRef.current = null;
    };
  }, [didFail, mapInstanceKey, marketBoundsContext, token]);

  useEffect(() => {
    const map = mapRef.current;
    if (!isReady || !map || cameraKeyRef.current === cameraTarget.key) return;
    cameraKeyRef.current = cameraTarget.key;
    const savedView = readMapView(viewScope, marketBoundsContext);
    if (savedView) {
      map.jumpTo(savedView);
      return;
    }
    map.fitBounds(cameraTarget.bounds, { duration: 600, maxZoom: cameraTarget.maxZoom, padding: mapFitPadding });
  }, [cameraTarget, isReady, marketBoundsContext, viewScope]);

  useEffect(() => {
    if (!isReady || !mapRef.current) return;
    syncSelectedAreaLayer(mapRef.current, selectedAreaGeojson);
  }, [isReady, selectedAreaGeojson]);

  useEffect(() => {
    if (!isReady || !mapRef.current || !window.mapboxgl) return;
    const map = mapRef.current;

    // A pinned card for a buyer who left the results must not linger.
    popupRef.current?.remove();
    markersRef.current.forEach((marker) => marker.remove());
    markersRef.current.clear();
    markerNodesRef.current.clear();

    function showPopup(point: MarkerBuyerPoint, pinned: boolean, markerNode: HTMLElement, viaKeyboard = false) {
      const popup = popupRef.current;
      if (!popup) return;
      popup
        .setLngLat([point.lng, point.lat])
        .setOffset(popupOffsets(point.markerOffset))
        .setHTML(popupHtml(point.buyer))
        .addTo(map);
      // addTo() closes an already-open popup first, which clears the pin; record the new state after it.
      pinnedPopupRef.current = pinned ? point.buyer.id : null;
      wirePopupInteractions(popup, { focusLink: viaKeyboard, navigate: (href) => router.push(href), returnFocusTo: markerNode });
    }

    for (const point of markerPoints) {
      const markerNode = document.createElement("button");
      markerNode.type = "button";
      // Mapbox gives custom marker elements role="img" unless they already declare a role.
      markerNode.setAttribute("role", "button");
      markerNode.className = "map-price-pin";
      markerNode.setAttribute("aria-label", `${point.buyer.isDemo ? "Demo buyer " : ""}${point.buyer.name}, budget ${compactBudgetRange(point.buyer.budgetMin, point.buyer.budgetMax)}`);
      markerNode.dataset.buyerId = point.buyer.id;
      // Budget-first pins read like listing price pins but represent buyers.
      markerNode.innerHTML = `<span>${escapeHtml(pinBudgetLabel(point.buyer.budgetMin, point.buyer.budgetMax))}</span>`;
      markerNode.addEventListener("mouseenter", () => {
        highlightBuyer(point.buyer.id, true);
        if (canHover() && !pinnedPopupRef.current) showPopup(point, false, markerNode);
      });
      markerNode.addEventListener("mouseleave", () => {
        highlightBuyer(point.buyer.id, false);
        if (!pinnedPopupRef.current) popupRef.current?.remove();
      });
      markerNode.addEventListener("focus", () => highlightBuyer(point.buyer.id, true));
      markerNode.addEventListener("blur", () => highlightBuyer(point.buyer.id, false));
      markerNode.addEventListener("click", (event) => {
        event.stopPropagation();
        showPopup(point, true, markerNode, event.detail === 0);
      });

      const marker = new window.mapboxgl.Marker({ anchor: "bottom", element: markerNode, offset: point.markerOffset })
        .setLngLat([point.lng, point.lat])
        .addTo(map);

      markersRef.current.set(point.buyer.id, marker);
      markerNodesRef.current.set(point.buyer.id, markerNode);
    }

    const pinLayout = markerPoints.flatMap((point) => {
      const node = markerNodesRef.current.get(point.buyer.id);
      if (!node) return [];
      node.dataset.labelWidth = String(Math.ceil(node.getBoundingClientRect().width) || 56);
      return [{ lat: point.lat, lng: point.lng, node, offset: point.markerOffset }];
    });
    const declutter = () => declutterPricePins(map, pinLayout);
    map.on("moveend", declutter);
    map.on("resize", declutter);
    declutter();

    return () => {
      map.off("moveend", declutter);
      map.off("resize", declutter);
    };
  }, [highlightBuyer, isReady, markerPoints, router]);

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
    return <StaticBuyerMap buyers={buyers} label="Mapbox unavailable" market={market} selectedServiceArea={selectedArea} />;
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
  const radius = count <= 2 ? 30 : count <= 4 ? 38 : 46;
  return [Math.round(Math.cos(angle) * radius * 1.35), Math.round(Math.sin(angle) * radius)];
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
