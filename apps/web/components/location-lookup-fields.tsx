"use client";

import { useEffect, useState } from "react";
import {
  serviceAreaDisplayLabel,
  type ServiceArea,
} from "../lib/service-areas";
import {
  apiResultToServiceArea,
  hasSearchSuggestions,
  resolvedAreaFromSearchPayload,
  type ServiceAreaSearchResponse,
} from "../lib/service-area-api";

type Props = {
  defaultLocation?: string;
  defaultServiceAreaSlug?: string;
  inputId: string;
  label: string;
  marketSlug: string;
};

export function LocationLookupFields({
  defaultLocation = "",
  defaultServiceAreaSlug = "",
  inputId,
  label,
  marketSlug,
}: Props) {
  const [query, setQuery] = useState(defaultLocation);
  const [serviceAreaSlug, setServiceAreaSlug] = useState(defaultServiceAreaSlug);
  const [message, setMessage] = useState("");
  const [isLookingUp, setIsLookingUp] = useState(false);
  const [suggestedAreas, setSuggestedAreas] = useState<ServiceArea[]>([]);
  const activeZipAreas = suggestedAreas.filter((area) => area.type === "zip" && area.postalCode);

  useEffect(() => {
    let canceled = false;
    setSuggestedAreas([]);

    async function loadSuggestions() {
      try {
        const params = new URLSearchParams({ market: marketSlug, q: query.trim() });
        const response = await fetch(`/api/service-areas/search?${params}`, { cache: "no-store" });
        if (!response.ok) {
          if (!canceled) setSuggestedAreas([]);
          return;
        }
        const payload = await response.json() as ServiceAreaSearchResponse;
        const suggestions = payload.suggestions.map(apiResultToServiceArea);
        if (!canceled) setSuggestedAreas(suggestions);
      } catch {
        if (!canceled) setSuggestedAreas([]);
      }
    }

    void loadSuggestions();
    return () => {
      canceled = true;
    };
  }, [marketSlug, query]);

  async function lookup() {
    setMessage("");
    if (query.trim().length < 3) {
      setMessage("Enter a supported city, neighborhood, or ZIP before lookup.");
      return;
    }

    setIsLookingUp(true);
    try {
      const params = new URLSearchParams({ market: marketSlug, q: query });
      const response = await fetch(`/api/service-areas/search?${params}`, { cache: "no-store" });
      const payload = await response.json() as ServiceAreaSearchResponse;

      if (!response.ok) {
        setMessage("We're not active there yet.");
        return;
      }
      const resolvedArea = resolvedAreaFromSearchPayload(payload);
      if (resolvedArea) {
        applyArea(resolvedArea);
        setMessage(`${serviceAreaDisplayLabel(resolvedArea)} is a supported Liber service area.`);
        return;
      }
      if (hasSearchSuggestions(payload)) {
        setMessage("Choose a specific supported city, neighborhood, or ZIP.");
        return;
      }

      setMessage("We're not active there yet.");
    } catch {
      setMessage("Location lookup failed. Try again before saving.");
    } finally {
      setIsLookingUp(false);
    }
  }

  function handleQueryChange(value: string) {
    setQuery(value);
    setMessage("");

    setServiceAreaSlug("");
  }

  function applyArea(area: ServiceArea) {
    setQuery(serviceAreaDisplayLabel(area));
    setServiceAreaSlug(area.slug);
  }

  return (
    <>
      <div className="field full">
        <label htmlFor={inputId}>{label}</label>
        <div className="lookup-row">
          <input
            autoComplete="off"
            id={inputId}
            list={`${inputId}-service-areas`}
            onChange={(event) => handleQueryChange(event.target.value)}
            placeholder="Search city, neighborhood, or ZIP"
            value={query}
          />
          <button className="button secondary" disabled={isLookingUp} onClick={lookup} type="button">
            {isLookingUp ? "Checking" : "Use area"}
          </button>
        </div>
        <datalist id={`${inputId}-service-areas`}>
          {suggestedAreas.map((area) => (
            <option key={area.slug} value={serviceAreaDisplayLabel(area)} />
          ))}
        </datalist>
        {message ? <span className="muted small">{message}</span> : null}
      </div>
      <input name="desiredServiceAreaSlug" type="hidden" value={serviceAreaSlug} />
      <input name="desiredMarketSlug" type="hidden" value={marketSlug} />
      <div className="field">
        <label>Active ZIPs</label>
        <select
          aria-label="Active ZIP"
          onChange={(event) => {
            const area = activeZipAreas.find((item) => item.postalCode === event.target.value);
            if (area) applyArea(area);
          }}
          value={activeZipAreas.find((area) => area.slug === serviceAreaSlug)?.postalCode ?? ""}
        >
          <option value="">Select ZIP</option>
          {activeZipAreas.map((area) => (
            <option key={area.slug} value={area.postalCode ?? ""}>{serviceAreaDisplayLabel(area)}</option>
          ))}
        </select>
      </div>
    </>
  );
}
