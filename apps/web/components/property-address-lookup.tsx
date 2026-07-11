"use client";

import { useEffect, useState } from "react";
import { apiResultToServiceArea, type ServiceAreaSearchResponse } from "../lib/service-area-api";
import { serviceAreaDisplayLabel, type ServiceArea } from "../lib/service-areas";

type PropertyDefaults = {
  addressLine1?: string;
  addressLine2?: string;
  bathrooms?: number | string;
  bedrooms?: number | string;
  city?: string;
  lat?: number | string;
  lng?: number | string;
  lotSize?: number | string;
  squareFeet?: number | string;
  state?: string;
  zip?: string;
};

export function PropertyAddressLookup({
  defaults = {},
  marketSlug,
  marketState,
}: {
  defaults?: PropertyDefaults;
  marketSlug: string;
  marketState: string;
}) {
  const [addressLine1, setAddressLine1] = useState(defaults.addressLine1 ?? "");
  const [addressLine2, setAddressLine2] = useState(defaults.addressLine2 ?? "");
  const [city, setCity] = useState(defaults.city ?? "");
  const [state, setState] = useState(defaults.state ?? marketState);
  const [zip, setZip] = useState(defaults.zip ?? "");
  const [lat, setLat] = useState(String(defaults.lat ?? ""));
  const [lng, setLng] = useState(String(defaults.lng ?? ""));
  const [bedrooms, setBedrooms] = useState(String(defaults.bedrooms ?? ""));
  const [bathrooms, setBathrooms] = useState(String(defaults.bathrooms ?? ""));
  const [squareFeet, setSquareFeet] = useState(String(defaults.squareFeet ?? ""));
  const [lotSize, setLotSize] = useState(String(defaults.lotSize ?? ""));
  const [message, setMessage] = useState("");
  const [isLookingUp, setIsLookingUp] = useState(false);
  const [zipSuggestions, setZipSuggestions] = useState<ServiceArea[]>([]);

  useEffect(() => {
    let canceled = false;
    setZipSuggestions([]);

    async function loadZipSuggestions() {
      try {
        const params = new URLSearchParams({ market: marketSlug, q: zip.trim() });
        const response = await fetch(`/api/service-areas/search?${params}`, { cache: "no-store" });
        if (!response.ok) {
          if (!canceled) setZipSuggestions([]);
          return;
        }
        const payload = await response.json() as ServiceAreaSearchResponse;
        const suggestions = payload.suggestions
          .map(apiResultToServiceArea)
          .filter((area) => area.type === "zip" && area.postalCode);
        if (!canceled) setZipSuggestions(suggestions);
      } catch {
        if (!canceled) setZipSuggestions([]);
      }
    }

    void loadZipSuggestions();
    return () => {
      canceled = true;
    };
  }, [marketSlug, zip]);

  async function lookupProperty() {
    setMessage("");

    if (!addressLine1.trim()) {
      setMessage("Enter the street address first.");
      return;
    }

    if (!/^\d{5}$/.test(zip.trim())) {
      setMessage("Enter an active service-area ZIP.");
      return;
    }

    setIsLookingUp(true);
    try {
      const response = await fetch("/api/property/enrich", {
        body: JSON.stringify({ addressLine1, city, market: marketSlug, state, zip }),
        cache: "no-store",
        headers: { "Content-Type": "application/json" },
        method: "POST",
      });
      const payload = await response.json();

      if (!response.ok || !payload.property) {
        setMessage(payload.error || "No property facts were found. You can still save manually.");
        return;
      }

      const property = payload.property;
      setAddressLine1(property.addressLine1 || addressLine1);
      setCity(property.city || city);
      setState(property.state || state);
      setZip(property.zip || zip);
      setLat(property.lat ? String(property.lat) : lat);
      setLng(property.lng ? String(property.lng) : lng);
      setBedrooms(property.bedrooms ? String(property.bedrooms) : bedrooms);
      setBathrooms(property.bathrooms ? String(property.bathrooms) : bathrooms);
      setSquareFeet(property.squareFeet ? String(property.squareFeet) : squareFeet);
      setLotSize(property.lotSize ? String(property.lotSize) : lotSize);
      setMessage("Property facts loaded. Review them before saving.");
    } catch {
      setMessage("Property lookup failed. You can still save manually.");
    } finally {
      setIsLookingUp(false);
    }
  }

  return (
    <>
      <div className="field full">
        <label htmlFor="address">Address</label>
        <div className="lookup-row">
          <input
            id="address"
            name="addressLine1"
            onChange={(event) => setAddressLine1(event.target.value)}
            placeholder="Street address"
            value={addressLine1}
          />
          <button className="button secondary" disabled={isLookingUp} onClick={lookupProperty} type="button">
            {isLookingUp ? "Looking up" : "Autofill facts"}
          </button>
        </div>
        {message ? <span className="muted small">{message}</span> : null}
      </div>
      <div className="field full">
        <label htmlFor="addressLine2">Address line 2</label>
        <input id="addressLine2" name="addressLine2" onChange={(event) => setAddressLine2(event.target.value)} value={addressLine2} />
      </div>
      <div className="field">
        <label htmlFor="city">City</label>
        <input id="city" name="city" onChange={(event) => setCity(event.target.value)} placeholder="Sherman Oaks" value={city} />
      </div>
      <div className="field">
        <label htmlFor="state">State</label>
        <input id="state" name="state" onChange={(event) => setState(event.target.value.toUpperCase())} placeholder={marketState} value={state} />
      </div>
      <div className="field">
        <label htmlFor="zip">Zip</label>
        <input id="zip" list="property-service-area-zips" name="zip" onChange={(event) => setZip(event.target.value)} placeholder="91423" value={zip} />
        <datalist id="property-service-area-zips">
          {zipSuggestions.map((area) => (
            <option key={area.slug} value={area.postalCode ?? ""}>{serviceAreaDisplayLabel(area)}</option>
          ))}
        </datalist>
      </div>
      <input name="lat" type="hidden" value={lat} />
      <input name="lng" type="hidden" value={lng} />
      <div className="field">
        <label htmlFor="beds">Bedrooms</label>
        <input id="beds" name="bedrooms" onChange={(event) => setBedrooms(event.target.value)} placeholder="4" value={bedrooms} />
      </div>
      <div className="field">
        <label htmlFor="baths">Bathrooms</label>
        <input id="baths" name="bathrooms" onChange={(event) => setBathrooms(event.target.value)} placeholder="2" value={bathrooms} />
      </div>
      <div className="field">
        <label htmlFor="area">Square feet</label>
        <input id="area" name="squareFeet" onChange={(event) => setSquareFeet(event.target.value)} placeholder="2140" value={squareFeet} />
      </div>
      <div className="field">
        <label htmlFor="lot">Lot size</label>
        <input id="lot" name="lotSize" onChange={(event) => setLotSize(event.target.value)} placeholder="7200" value={lotSize} />
      </div>
    </>
  );
}
