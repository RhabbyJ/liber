"use client";

import { useState } from "react";
import {
  serviceAreaDisplayLabel,
  type ServiceArea,
} from "../lib/service-areas";
import {
  hasSearchSuggestions,
  resolvedAreaFromSearchPayload,
} from "../lib/service-area-api";
import { fetchServiceAreaSearch } from "../lib/service-area-search-client";
import { Icon } from "./icon";
import { useServiceAreaCombobox } from "./service-area-combobox";

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
  const [isSuggestionsOpen, setIsSuggestionsOpen] = useState(false);
  const combobox = useServiceAreaCombobox({
    isOpen: isSuggestionsOpen,
    marketSlug,
    onOpenChange: setIsSuggestionsOpen,
    onSelect: applyArea,
    query,
  });

  async function lookup() {
    setMessage("");
    if (query.trim().length < 2) {
      setMessage("Enter a supported city, neighborhood, or ZIP before lookup.");
      return;
    }

    setIsLookingUp(true);
    try {
      const payload = await fetchServiceAreaSearch(marketSlug, query);
      const resolvedArea = resolvedAreaFromSearchPayload(payload);
      if (resolvedArea) {
        applyArea(resolvedArea);
        return;
      }
      if (hasSearchSuggestions(payload)) {
        setMessage("Choose a specific supported city, neighborhood, or ZIP.");
        setIsSuggestionsOpen(true);
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
    setIsSuggestionsOpen(true);
  }

  function applyArea(area: ServiceArea) {
    setQuery(serviceAreaDisplayLabel(area));
    setServiceAreaSlug(area.slug);
    setMessage("");
    setIsSuggestionsOpen(false);
  }

  return (
    <>
      <div className="field full">
        <label htmlFor={inputId}>{label}</label>
        <div className="lookup-row">
          <div
            className="lookup-combobox"
            onBlurCapture={(event) => {
              const nextTarget = event.relatedTarget;
              if (!(nextTarget instanceof Node) || !event.currentTarget.contains(nextTarget)) {
                setIsSuggestionsOpen(false);
              }
            }}
          >
            <input
              {...combobox.inputProps}
              id={inputId}
              onChange={(event) => handleQueryChange(event.target.value)}
              onClick={() => setIsSuggestionsOpen(true)}
              onFocus={() => setIsSuggestionsOpen(true)}
              onKeyDown={(event) => {
                combobox.inputProps.onKeyDown(event);
                // Enter on typed text resolves the area instead of submitting the whole profile form.
                if (!event.defaultPrevented && event.key === "Enter") {
                  event.preventDefault();
                  void lookup();
                }
              }}
              placeholder="Search city, neighborhood, or ZIP"
              value={query}
            />
            {combobox.listbox}
          </div>
          <button className="button secondary" disabled={isLookingUp} onClick={lookup} type="button">
            {isLookingUp ? "Checking" : "Use area"}
          </button>
        </div>
        <span
          aria-live="polite"
          className={`location-selection-status ${serviceAreaSlug ? "selected" : ""}`}
        >
          {serviceAreaSlug ? <Icon name="check" size={12} /> : null}
          {serviceAreaSlug ? `Selected area: ${query}` : message || "Choose a suggestion, or type an exact name and select Use area."}
        </span>
      </div>
      <input name="desiredServiceAreaSlug" type="hidden" value={serviceAreaSlug} />
      <input name="desiredMarketSlug" type="hidden" value={marketSlug} />
    </>
  );
}
