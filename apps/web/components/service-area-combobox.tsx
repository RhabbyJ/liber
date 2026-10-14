"use client";

import { useEffect, useId, useMemo, useRef, useState, type KeyboardEvent } from "react";
import { highlightSegments } from "../lib/service-area-highlight";
import { fetchServiceAreaSearch, useServiceAreaSearch } from "../lib/use-service-area-search";
import { resolvedAreaFromSearchPayload, type ServiceAreaSuggestionArea } from "../lib/service-area-api";
import {
  serviceAreaContextLabel,
  serviceAreaDisplayLabel,
  serviceAreaShortName,
  type ServiceArea,
} from "../lib/service-areas";
import { Icon } from "./icon";

type Props = {
  ariaLabel: string;
  className?: string;
  clearLabel?: string;
  defaultValue?: string;
  inputId?: string;
  marketSlug: string;
  onClear?: () => void;
  /** Called when submitted text matches no supported area at all. */
  onNoMatch?: (query: string) => void;
  onQueryChange?: (query: string) => void;
  onSelect: (area: ServiceArea) => void;
  placeholder?: string;
  submitClassName?: string;
  submitLabel?: string;
};

type Option = { area: ServiceAreaSuggestionArea; recent: boolean };

const RECENT_LIMIT = 5;

/**
 * Accessible city/neighborhood/ZIP combobox shared by every service-area search.
 * Selection is always explicit: a highlighted option, a click, or a submitted
 * query whose server resolution is exact and unambiguous.
 */
