"use client";

import { useState } from "react";
import { activePilotAreas, isActivePilotZip, supportedZipText } from "../lib/launch-market";

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

export function PropertyAddressLookup({ defaults = {} }: { defaults?: PropertyDefaults }) {
  const [addressLine1, setAddressLine1] = useState(defaults.addressLine1 ?? "");
  const [addressLine2, setAddressLine2] = useState(defaults.addressLine2 ?? "");
  const [city, setCity] = useState(defaults.city ?? "");
  const [state, setState] = useState(defaults.state ?? "CA");
  const [zip, setZip] = useState(defaults.zip ?? "");
  const [lat, setLat] = useState(String(defaults.lat ?? ""));
  const [lng, setLng] = useState(String(defaults.lng ?? ""));
  const [bedrooms, setBedrooms] = useState(String(defaults.bedrooms ?? ""));
  const [bathrooms, setBathrooms] = useState(String(defaults.bathrooms ?? ""));
  const [squareFeet, setSquareFeet] = useState(String(defaults.squareFeet ?? ""));
  const [lotSize, setLotSize] = useState(String(defaults.lotSize ?? ""));
  const [message, setMessage] = useState("");
  const [isLookingUp, setIsLookingUp] = useState(false);

  async function lookupProperty() {
    setMessage("");

    if (!addressLine1.trim()) {
      setMessage("Enter the street address first.");
      return;
    }

    if (!isActivePilotZip(zip)) {
      setMessage(`Property lookup is limited to active pilot ZIPs: ${supportedZipText()}.`);
      return;
    }

    setIsLookingUp(true);
    try {
      const params = new URLSearchParams({ addressLine1, city, state, zip });
      const response = await fetch(`/api/property/enrich?${params}`, { cache: "no-store" });
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
        <input id="state" name="state" onChange={(event) => setState(event.target.value.toUpperCase())} placeholder="CA" value={state} />
      </div>
      <div className="field">
        <label htmlFor="zip">Zip</label>
        <input id="zip" list="property-pilot-zips" name="zip" onChange={(event) => setZip(event.target.value)} placeholder="91423" value={zip} />
        <datalist id="property-pilot-zips">
          {activePilotAreas.map((area) => (
            <option key={area.zip} value={area.zip}>{area.label}</option>
          ))}
        </datalist>
      </div>
      <div className="field">
        <label htmlFor="lat">Latitude</label>
        <input id="lat" name="lat" onChange={(event) => setLat(event.target.value)} placeholder="34.148" value={lat} />
      </div>
      <div className="field">
        <label htmlFor="lng">Longitude</label>
        <input id="lng" name="lng" onChange={(event) => setLng(event.target.value)} placeholder="-118.432" value={lng} />
      </div>
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
