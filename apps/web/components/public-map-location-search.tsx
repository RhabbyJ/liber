"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState, type FormEvent } from "react";
import {
  activeServiceAreas,
  findServiceArea,
  serviceAreaDisplayLabel,
  type ServiceArea,
} from "../lib/service-areas";
import { Icon } from "./icon";
import { UnsupportedAreaState } from "./unsupported-area-state";

type Props = {
  defaultArea?: string;
};

type ServiceAreaApiResult = {
  bbox: [number, number, number, number];
  center: [number, number];
  city: string | null;
  county: string | null;
  disclaimer: string;
  geojson_path: string;
  is_pilot: boolean;
  label: string;
  postal_code: string | null;
  slug: string;
  source: string;
  source_version: string;
  state: "CA";
  type: ServiceArea["type"];
};

export function PublicMapLocationSearch({ defaultArea = "" }: Props) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const unsupportedArea = searchParams.get("unsupported") ?? "";
  const [query, setQuery] = useState(unsupportedArea || defaultArea);
  const [message, setMessage] = useState("");
  const [isUnsupported, setIsUnsupported] = useState(Boolean(unsupportedArea));

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

    const localArea = findServiceArea(value);
    if (localArea) {
      pushArea(localArea);
      return;
    }

    try {
      const params = new URLSearchParams({ q: value });
      const response = await fetch(`/api/service-areas/search?${params}`, { cache: "no-store" });
      const results = await response.json() as ServiceAreaApiResult[];
      const result = results[0];

      if (!response.ok || !result) {
        pushUnsupportedArea(value);
        return;
      }

      pushArea(apiResultToServiceArea(result));
    } catch {
      setMessage("Location lookup failed.");
    }
  }

  function pushArea(area: ServiceArea) {
    const nextParams = new URLSearchParams(searchParams.toString());
    nextParams.set("area", area.slug);
    nextParams.delete("unsupported");
    setQuery(serviceAreaDisplayLabel(area));
    setMessage("");
    setIsUnsupported(false);
    router.push(queryPath(nextParams));
  }

  function clearArea() {
    const nextParams = new URLSearchParams(searchParams.toString());
    nextParams.delete("area");
    nextParams.delete("unsupported");
    setQuery("");
    setMessage("");
    setIsUnsupported(false);
    router.push(queryPath(nextParams));
  }

  function pushUnsupportedArea(value: string) {
    const nextParams = new URLSearchParams(searchParams.toString());
    nextParams.delete("area");
    nextParams.set("unsupported", value);
    setQuery(value);
    setMessage("");
    setIsUnsupported(true);
    router.replace(queryPath(nextParams));
  }

  return (
    <div className="map-search-box public-map-search-box">
      <form onSubmit={handleSubmit}>
        <Icon name="search" size={17} />
        <input
          aria-label="Search preview area by city, neighborhood, or ZIP"
          autoComplete="off"
          list="public-map-service-areas"
          onChange={(event) => {
            setQuery(event.target.value);
            setMessage("");
            setIsUnsupported(false);
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
      <datalist id="public-map-service-areas">
        {activeServiceAreas.map((area) => (
          <option key={area.slug} value={serviceAreaDisplayLabel(area)} />
        ))}
      </datalist>
      {message ? <span className="public-map-search-message">{message}</span> : null}
      {isUnsupported ? <UnsupportedAreaState onSearchAnother={clearArea} /> : null}
    </div>
  );
}

function apiResultToServiceArea(result: ServiceAreaApiResult): ServiceArea {
  return {
    active: true,
    bbox: result.bbox,
    center: {
      lat: result.center[1],
      lng: result.center[0],
    },
    city: result.city,
    county: result.county,
    disclaimer: result.disclaimer,
    geojsonPath: result.geojson_path,
    isPilot: result.is_pilot,
    label: result.label,
    postalCode: result.postal_code,
    slug: result.slug,
    source: result.source,
    sourceVersion: result.source_version,
    state: result.state,
    type: result.type,
  };
}

function queryPath(params: URLSearchParams) {
  const query = params.toString();
  return query ? `/?${query}` : "/";
}