export function ServiceAreaCombobox({
  ariaLabel,
  className = "",
  clearLabel = "Clear location",
  defaultValue = "",
  inputId,
  marketSlug,
  onClear,
  onNoMatch,
  onQueryChange,
  onSelect,
  placeholder = "City, neighborhood, or ZIP",
  submitClassName = "area-search-submit",
  submitLabel,
}: Props) {
  const generatedId = useId();
  const id = inputId ?? `area-search-${generatedId.replace(/:/g, "")}`;
  const listId = `${id}-listbox`;
  const inputRef = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState(defaultValue);
  const [isOpen, setIsOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const [message, setMessage] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [recentAreas, setRecentAreas] = useState<ServiceArea[]>([]);
  const isSelectedText = query === defaultValue && Boolean(defaultValue);
  const search = useServiceAreaSearch(query, marketSlug, isOpen && !isSelectedText);

  useEffect(() => {
    setQuery(defaultValue);
    setMessage("");
    setIsOpen(false);
    setActiveIndex(-1);
  }, [defaultValue, marketSlug]);

  useEffect(() => {
    if (isOpen) setRecentAreas(readRecentAreas(marketSlug));
  }, [isOpen, marketSlug]);

  const showRecent = isOpen && (!query.trim() || isSelectedText);
  const options = useMemo<Option[]>(() => {
    if (showRecent) return recentAreas.map((area) => ({ area, recent: true }));
    return search.suggestions.map((area) => ({ area, recent: false }));
  }, [recentAreas, search.suggestions, showRecent]);
  const fuzzyOnly = !showRecent && options.length > 0 && options.every((option) => option.area.match === "fuzzy");

  useEffect(() => {
    setActiveIndex((index) => (index >= options.length ? -1 : index));
  }, [options.length]);

  useEffect(() => {
    if (activeIndex < 0) return;
    document.getElementById(`${listId}-${activeIndex}`)?.scrollIntoView({ block: "nearest" });
  }, [activeIndex, listId]);

  function choose(area: ServiceArea) {
    rememberRecentArea(marketSlug, area);
    setQuery(serviceAreaDisplayLabel(area));
    setMessage("");
    setIsOpen(false);
    setActiveIndex(-1);
    onSelect(area);
  }

  function updateQuery(value: string) {
    setQuery(value);
    setMessage("");
    setActiveIndex(-1);
    setIsOpen(true);
    onQueryChange?.(value);
  }

  function clear() {
    updateQuery("");
    inputRef.current?.focus();
    onClear?.();
  }

  async function submit() {
    const value = query.trim();
    if (activeIndex >= 0 && options[activeIndex]) {
      choose(options[activeIndex].area);
      return;
    }
    if (isSelectedText) {
      setIsOpen(false);
      return;
    }
    if (!value) {
      setMessage("Type a city, neighborhood, or ZIP code.");
      setIsOpen(true);
      return;
    }

    setIsSubmitting(true);
    try {
      const payload = await fetchServiceAreaSearch(marketSlug, value);
      const resolved = resolvedAreaFromSearchPayload(payload);
      if (resolved) {
        choose(resolved);
        return;
      }
      if (payload.resolution.status === "ambiguous" || payload.suggestions.length > 0) {
        setMessage(payload.resolution.status === "ambiguous"
          ? `More than one area is called “${value}”. Choose one.`
          : "Choose a matching area from the list.");
        setIsOpen(true);
        setActiveIndex(0);
        return;
      }
      setIsOpen(false);
      if (onNoMatch) onNoMatch(value);
      else setMessage("We’re not active there yet. Liber covers every city, neighborhood, and ZIP in LA County.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Area search is temporarily unavailable.");
    } finally {
      setIsSubmitting(false);
    }
  }

  function handleKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.nativeEvent.isComposing) return;
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      setIsOpen(true);
      if (options.length === 0) return;
      setActiveIndex((index) => event.key === "ArrowDown"
        ? (index + 1) % options.length
        : (index <= 0 ? options.length : index) - 1);
    } else if (event.key === "Enter") {
      event.preventDefault();
      void submit();
    } else if (event.key === "Escape") {
      if (isOpen) {
        event.preventDefault();
        setIsOpen(false);
        setActiveIndex(-1);
      } else if (query) {
        event.preventDefault();
        updateQuery("");
      }
    } else if (event.key === "Tab" && isOpen && activeIndex >= 0 && options[activeIndex]) {
      choose(options[activeIndex].area);
    }
  }

  const isLoading = search.status === "loading" || isSubmitting;
  const statusText = popoverStatus({ fuzzyOnly, isLoading, message, options, query, search, showRecent });

  return (
    <div
      className={`area-search ${className}`.trim()}
      onBlurCapture={(event) => {
        const next = event.relatedTarget;
        if (!(next instanceof Node) || !event.currentTarget.contains(next)) {
          setIsOpen(false);
          setActiveIndex(-1);
        }
      }}
    >
      <div className="area-search-row">
        <div className="area-search-field">
          <Icon aria-hidden="true" className="area-search-icon" name="search" size={16} />
          <input
            aria-activedescendant={isOpen && activeIndex >= 0 ? `${listId}-${activeIndex}` : undefined}
            aria-autocomplete="list"
            aria-controls={listId}
            aria-describedby={`${id}-status`}
            aria-expanded={isOpen}
            aria-label={ariaLabel}
            autoComplete="off"
            enterKeyHint="search"
            id={id}
            maxLength={80}
            onChange={(event) => updateQuery(event.target.value)}
            onClick={() => setIsOpen(true)}
            onFocus={(event) => {
              setIsOpen(true);
              if (isSelectedText) event.currentTarget.select();
            }}
            onKeyDown={handleKeyDown}
            placeholder={placeholder}
            ref={inputRef}
            role="combobox"
            spellCheck={false}
            type="text"
            value={query}
          />
          {isLoading ? <span aria-hidden="true" className="area-search-spinner" /> : null}
          {query ? (
            <button aria-label={clearLabel} className="area-search-clear" onClick={clear} type="button">
              <span aria-hidden="true">&times;</span>
            </button>
          ) : null}
        </div>
        {submitLabel ? (
          <button className={submitClassName} disabled={isSubmitting} onClick={() => void submit()} type="button">
            {submitLabel}
          </button>
        ) : null}
      </div>

      <div className="area-search-popover" hidden={!isOpen}>
        {statusText ? <p className={`area-search-note${message ? " attention" : ""}`}>{statusText}</p> : null}
        <ul aria-label={showRecent ? "Recent searches" : "Matching areas"} className="area-search-options" id={listId} role="listbox">
          {options.map((option, index) => (
            <li
              aria-selected={index === activeIndex}
              className="area-search-option"
              id={`${listId}-${index}`}
              key={`${option.recent ? "recent" : "match"}:${option.area.slug}`}
              onClick={() => choose(option.area)}
              onMouseDown={(event) => event.preventDefault()}
              onMouseMove={() => {
                if (activeIndex !== index) setActiveIndex(index);
              }}
              role="option"
            >
              <span aria-hidden="true" className={`area-search-option-icon ${option.area.type}`}>
                <Icon name={option.recent ? "clock" : areaIcon(option.area)} size={15} />
              </span>
              <span className="area-search-option-text">
                <strong>
                  {highlightSegments(serviceAreaShortName(option.area), option.recent ? "" : query).map((segment, segmentIndex) =>
                    segment.match ? <mark key={segmentIndex}>{segment.text}</mark> : <span key={segmentIndex}>{segment.text}</span>,
                  )}
                </strong>
                <small>{serviceAreaContextLabel(option.area)}</small>
              </span>
            </li>
          ))}
        </ul>
      </div>
      <span aria-live="polite" className="sr-only" id={`${id}-status`}>
        {isOpen ? liveRegionText(options.length, isLoading, showRecent) : ""}
      </span>
      {message && !isOpen ? <span className="area-search-message" role="status">{message}</span> : null}
    </div>
  );
}

