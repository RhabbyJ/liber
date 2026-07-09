"use client";

import { useEffect, useState } from "react";
import { serviceAreaDisplayLabel, type ServiceArea } from "../lib/service-areas";
import { apiResultToServiceArea, type ServiceAreaSearchResponse } from "../lib/service-area-api";

type Props = {
  marketSlug: string;
  onSelect: (area: ServiceArea) => void;
  query?: string;
};

export function PilotZipSuggestions({ marketSlug, onSelect, query = "" }: Props) {
  const [areas, setAreas] = useState<ServiceArea[]>([]);

  useEffect(() => {
    let canceled = false;

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
        if (!canceled && suggestions.length > 0) setAreas(suggestions);
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
    <div className="pilot-zip-suggestions" aria-label="Active service-area suggestions">
      <div className="pilot-zip-suggestions-head">Service areas</div>
      <div className="pilot-zip-suggestions-grid">
        {areas.map((area) => (
          <button
            className="pilot-zip-suggestion"
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
