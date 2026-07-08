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

type Props = {
  defaultArea?: string;
  defaultServiceArea?: string;
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

export function SellerMapLocationSearch({ defaultArea = "", defaultServiceArea = "" }: Props) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [query, setQuery] = useState(defaultArea);
  const [message, setMessage] = useState("");
  const [isLookingUp, setIsLookingUp] = useState(false);

  useEffect(() => {
    setQuery(defaultArea);
    setMessage("");
  }, [defaultArea, defaultServiceArea]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const value = query.trim();
    setMessage("");

    if (value.length < 3) {
      setMessage("Enter a supported city, neighborhood, or ZIP.");
      return;
    }

    const localArea = findServiceArea(value);
    if (localArea) {
      pushArea(localArea);
      return;
    }

    setIsLookingUp(true);
    try {
      const params = new URLSearchParams({ q: value });
      const response = await fetch(`/api/service-areas/search?${params}`, { cache: "no-store" });
      const results = await response.json() as ServiceAreaApiResult[];
      const result = results[0];

      if (!response.ok || !result) {
        setMessage("We're not active there yet.");
        return;
      }

      pushArea(apiResultToServiceArea(result));
    } catch {
      setMessage("Location lookup failed.");
    } finally {
      setIsLookingUp(false);
    }
  }

  function pushArea(area: ServiceArea) {
    const nextParams = new URLSearchParams(searchParams.toString());
    nextParams.set("area", serviceAreaDisplayLabel(area));
    nextParams.set("serviceArea", area.slug);
    nextParams.set("city", area.type === "neighborhood" ? area.label : area.city ?? area.label);
    nextParams.set("state", area.state);
    nextParams.delete("centerLat");
    nextParams.delete("centerLng");
    nextParams.delete("radiusMiles");
    setQuery(serviceAreaDisplayLabel(area));
    setMessage("");
    router.push(queryPath(nextParams));
  }

  function clearArea() {
    const nextParams = new URLSearchParams(searchParams.toString());
    nextParams.delete("area");
    nextParams.delete("serviceArea");
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
    <div className="seller-map-search" aria-label="Search buyer demand by city, neighborhood, or ZIP">
      <form onSubmit={handleSubmit}>
        <div className="seller-map-search-field">
          <Icon name="search" size={15} />
          <input
            autoComplete="off"
            list="seller-map-service-areas"
            onChange={(event) => {
              setQuery(event.target.value);
              setMessage("");
            }}
            placeholder="Search city, neighborhood, or ZIP"
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
      <datalist id="seller-map-service-areas">
        {activeServiceAreas.map((area) => (
          <option key={area.slug} value={serviceAreaDisplayLabel(area)} />
        ))}
      </datalist>
      {message ? <span className="seller-map-search-message">{message}</span> : null}
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
  return query ? `/seller/search?${query}` : "/seller/search";
}