function popoverStatus({
  fuzzyOnly,
  isLoading,
  message,
  options,
  query,
  search,
  showRecent,
}: {
  fuzzyOnly: boolean;
  isLoading: boolean;
  message: string;
  options: Option[];
  query: string;
  search: ReturnType<typeof useServiceAreaSearch>;
  showRecent: boolean;
}) {
  if (message) return message;
  if (showRecent) return options.length > 0 ? "Recent searches" : "Search any city, neighborhood, or ZIP in LA County.";
  if (search.status === "error") return search.errorMessage ?? "Area search is temporarily unavailable.";
  if (options.length === 0) {
    if (isLoading || search.query !== query.trim()) return "Searching areas…";
    return `No LA County areas match “${query.trim()}”. Check the spelling or try a ZIP code.`;
  }
  if (fuzzyOnly) return "Did you mean";
  return "";
}

function liveRegionText(count: number, isLoading: boolean, showRecent: boolean) {
  if (isLoading && count === 0) return "Searching areas";
  if (count === 0) return showRecent ? "" : "No matching areas";
  return `${count} ${showRecent ? "recent" : "matching"} ${count === 1 ? "area" : "areas"}. Use up and down arrows to choose.`;
}

function areaIcon(area: ServiceArea) {
  if (area.type === "zip") return "tag" as const;
  if (area.type === "city") return "compass" as const;
  return "map-pin" as const;
}

function recentKey(marketSlug: string) {
  return `liber:recent-service-areas:${marketSlug}`;
}

function readRecentAreas(marketSlug: string): ServiceArea[] {
  try {
    const value = JSON.parse(window.localStorage.getItem(recentKey(marketSlug)) ?? "[]") as unknown;
    if (!Array.isArray(value)) return [];
    return value.filter(isStoredArea).slice(0, RECENT_LIMIT);
  } catch {
    return [];
  }
}

function rememberRecentArea(marketSlug: string, area: ServiceArea) {
  try {
    const stored: ServiceArea = {
      active: true,
      bbox: area.bbox,
      center: area.center,
      city: area.city,
      county: area.county,
      disclaimer: area.disclaimer,
      geojsonPath: area.geojsonPath,
      isPilot: area.isPilot,
      label: area.label,
      marketSlug,
      postalCode: area.postalCode,
      slug: area.slug,
      source: area.source,
      sourceVersion: area.sourceVersion,
      state: area.state,
      type: area.type,
    };
    const next = [stored, ...readRecentAreas(marketSlug).filter((item) => item.slug !== area.slug)].slice(0, RECENT_LIMIT);
    window.localStorage.setItem(recentKey(marketSlug), JSON.stringify(next));
  } catch {
    // Recent searches are a convenience only.
  }
}

function isStoredArea(value: unknown): value is ServiceArea {
  if (!value || typeof value !== "object") return false;
  const area = value as Partial<ServiceArea>;
  return typeof area.slug === "string"
    && /^[a-z0-9-]+$/.test(area.slug)
    && typeof area.label === "string"
    && (area.type === "city" || area.type === "neighborhood" || area.type === "zip");
}
