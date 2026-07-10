"use client";

import { useEffect, useState } from "react";
import { apiResultToServiceArea, type ServiceAreaSearchResponse } from "../lib/service-area-api";
import { serviceAreaDisplayLabel, type ServiceArea } from "../lib/service-areas";

type Props = {
  marketSlug: string;
  onSelect: (area: ServiceArea) => void;
  query?: string;
};

export function ServiceAreaSuggestions({ marketSlug, onSelect, query = "" }: Props) {
  const [areas, setAreas] = useState<ServiceArea[]>([]);

  useEffect(() => {
    let canceled = false;
    setAreas([]);

    async function loadSuggestions() {
      try {
        const params = new URLSearchParams({ market: marketSlug, q: query.trim() });
        const response = await fetch(`/api/service-areas/search?${params}`, { cache: "no-store" });
        if (!response.ok) {
          if (!canceled) setAreas([]);
          return;
        }
        const payload = await response.json() as ServiceAreaSearchResponse;
        const suggestions = payload.suggestions.map(apiResultToServiceArea);
        if (!canceled) setAreas(suggestions);
      } catch {
        if (!canceled) setAreas([]);
      }
    }

    void loadSuggestions();
    return () => {
      canceled = true;
    };
  }, [marketSlug, query]);

  return (
    <div className="service-area-suggestions" aria-label="Active service-area suggestions">
      <div className="service-area-suggestions-head">Service areas</div>
      <div className="service-area-suggestions-grid">
        {areas.map((area) => (
          <button
            className="service-area-suggestion"
            key={area.slug}
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
