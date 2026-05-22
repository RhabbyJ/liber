"use client";

import { useState } from "react";
import { activePilotAreas, findPilotArea, pilotAreas } from "../lib/launch-market";

type Props = {
  cityName: string;
  defaultCity?: string;
  defaultLat?: number | string;
  defaultLng?: number | string;
  defaultLocation?: string;
  defaultRadiusMiles?: number | string;
  inputName: string;
  intent: "search" | "store";
  label: string;
  latName: string;
  lngName: string;
  radiusName?: string;
  stateName: string;
};

export function LocationLookupFields({
  cityName,
  defaultCity = "",
  defaultLat = "",
  defaultLng = "",
  defaultLocation = "",
  defaultRadiusMiles = 8,
  inputName,
  intent,
  label,
  latName,
  lngName,
  radiusName,
  stateName,
}: Props) {
  const [query, setQuery] = useState(defaultLocation);
  const [city, setCity] = useState(defaultCity);
  const [state, setState] = useState("CA");
  const [lat, setLat] = useState(String(defaultLat || ""));
  const [lng, setLng] = useState(String(defaultLng || ""));
  const [radiusMiles, setRadiusMiles] = useState(String(defaultRadiusMiles || 8));
  const [message, setMessage] = useState("");
  const [isLookingUp, setIsLookingUp] = useState(false);
  const selectedZip = activePilotAreas.some((area) => query.includes(area.zip))
    ? query.match(/\d{5}/)?.[0] ?? ""
    : "";

  async function lookup() {
    setMessage("");
    const localArea = findPilotArea(query);
    const nextArea = findPilotArea(query, { includeNext: true });

    if (localArea) {
      applyArea(localArea);
      setMessage(`${localArea.label} is inside the active pilot.`);
      return;
    }

    if (nextArea) {
      setMessage(`${nextArea.label} is marked as a next pilot ZIP, not active yet.`);
      return;
    }

    if (query.trim().length < 3) {
      setMessage("Enter a supported city or ZIP before lookup.");
      return;
    }

    setIsLookingUp(true);
    try {
      const params = new URLSearchParams({ intent, kind: "place", query });
      const response = await fetch(`/api/geo/geocode?${params}`, { cache: "no-store" });
      const payload = await response.json();
      const result = payload.results?.[0];

      if (!response.ok || !result) {
        setMessage(payload.error || "That area is outside the active pilot.");
        return;
      }

      setQuery(result.label);
      setCity(result.city);
      setState(result.state);
      setLat(String(result.lat));
      setLng(String(result.lng));
      setRadiusMiles(String(result.radiusMiles || 8));
      setMessage(`${result.label} is inside the active pilot.`);
    } catch {
      setMessage("Location lookup failed. You can still enter the fields manually.");
    } finally {
      setIsLookingUp(false);
    }
  }

  function handleQueryChange(value: string) {
    setQuery(value);
    setMessage("");

    const area = findPilotArea(value);
    if (area) {
      applyArea(area);
      return;
    }

    setCity("");
    setState("CA");
    setLat("");
    setLng("");
  }

  function applyArea(area: { city: string; label: string; lat: number; lng: number; radiusMiles: number; state: "CA" }) {
    setQuery(area.label);
    setCity(area.city);
    setState(area.state);
    setLat(String(area.lat));
    setLng(String(area.lng));
    setRadiusMiles(String(area.radiusMiles));
  }

  return (
    <>
      <div className="field full">
        <label htmlFor={inputName}>{label}</label>
        <div className="lookup-row">
          <input
            autoComplete="off"
            id={inputName}
            list={`${inputName}-pilot-areas`}
            name={inputName}
            onChange={(event) => handleQueryChange(event.target.value)}
            placeholder="Sherman Oaks 91423"
            value={query}
          />
          <button className="button secondary" disabled={isLookingUp} onClick={lookup} type="button">
            {isLookingUp ? "Checking" : "Use area"}
          </button>
        </div>
        <datalist id={`${inputName}-pilot-areas`}>
          {pilotAreas.map((area) => (
            <option key={area.zip} value={area.label}>
              {area.status === "active" ? "Active pilot" : "Next pilot"}
            </option>
          ))}
        </datalist>
        {message ? <span className="muted small">{message}</span> : null}
      </div>
      <input name={cityName} type="hidden" value={city} />
      <input name={stateName} type="hidden" value={state} />
      <input name={latName} type="hidden" value={lat} />
      <input name={lngName} type="hidden" value={lng} />
      {radiusName ? <input name={radiusName} type="hidden" value={radiusMiles} /> : null}
      <div className="field">
        <label>Active pilot ZIPs</label>
        <select
          aria-label="Active pilot ZIP"
          onChange={(event) => {
            const area = activePilotAreas.find((item) => item.zip === event.target.value);
            if (area) applyArea(area);
          }}
          value={selectedZip}
        >
          <option value="">Select ZIP</option>
          {activePilotAreas.map((area) => (
            <option key={area.zip} value={area.zip}>{area.label}</option>
          ))}
        </select>
      </div>
      {radiusName ? (
        <div className="field">
          <label htmlFor={`${inputName}-radius`}>Radius miles</label>
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
