"use client";

import { useState } from "react";
import {
  activeServiceAreas,
  findServiceArea,
  serviceAreaDisplayLabel,
  type ServiceArea,
} from "../lib/service-areas";

type Props = {
  cityName: string;
  defaultCity?: string;
  defaultLat?: number | string;
  defaultLng?: number | string;
  defaultLocation?: string;
  defaultNeighborhood?: string;
  defaultPostalCode?: string;
  defaultRadiusMiles?: number | string;
  inputName: string;
  intent: "search" | "store";
  label: string;
  latName: string;
  lngName: string;
  neighborhoodName?: string;
  postalCodeName?: string;
  radiusName?: string;
  stateName: string;
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

export function LocationLookupFields({
  cityName,
  defaultCity = "",
  defaultLat = "",
  defaultLng = "",
  defaultLocation = "",
  defaultNeighborhood = "",
  defaultPostalCode = "",
  defaultRadiusMiles = 4,
  inputName,
  intent: _intent,
  label,
  latName,
  lngName,
  neighborhoodName,
  postalCodeName,
  radiusName,
  stateName,
}: Props) {
  const [query, setQuery] = useState(defaultLocation);
  const [city, setCity] = useState(defaultCity);
  const [state, setState] = useState("CA");
  const [lat, setLat] = useState(String(defaultLat || ""));
  const [lng, setLng] = useState(String(defaultLng || ""));
  const [neighborhood, setNeighborhood] = useState(defaultNeighborhood);
  const [postalCode, setPostalCode] = useState(defaultPostalCode);
  const [radiusMiles, setRadiusMiles] = useState(String(defaultRadiusMiles || 4));
  const [message, setMessage] = useState("");
  const [isLookingUp, setIsLookingUp] = useState(false);
  const activeZipAreas = activeServiceAreas.filter((area) => area.type === "zip" && area.postalCode);

  async function lookup() {
    setMessage("");
    const localArea = findServiceArea(query);

    if (localArea) {
      applyArea(localArea);
      setMessage(`${serviceAreaDisplayLabel(localArea)} is a supported Liber service area.`);
      return;
    }

    if (query.trim().length < 3) {
      setMessage("Enter a supported city, neighborhood, or ZIP before lookup.");
      return;
    }

    setIsLookingUp(true);
    try {
      const params = new URLSearchParams({ q: query });
      const response = await fetch(`/api/service-areas/search?${params}`, { cache: "no-store" });
      const results = await response.json() as ServiceAreaApiResult[];
      const result = results[0];

      if (!response.ok || !result) {
        setMessage("We're not active there yet.");
        return;
      }

      applyArea(apiResultToServiceArea(result));
      setMessage(`${result.label} is a supported Liber service area.`);
    } catch {
      setMessage("Location lookup failed. You can still enter the fields manually.");
    } finally {
      setIsLookingUp(false);
    }
  }

  function handleQueryChange(value: string) {
    setQuery(value);
    setMessage("");

    const area = findServiceArea(value);
    if (area) {
      applyArea(area);
      return;
    }

    setCity("");
    setState("CA");
    setLat("");
    setLng("");
    setNeighborhood("");
    setPostalCode("");
  }

  function applyArea(area: ServiceArea) {
    const nextCity = area.type === "neighborhood" ? area.label : area.city ?? area.label;
    setQuery(serviceAreaDisplayLabel(area));
    setCity(nextCity);
    setState(area.state);
    setLat(String(area.center.lat));
    setLng(String(area.center.lng));
    setNeighborhood(area.type === "neighborhood" ? area.label : "");
    setPostalCode(area.postalCode ?? "");
    setRadiusMiles("4");
  }

  return (
    <>
      <div className="field full">
        <label htmlFor={inputName}>{label}</label>
        <div className="lookup-row">
          <input
            autoComplete="off"
            id={inputName}
            list={`${inputName}-service-areas`}
            name={inputName}
            onChange={(event) => handleQueryChange(event.target.value)}
            placeholder="Search city, neighborhood, or ZIP"
            value={query}
          />
          <button className="button secondary" disabled={isLookingUp} onClick={lookup} type="button">
            {isLookingUp ? "Checking" : "Use area"}
          </button>
        </div>
        <datalist id={`${inputName}-service-areas`}>
          {activeServiceAreas.map((area) => (
            <option key={area.slug} value={serviceAreaDisplayLabel(area)} />
          ))}
        </datalist>
        {message ? <span className="muted small">{message}</span> : null}
      </div>
      <input name={cityName} type="hidden" value={city} />
      <input name={stateName} type="hidden" value={state} />
      <input name={latName} type="hidden" value={lat} />
      <input name={lngName} type="hidden" value={lng} />
      {neighborhoodName ? <input name={neighborhoodName} type="hidden" value={neighborhood} /> : null}
      {postalCodeName ? <input name={postalCodeName} type="hidden" value={postalCode} /> : null}
      {radiusName ? <input name={radiusName} type="hidden" value={radiusMiles} /> : null}
      <div className="field">
        <label>Active pilot ZIPs</label>
        <select
          aria-label="Active pilot ZIP"
          onChange={(event) => {
            const area = activeZipAreas.find((item) => item.postalCode === event.target.value);
            if (area) applyArea(area);
          }}
          value={postalCode}
        >
          <option value="">Select ZIP</option>
          {activeZipAreas.map((area) => (
            <option key={area.slug} value={area.postalCode ?? ""}>{serviceAreaDisplayLabel(area)}</option>
          ))}
        </select>
      </div>
      {radiusName ? (
        <div className="field">
          <label htmlFor={`${inputName}-radius`}>Approximate area miles</label>
          <input
            id={`${inputName}-radius`}
            inputMode="numeric"
            onChange={(event) => setRadiusMiles(event.target.value)}
            value={radiusMiles}
          />
        </div>
      ) : null}
    </>
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
