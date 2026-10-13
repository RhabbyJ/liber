"use client";

import { useEffect, useId, useState, type KeyboardEvent, type ReactNode } from "react";
import { apiResultToServiceArea } from "../lib/service-area-api";
import {
  highlightSegments,
  readRecentServiceAreas,
  rememberRecentServiceArea,
  serviceAreaOptionText,
  useServiceAreaSearch,
} from "../lib/service-area-search-client";
import { normalizeServiceAreaSearchTerm, type ServiceArea } from "../lib/service-areas";

type Option =
  | { area: ServiceArea; key: string; kind: "area" }
  | { key: string; kind: "market"; label: string };

type Args = {
  /** Restrict suggestions, e.g. to ZIP areas for a property ZIP field. */
  filter?: (area: ServiceArea) => boolean;
  isOpen: boolean;
  /** With `onChooseMarket`, offers "All of <market>" for whole-market views. */
  marketLabel?: string;
  marketSlug: string;
  /** Caller guidance shown at the top of the open panel, e.g. after an ambiguous submit. */
  notice?: string;
  onChooseMarket?: () => void;
  onOpenChange: (open: boolean) => void;
  onSelect: (area: ServiceArea) => void;
  query: string;
};

/**
 * WAI-ARIA combobox behavior for service-area search: spread `inputProps` on the text input and
 * render `listbox` below it. Choosing a suggestion selects that exact canonical area; typed text
 * still resolves only through the caller's submit path.
 */
export function useServiceAreaCombobox({
  filter,
  isOpen,
  marketLabel,
  marketSlug,
  notice = "",
  onChooseMarket,
  onOpenChange,
  onSelect,
  query,
}: Args) {
  const id = useId();
  const listboxId = `${id}-listbox`;
  const normalized = normalizeServiceAreaSearchTerm(query);
  const search = useServiceAreaSearch(marketSlug, query, { enabled: isOpen });
  const [recents, setRecents] = useState<ServiceArea[]>([]);

  useEffect(() => {
    if (isOpen) setRecents(readRecentServiceAreas(marketSlug));
  }, [isOpen, marketSlug]);

  const keep = filter ?? (() => true);
  const suggestions = normalized && search.payload
    ? search.payload.suggestions.map(apiResultToServiceArea).filter(keep)
    : [];
  const shownRecents = normalized ? [] : recents.filter(keep);
  const offerMarket = Boolean(marketLabel && onChooseMarket) && (!normalized || matchesMarket(normalized, marketLabel!));
  const options: Option[] = [
    ...(normalized ? suggestions : shownRecents).map((area) => ({ area, key: area.slug, kind: "area" as const })),
    ...(offerMarket ? [{ key: "market", kind: "market" as const, label: `All of ${marketLabel}` }] : []),
  ];

  const optionsKey = options.map((option) => option.key).join("|");
  const [active, setActive] = useState({ index: -1, key: "" });
  const activeIndex = active.key === optionsKey ? active.index : -1;
  const setActiveIndex = (index: number) => setActive({ index, key: optionsKey });

  let status = "";
  if (normalized && search.status === "loading" && options.length === 0) status = "Searching…";
  if (normalized && search.status === "ready" && search.query === normalized && suggestions.length === 0) {
    status = `No matching city, neighborhood, or ZIP${marketLabel ? ` in ${marketLabel}` : ""}.`;
  }
  if (normalized && search.status === "error") status = "Location search is unavailable. Try again.";

  const panelOpen = isOpen && (options.length > 0 || Boolean(status) || Boolean(notice));

  function choose(option: Option) {
    onOpenChange(false);
    if (option.kind === "market") {
      onChooseMarket?.();
      return;
    }
    rememberRecentServiceArea(marketSlug, option.area);
    onSelect(option.area);
  }

  function onKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      if (!isOpen) {
        onOpenChange(true);
        return;
      }
      if (options.length === 0) return;
      if (event.key === "ArrowDown") setActiveIndex(activeIndex + 1 >= options.length ? 0 : activeIndex + 1);
      else setActiveIndex(activeIndex <= 0 ? options.length - 1 : activeIndex - 1);
    } else if (event.key === "Enter") {
      if (panelOpen && activeIndex >= 0 && options[activeIndex]) {
        event.preventDefault();
        choose(options[activeIndex]);
      }
    } else if (event.key === "Escape") {
      if (panelOpen) {
        event.preventDefault();
        onOpenChange(false);
      }
    } else if (event.key === "Tab") {
      onOpenChange(false);
    }
  }

  const inputProps = {
    "aria-activedescendant": panelOpen && activeIndex >= 0 ? `${listboxId}-${activeIndex}` : undefined,
    "aria-autocomplete": "list" as const,
    "aria-controls": listboxId,
    "aria-expanded": panelOpen && options.length > 0,
    autoComplete: "off",
    onKeyDown,
    role: "combobox" as const,
    spellCheck: false,
  };

  const listbox: ReactNode = panelOpen ? (
    <div className="service-area-suggestions" onMouseDown={(event) => event.preventDefault()}>
      {notice ? <p className="service-area-suggestions-notice" role="status">{notice}</p> : null}
      {!normalized && shownRecents.length > 0 ? (
        <div className="service-area-suggestions-head" id={`${id}-recent`}>Recent searches</div>
      ) : null}
      {options.length > 0 ? (
        <ul
          aria-label={normalized ? "Location suggestions" : "Recent locations"}
          className="service-area-options"
          id={listboxId}
          role="listbox"
        >
          {options.map((option, index) => {
            const text = option.kind === "area"
              ? serviceAreaOptionText(option.area)
              : { primary: option.label, secondary: "Show the whole market" };
            const kind = option.kind === "market" ? "market" : normalized ? option.area.type : "recent";
            return (
              <li
                aria-selected={index === activeIndex}
                className={`service-area-option${index === activeIndex ? " active" : ""}`}
                data-kind={kind}
                id={`${listboxId}-${index}`}
                key={option.key}
                onClick={() => choose(option)}
                onMouseMove={() => {
                  if (index !== activeIndex) setActiveIndex(index);
                }}
                role="option"
              >
                <span aria-hidden="true" className="service-area-option-icon" />
                <span className="service-area-option-text">
                  <span className="service-area-option-primary">
                    {highlightSegments(text.primary, option.kind === "area" ? query : "").map((segment, segmentIndex) => (
                      segment.match ? <mark key={segmentIndex}>{segment.text}</mark> : <span key={segmentIndex}>{segment.text}</span>
                    ))}
                  </span>
                  <span className="service-area-option-secondary">{text.secondary}</span>
                </span>
              </li>
            );
          })}
        </ul>
      ) : null}
      {status ? <p className="service-area-suggestions-status">{status}</p> : null}
      <span aria-live="polite" className="visually-hidden">
        {normalized && search.status === "ready" ? `${suggestions.length} suggestion${suggestions.length === 1 ? "" : "s"}` : ""}
      </span>
    </div>
  ) : null;

  return { inputProps, listbox };
}

function matchesMarket(normalized: string, marketLabel: string) {
  const label = normalizeServiceAreaSearchTerm(marketLabel);
  if (normalized.length < 2) return false;
  if (normalized.includes("county") && label.includes("county")) return true;
  const phrases = [label, `all of ${label}`];
  const initials = label.replace(/ county$/, "").split(" ").map((word) => word[0]).join("");
  if (label.endsWith(" county") && initials.length > 1) phrases.push(`${initials} county`);
  return phrases.some((phrase) => phrase.startsWith(normalized));
}
