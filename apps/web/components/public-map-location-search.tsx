"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState, type FormEvent } from "react";
import { activePilotAreas, findPilotArea } from "../lib/launch-market";
import { Icon } from "./icon";

type Props = {
  defaultArea?: string;
};

type PreviewArea = {
  city: string;
  label: string;
  lat: number;
  lng: number;
  radiusMiles: number;
  state: "CA";
};

export function PublicMapLocationSearch({ defaultArea = "" }: Props) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [query, setQuery] = useState(defaultArea);
  const [message, setMessage] = useState("");

  useEffect(() => {
    setQuery(defaultArea);
    setMessage("");
  }, [defaultArea]);

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const value = query.trim();
    setMessage("");

    if (value.length < 3) {
      setMessage("Enter an active pilot ZIP or city.");
      return;
    }

    const localArea = findPilotArea(value);
    if (localArea) {
      pushArea(localArea);
      return;
    }

    const nextArea = findPilotArea(value, { includeNext: true });
    if (nextArea) {
      setMessage(`${nextArea.label} is next, not active yet.`);
      return;
    }

    setMessage("Preview is limited to active San Fernando Valley pilot ZIPs.");
  }

  function pushArea(area: PreviewArea) {
    const nextParams = new URLSearchParams(searchParams.toString());
    nextParams.set("area", area.label);
    setQuery(area.label);
    setMessage("");
    router.push(queryPath(nextParams));
  }

  function clearArea() {
    const nextParams = new URLSearchParams(searchParams.toString());
    nextParams.delete("area");
    setQuery("");
    setMessage("");
    router.push(queryPath(nextParams));
  }

  return (
    <div className="map-search-box public-map-search-box">
      <form onSubmit={handleSubmit}>
        <Icon name="search" size={17} />
        <input
          aria-label="Search preview area by ZIP or city"
          autoComplete="off"
          list="public-map-pilot-areas"
          onChange={(event) => {
            setQuery(event.target.value);
            setMessage("");
          }}
          placeholder="Search ZIP or city"
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
      <datalist id="public-map-pilot-areas">
        {activePilotAreas.map((area) => (
          <option key={area.zip} value={area.label} />
        ))}
      </datalist>
      {message ? <span className="public-map-search-message">{message}</span> : null}
    </div>
  );
}

function queryPath(params: URLSearchParams) {
  const query = params.toString();
  return query ? `/?${query}` : "/";
}
