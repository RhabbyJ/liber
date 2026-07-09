"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState, type FormEvent } from "react";
import {
  serviceAreaDisplayLabel,
  type ServiceArea,
} from "../lib/service-areas";
import {
  hasSearchSuggestions,
  resolvedAreaFromSearchPayload,
  type ServiceAreaSearchResponse,
} from "../lib/service-area-api";
import { Icon } from "./icon";
import { PilotZipSuggestions } from "./pilot-zip-suggestions";
import { UnsupportedAreaState } from "./unsupported-area-state";

type Props = {
  defaultArea?: string;
  marketSlug: string;
};

export function PublicMapLocationSearch({ defaultArea = "", marketSlug }: Props) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const unsupportedArea = searchParams.get("unsupported") ?? "";
  const [query, setQuery] = useState(unsupportedArea || defaultArea);
  const [message, setMessage] = useState("");
  const [isUnsupported, setIsUnsupported] = useState(Boolean(unsupportedArea));
  const [isSuggestionsOpen, setIsSuggestionsOpen] = useState(false);

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

    if (value.length < 3) {
      setMessage("Enter a supported city, neighborhood, or ZIP.");
      return;
    }

    try {
      const params = new URLSearchParams({ market: marketSlug, q: value });
      const response = await fetch(`/api/service-areas/search?${params}`, { cache: "no-store" });
      const payload = await response.json() as ServiceAreaSearchResponse;

      if (!response.ok) {
        pushUnsupportedArea(value);
        return;
      }
      const resolvedArea = resolvedAreaFromSearchPayload(payload);
      if (resolvedArea) {
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
      onKeyDown={(event) => {
        if (event.key === "Escape") setIsSuggestionsOpen(false);
      }}
    >
      <form onSubmit={handleSubmit}>
        <Icon name="search" size={17} />
        <input
          aria-label="Search preview area by city, neighborhood, or ZIP"
          autoComplete="off"
          onClick={() => setIsSuggestionsOpen(true)}
          onChange={(event) => {
            setQuery(event.target.value);
            setMessage("");
            setIsUnsupported(false);
            setIsSuggestionsOpen(true);
          }}
          placeholder="Search city, neighborhood, or ZIP"
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
      {isSuggestionsOpen ? <PilotZipSuggestions marketSlug={marketSlug} onSelect={pushArea} query={query} /> : null}
      {message ? <span className="public-map-search-message">{message}</span> : null}
      {isUnsupported ? <UnsupportedAreaState onSearchAnother={clearArea} /> : null}
    </div>
  );
}

function queryPath(params: URLSearchParams) {
  const query = params.toString();
  return query ? `/?${query}` : "/";
}
