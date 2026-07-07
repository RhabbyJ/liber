"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState, type FormEvent } from "react";
import { activePilotAreas, findPilotArea } from "../lib/launch-market";
import { Icon } from "./icon";

type Props = {
  defaultArea?: string;
};

type SearchArea = {
  city: string;
  label: string;
  lat: number;
  lng: number;
  radiusMiles: number;
  state: "CA";
};

export function SellerMapLocationSearch({ defaultArea = "" }: Props) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [query, setQuery] = useState(defaultArea);
  const [message, setMessage] = useState("");
  const [isLookingUp, setIsLookingUp] = useState(false);

  useEffect(() => {
    setQuery(defaultArea);
    setMessage("");
  }, [defaultArea]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const value = query.trim();
    setMessage("");

    if (value.length < 3) {
      setMessage("Enter a supported city or ZIP.");
      return;
    }

    const localArea = findPilotArea(value);
    if (localArea) {
      pushArea(localArea);
      return;
    }

    const nextArea = findPilotArea(value, { includeNext: true });
    if (nextArea) {
      setMessage(`${nextArea.label} is next pilot ZIP, not active yet.`);
      return;
    }

    setIsLookingUp(true);
    try {
      const params = new URLSearchParams({ intent: "search", kind: "place", query: value });
      const response = await fetch(`/api/geo/geocode?${params}`, { cache: "no-store" });
      const payload = await response.json();
      const result = payload.results?.[0] as SearchArea | undefined;

      if (!response.ok || !result) {
        setMessage(payload.error || "That area is outside the active pilot.");
        return;
      }

      pushArea(result);
    } catch {
      setMessage("Location lookup failed.");
    } finally {
      setIsLookingUp(false);
    }
  }

  function pushArea(area: SearchArea) {
    const nextParams = new URLSearchParams(searchParams.toString());
    nextParams.set("area", area.label);
    nextParams.set("city", area.city);
    nextParams.set("state", area.state);
    nextParams.set("centerLat", String(area.lat));
    nextParams.set("centerLng", String(area.lng));
    nextParams.set("radiusMiles", String(area.radiusMiles || 8));
    setQuery(area.label);
    setMessage("");
    router.push(queryPath(nextParams));
  }

  function clearArea() {
    const nextParams = new URLSearchParams(searchParams.toString());
    nextParams.delete("area");
    nextParams.delete("city");
    nextParams.delete("state");
    nextParams.delete("centerLat");
    nextParams.delete("centerLng");
    nextParams.delete("radiusMiles");
    setQuery("");
    setMessage("");
    router.push(queryPath(nextParams));
  }

  return (
    <div className="seller-map-search" aria-label="Search buyer demand by ZIP">
      <form onSubmit={handleSubmit}>
        <div className="seller-map-search-field">
          <Icon name="search" size={15} />
          <input
            autoComplete="off"
            list="seller-map-pilot-areas"
            onChange={(event) => {
              setQuery(event.target.value);
              setMessage("");
            }}
            placeholder="Enter ZIP or city"
            value={query}
          />
          {query ? (
            <button aria-label="Clear location" className="seller-map-search-clear" onClick={clearArea} type="button">
              &times;
            </button>
          ) : null}
        </div>
        <button className="button primary" disabled={isLookingUp || query.trim().length < 3} type="submit">
          {isLookingUp ? "Checking" : "Search"}
        </button>
      </form>
      <datalist id="seller-map-pilot-areas">
        {activePilotAreas.map((area) => (
          <option key={area.zip} value={area.label} />
        ))}
      </datalist>
      {message ? <span className="seller-map-search-message">{message}</span> : null}
    </div>
  );
}

function queryPath(params: URLSearchParams) {
  const query = params.toString();
  return query ? `/seller/search?${query}` : "/seller/search";
}
