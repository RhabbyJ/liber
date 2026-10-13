"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState, type FormEvent } from "react";
import {
  serviceAreaDisplayLabel,
  type ServiceArea,
} from "../lib/service-areas";
import {
  hasSearchSuggestions,
  resolvedAreaFromSearchPayload,
} from "../lib/service-area-api";
import { fetchServiceAreaSearch, rememberRecentServiceArea } from "../lib/service-area-search-client";
import { Icon } from "./icon";
import { useServiceAreaCombobox } from "./service-area-combobox";
import { UnsupportedAreaState } from "./unsupported-area-state";

type Props = {
  defaultArea?: string;
  marketLabel?: string;
  marketSlug: string;
};

export function PublicMapLocationSearch({ defaultArea = "", marketLabel, marketSlug }: Props) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const unsupportedArea = searchParams.get("unsupported") ?? "";
  const [query, setQuery] = useState(unsupportedArea || defaultArea);
  const [message, setMessage] = useState("");
  const [isUnsupported, setIsUnsupported] = useState(Boolean(unsupportedArea));
  const [isSuggestionsOpen, setIsSuggestionsOpen] = useState(false);
  const previousMarketRef = useRef(marketSlug);
  const combobox = useServiceAreaCombobox({
    isOpen: isSuggestionsOpen,
    marketLabel,
    marketSlug,
    notice: message,
    onChooseMarket: clearArea,
    onOpenChange: setIsSuggestionsOpen,
    onSelect: pushArea,
    query,
  });

  useEffect(() => {
    if (previousMarketRef.current === marketSlug) return;
    previousMarketRef.current = marketSlug;
    setQuery("");
    setMessage("");
    setIsUnsupported(false);
    setIsSuggestionsOpen(false);
  }, [marketSlug]);

  useEffect(() => {
    if (unsupportedArea) {
      setQuery(unsupportedArea);
      setMessage("");
      setIsUnsupported(true);
      return;
    }

    setQuery(defaultArea);
    setMessage("");
    setIsUnsupported(false);
    setIsSuggestionsOpen(false);
  }, [defaultArea, unsupportedArea]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const value = query.trim();
    setMessage("");
    setIsUnsupported(false);

    if (value.length < 2) {
      setMessage("Enter a supported city, neighborhood, or ZIP.");
      return;
    }

    try {
      const payload = await fetchServiceAreaSearch(marketSlug, value);
      const resolvedArea = resolvedAreaFromSearchPayload(payload);
      if (resolvedArea) {
        rememberRecentServiceArea(marketSlug, resolvedArea);
        pushArea(resolvedArea);
        return;
      }
      if (hasSearchSuggestions(payload)) {
        setMessage("Choose a specific supported city, neighborhood, or ZIP.");
        setIsSuggestionsOpen(true);
        return;
      }

      pushUnsupportedArea(value);
    } catch {
      setMessage("Location lookup failed.");
    }
  }

  function pushArea(area: ServiceArea) {
    const nextParams = new URLSearchParams(searchParams.toString());
    nextParams.set("market", marketSlug);
    nextParams.set("area", area.slug);
    nextParams.delete("unsupported");
    setQuery(serviceAreaDisplayLabel(area));
    setMessage("");
    setIsUnsupported(false);
    setIsSuggestionsOpen(false);
    router.push(queryPath(nextParams));
  }

  function clearArea() {
    const nextParams = new URLSearchParams(searchParams.toString());
    nextParams.set("market", marketSlug);
    nextParams.delete("area");
    nextParams.delete("unsupported");
    setQuery("");
    setMessage("");
    setIsUnsupported(false);
    setIsSuggestionsOpen(false);
    router.push(queryPath(nextParams));
  }

  function pushUnsupportedArea(value: string) {
    const nextParams = new URLSearchParams(searchParams.toString());
    nextParams.set("market", marketSlug);
    nextParams.delete("area");
    nextParams.set("unsupported", value);
    setQuery(value);
    setMessage("");
    setIsUnsupported(true);
    setIsSuggestionsOpen(false);
    router.replace(queryPath(nextParams));
  }

  return (
    <div
      className="map-search-box public-map-search-box"
      onBlurCapture={(event) => {
        const nextTarget = event.relatedTarget;
        if (!(nextTarget instanceof Node) || !event.currentTarget.contains(nextTarget)) {
          setIsSuggestionsOpen(false);
        }
      }}
      onFocusCapture={() => setIsSuggestionsOpen(true)}
    >
      <form onSubmit={handleSubmit} role="search">
        <Icon name="search" size={17} />
        <input
          {...combobox.inputProps}
          aria-label="Search preview area by city, neighborhood, or ZIP"
          onClick={() => setIsSuggestionsOpen(true)}
          onChange={(event) => {
            setQuery(event.target.value);
            setMessage("");
            setIsUnsupported(false);
            setIsSuggestionsOpen(true);
          }}
          placeholder="City, neighborhood, or ZIP"
          value={query}
        />
        {query ? (
          <button aria-label="Clear preview area" className="public-map-search-clear" onClick={clearArea} type="button">
            &times;
          </button>
        ) : null}
        <button className="public-map-search-submit" type="submit">
          Search
        </button>
      </form>
      {combobox.listbox}
      {message && !isSuggestionsOpen ? <span className="public-map-search-message" role="status">{message}</span> : null}
      {isUnsupported ? <UnsupportedAreaState onSearchAnother={clearArea} /> : null}
    </div>
  );
}

function queryPath(params: URLSearchParams) {
  const query = params.toString();
  return query ? `/?${query}` : "/";
}
