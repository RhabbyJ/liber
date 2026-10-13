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
} from "../lib/service-area-api";
import { fetchServiceAreaSearch, rememberRecentServiceArea } from "../lib/service-area-search-client";
import { Icon } from "./icon";
import { useServiceAreaCombobox } from "./service-area-combobox";

type Props = {
  defaultArea?: string;
  defaultServiceArea?: string;
  marketLabel?: string;
  marketSlug: string;
};

export function SellerMapLocationSearch({ defaultArea = "", defaultServiceArea = "", marketLabel, marketSlug }: Props) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [query, setQuery] = useState(defaultArea);
  const [message, setMessage] = useState("");
  const [isLookingUp, setIsLookingUp] = useState(false);
  const [isSuggestionsOpen, setIsSuggestionsOpen] = useState(false);
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
    setQuery(defaultArea);
    setMessage("");
    setIsLookingUp(false);
    setIsSuggestionsOpen(false);
  }, [defaultArea, defaultServiceArea, marketSlug]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const value = query.trim();
    setMessage("");
    setIsSuggestionsOpen(false);

    if (value.length < 2) {
      setMessage("Enter a supported city, neighborhood, or ZIP.");
      return;
    }

    setIsLookingUp(true);
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

      setMessage("We're not active there yet.");
    } catch {
      setMessage("Location lookup failed.");
    } finally {
      setIsLookingUp(false);
    }
  }

  function pushArea(area: ServiceArea) {
    const nextParams = new URLSearchParams(searchParams.toString());
    nextParams.set("market", marketSlug);
    nextParams.set("serviceArea", area.slug);
    nextParams.delete("cursor");
    removeLegacyGeographyParams(nextParams);
    setQuery(serviceAreaDisplayLabel(area));
    setMessage("");
    setIsSuggestionsOpen(false);
    router.push(queryPath(nextParams));
  }

  function clearArea() {
    const nextParams = new URLSearchParams(searchParams.toString());
    nextParams.set("market", marketSlug);
    nextParams.delete("serviceArea");
    nextParams.delete("cursor");
    removeLegacyGeographyParams(nextParams);
    setQuery("");
    setMessage("");
    setIsSuggestionsOpen(false);
    router.push(queryPath(nextParams));
  }

  return (
    <div
      className="seller-map-search"
      onBlurCapture={(event) => {
        const nextTarget = event.relatedTarget;
        if (!(nextTarget instanceof Node) || !event.currentTarget.contains(nextTarget)) {
          setIsSuggestionsOpen(false);
        }
      }}
      onFocusCapture={() => setIsSuggestionsOpen(true)}
    >
      <form onSubmit={handleSubmit} role="search">
        <div className="seller-map-search-field">
          <Icon name="search" size={15} />
          <input
            {...combobox.inputProps}
            aria-label="Search buyer demand by city, neighborhood, or ZIP"
            onClick={() => setIsSuggestionsOpen(true)}
            onChange={(event) => {
              setQuery(event.target.value);
              setMessage("");
              setIsSuggestionsOpen(true);
            }}
            placeholder="City, neighborhood, or ZIP"
            value={query}
          />
          {query ? (
            <button aria-label="Clear location" className="seller-map-search-clear" onClick={clearArea} type="button">
              &times;
            </button>
          ) : null}
        </div>
        <button className="button primary" disabled={isLookingUp || query.trim().length < 2} type="submit">
          {isLookingUp ? "Checking" : "Search"}
        </button>
      </form>
      {combobox.listbox}
      {message && !isSuggestionsOpen ? <span className="seller-map-search-message" role="status">{message}</span> : null}
    </div>
  );
}

function queryPath(params: URLSearchParams) {
  const query = params.toString();
  return query ? `/seller/search?${query}` : "/seller/search";
}

function removeLegacyGeographyParams(params: URLSearchParams) {
  for (const key of ["area", "centerLat", "centerLng", "city", "radiusMiles", "state"]) {
    params.delete(key);
  }
}
