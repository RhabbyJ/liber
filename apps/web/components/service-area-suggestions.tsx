"use client";

import { useEffect, useRef, useState } from "react";
import { apiResultToServiceArea, type ServiceAreaSearchResponse } from "../lib/service-area-api";
import { LatestRequestGate, runLatestRequest } from "../lib/latest-request";
import type { ServiceArea } from "../lib/service-areas";

type Props = {
  marketSlug: string;
  onSelect: (area: ServiceArea) => void;
  query?: string;
};

export function ServiceAreaSuggestions({ marketSlug, onSelect, query = "" }: Props) {
  const [areas, setAreas] = useState<ServiceArea[]>([]);
  const requestGateRef = useRef(new LatestRequestGate());

  useEffect(() => {
    const controller = new AbortController();
    const gate = requestGateRef.current;
    setAreas([]);
    void runLatestRequest({
      gate,
      load: async () => {
        const params = new URLSearchParams({ market: marketSlug, q: query.trim() });
        const response = await fetch(`/api/service-areas/search?${params}`, { cache: "no-store", signal: controller.signal });
        if (!response.ok) throw new Error("Service-area lookup failed.");
        const payload = await response.json() as ServiceAreaSearchResponse;
        return payload.suggestions.map(apiResultToServiceArea);
      },
      onError: () => setAreas([]),
      onSuccess: setAreas,
    });
    return () => {
      controller.abort();
      gate.invalidate();
    };
  }, [marketSlug, query]);

  return (
    <div className="service-area-suggestions" aria-label="Active service-area suggestions">
      <div className="service-area-suggestions-head">Service areas</div>
      <div className="service-area-suggestions-grid">
        {areas.map((area) => {
          const primaryLabel = area.postalCode ?? area.label;
          const secondaryLabel = area.type === "zip"
            ? "Approximate ZIP area"
            : area.type === "city"
              ? "City service area"
              : area.type === "neighborhood" && area.city
                ? `Neighborhood in ${area.city}`
                : null;
          return (
            <button
              className="service-area-suggestion"
              key={`${marketSlug}:${area.slug}`}
              onClick={() => onSelect(area)}
              onMouseDown={(event) => event.preventDefault()}
              type="button"
            >
              <strong>{primaryLabel}</strong>
              {secondaryLabel ? <span>{secondaryLabel}</span> : null}
            </button>
          );
        })}
      </div>
    </div>
  );
}
