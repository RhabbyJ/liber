"use client";

import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import {
  serviceAreaDisplayLabel,
  type ServiceArea,
} from "../lib/service-areas";
import {
  apiResultToServiceArea,
  type ServiceAreaSearchResponse,
} from "../lib/service-area-api";
import { Icon } from "./icon";

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
  const [isOpen, setIsOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const inputRef = useRef<HTMLInputElement>(null);
  const activeOptionRef = useRef<HTMLButtonElement>(null);
  const requestRef = useRef<AbortController | null>(null);
  const listId = `${inputId}-service-areas`;

  useEffect(() => {
    if (!isOpen) return;
    const controller = new AbortController();
    requestRef.current = controller;
    setSuggestedAreas([]);
    setActiveIndex(-1);
    setIsLookingUp(true);
    setMessage("");
    if (!query.trim()) {
      setIsLookingUp(false);
      return () => controller.abort();
    }

    async function loadSuggestions() {
      try {
        const params = new URLSearchParams({ market: marketSlug, q: query.trim() });
        const response = await fetch(`/api/service-areas/search?${params}`, {
          cache: "no-store",
          signal: controller.signal,
        });
        if (!response.ok) throw new Error("Service-area search unavailable.");
        const payload = await response.json() as ServiceAreaSearchResponse;
        const suggestions = payload.suggestions.map(apiResultToServiceArea);
        if (!controller.signal.aborted) setSuggestedAreas(suggestions);
      } catch {
        if (!controller.signal.aborted) {
          setSuggestedAreas([]);
          setMessage("Area search is temporarily unavailable. Try typing again.");
        }
      } finally {
        if (!controller.signal.aborted) setIsLookingUp(false);
      }
    }

    const timeout = setTimeout(() => void loadSuggestions(), 200);
    return () => {
      clearTimeout(timeout);
      controller.abort();
    };
  }, [isOpen, marketSlug, query]);

  useEffect(() => {
    if (isOpen) activeOptionRef.current?.scrollIntoView({ block: "nearest" });
  }, [activeIndex, isOpen]);

  function handleQueryChange(value: string) {
    requestRef.current?.abort();
    setQuery(value);
    setMessage("");
    setServiceAreaSlug("");
    setSuggestedAreas([]);
    setActiveIndex(-1);
    setIsLookingUp(true);
    setIsOpen(true);
  }

  function applyArea(area: ServiceArea) {
    requestRef.current?.abort();
    inputRef.current?.focus();
    setQuery(serviceAreaDisplayLabel(area));
    setServiceAreaSlug(area.slug);
    setMessage("");
    setIsOpen(false);
    setIsLookingUp(false);
    setActiveIndex(-1);
  }

  function handleKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.nativeEvent.isComposing) return;
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      setIsOpen(true);
      if (suggestedAreas.length) {
        setActiveIndex((index) => event.key === "ArrowDown"
          ? (index + 1) % suggestedAreas.length
          : (index <= 0 ? suggestedAreas.length : index) - 1);
      }
    } else if (event.key === "Enter") {
      event.preventDefault();
      if (isOpen && suggestedAreas[activeIndex]) applyArea(suggestedAreas[activeIndex]);
      else if (!serviceAreaSlug) {
        setIsOpen(true);
        setMessage("Choose an area from the suggestions.");
      }
    } else if (event.key === "Escape") {
      event.preventDefault();
      setIsOpen(false);
      setActiveIndex(-1);
    }
  }

  return (
    <>
      <div className="field full">
        <label htmlFor={inputId}>{label}</label>
        <div
          className="buyer-location-lookup"
          onBlurCapture={(event) => {
            if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
              setIsOpen(false);
              setActiveIndex(-1);
            }
          }}
        >
          <div className="buyer-location-input-wrap">
            <Icon name="search" size={18} />
            <input
              aria-activedescendant={isOpen && activeIndex >= 0 ? `${listId}-${activeIndex}` : undefined}
              aria-autocomplete="list"
              aria-controls={isOpen ? listId : undefined}
              aria-describedby={`${inputId}-status`}
              aria-expanded={isOpen}
              autoComplete="off"
              id={inputId}
              maxLength={80}
              onChange={(event) => handleQueryChange(event.target.value)}
              onClick={() => setIsOpen(true)}
              onFocus={() => setIsOpen(true)}
              onKeyDown={handleKeyDown}
              placeholder="Search city, neighborhood, or ZIP"
              ref={inputRef}
              role="combobox"
              value={query}
            />
            {query ? (
              <button
                aria-label="Clear target area"
                className="buyer-location-clear"
                onClick={() => {
                  handleQueryChange("");
                  inputRef.current?.focus();
                }}
                type="button"
              >
                <Icon name="close" size={16} />
              </button>
            ) : null}
          </div>
          {isOpen ? (
            <div className="service-area-suggestions buyer-area-suggestions">
              <div aria-busy={isLookingUp} aria-label="Matching service areas" id={listId} role="listbox">
                {suggestedAreas.map((area, index) => (
                  <button
                    aria-selected={index === activeIndex}
                    className="service-area-suggestion buyer-area-option"
                    id={`${listId}-${index}`}
                    key={`${marketSlug}:${area.slug}`}
                    onClick={() => applyArea(area)}
                    onMouseDown={(event) => event.preventDefault()}
                    ref={index === activeIndex ? activeOptionRef : undefined}
                    role="option"
                    tabIndex={-1}
                    type="button"
                  >
                    <strong>{serviceAreaDisplayLabel(area)}</strong>
                    <span>{area.type === "zip" ? "Approximate ZIP area" : area.type === "city" ? "City" : "Neighborhood"}</span>
                  </button>
                ))}
              </div>
              {isLookingUp || !suggestedAreas.length ? (
                <p className="service-area-suggestions-empty" role="status">
                  {isLookingUp ? "Searching areas..." : message || (query.trim()
                    ? "No matching areas. Try another city, neighborhood, or ZIP."
                    : "Type a city, neighborhood, or ZIP to see options.")}
                </p>
              ) : null}
            </div>
          ) : null}
        </div>
        <span
          aria-live="polite"
          className={`location-selection-status ${serviceAreaSlug ? "selected" : ""}`}
          id={`${inputId}-status`}
        >
          {serviceAreaSlug ? <Icon name="check" size={16} /> : null}
          {serviceAreaSlug ? `Selected area: ${query}` : message || "Start typing, then choose a matching area."}
        </span>
      </div>
      <input name="desiredServiceAreaSlug" type="hidden" value={serviceAreaSlug} />
      <input name="desiredMarketSlug" type="hidden" value={marketSlug} />
    </>
  );
}
