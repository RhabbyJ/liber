"use client";

import { useEffect, useRef, useState } from "react";
import { apiResultToServiceArea, type ServiceAreaSearchResponse } from "../lib/service-area-api";
import { LatestRequestGate, runLatestRequest } from "../lib/latest-request";
import { serviceAreaDisplayLabel, type ServiceArea } from "../lib/service-areas";

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
    setAreas([]);
    void runLatestRequest({
      gate: requestGateRef.current,
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
      requestGateRef.current.invalidate();
    };
  }, [marketSlug, query]);

  return (
    <div className="service-area-suggestions" aria-label="Active service-area suggestions">
      <div className="service-area-suggestions-head">Service areas</div>
      <div className="service-area-suggestions-grid">
        {areas.map((area) => (
          <button
            className="service-area-suggestion"
            key={`${marketSlug}:${area.id ?? area.slug}`}
            onClick={() => onSelect(area)}
            onMouseDown={(event) => event.preventDefault()}
            type="button"
          >
            <strong>{area.postalCode ?? area.label}</strong>
            <span>{serviceAreaDisplayLabel(area)}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
