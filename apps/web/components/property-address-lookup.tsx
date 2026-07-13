"use client";

import { useEffect, useRef, useState, type KeyboardEvent } from "react";
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

type LookupPresentation = "intake" | "standard";

export function PropertyAddressLookup({
  defaults = {},
  marketSlug,
  marketState,
  presentation = "standard",
}: {
  defaults?: PropertyDefaults;
  marketSlug: string;
  marketState: string;
  presentation?: LookupPresentation;
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
  const [messageTone, setMessageTone] = useState<"error" | "success" | "">("");
  const [invalidField, setInvalidField] = useState<"address" | "zip" | null>(null);
  const [isLookingUp, setIsLookingUp] = useState(false);
  const [zipSuggestions, setZipSuggestions] = useState<ServiceArea[]>([]);
  const addressInputRef = useRef<HTMLInputElement>(null);
  const detailsHeadingRef = useRef<HTMLHeadingElement>(null);
  const identityRevisionRef = useRef(0);
  const lookupInFlightRef = useRef(false);
  const zipInputRef = useRef<HTMLInputElement>(null);

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

  function focusPropertyDetails() {
    if (presentation !== "intake") return;

    requestAnimationFrame(() => {
      const heading = detailsHeadingRef.current;
      if (!heading) return;
      const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      heading.scrollIntoView({ behavior: reduceMotion ? "auto" : "smooth", block: "start" });
      heading.focus({ preventScroll: true });
    });
  }

  function clearDerivedLocation() {
    identityRevisionRef.current += 1;
    setInvalidField(null);
    setLat("");
    setLng("");
    setMessage("");
    setMessageTone("");
  }

  async function lookupProperty() {
    if (lookupInFlightRef.current) return;

    setMessage("");
    setMessageTone("");
    setInvalidField(null);

    if (!addressLine1.trim()) {
      setInvalidField("address");
      setMessage("Enter the street address first.");
      setMessageTone("error");
      requestAnimationFrame(() => addressInputRef.current?.focus());
      return;
    }

    if (!/^\d{5}$/.test(zip.trim())) {
      setInvalidField("zip");
      setMessage("Enter an active service-area ZIP.");
      setMessageTone("error");
      requestAnimationFrame(() => zipInputRef.current?.focus());
      return;
    }

    lookupInFlightRef.current = true;
    const lookupRevision = identityRevisionRef.current;
    setIsLookingUp(true);
    try {
      const response = await fetch("/api/property/enrich", {
        body: JSON.stringify({ addressLine1, city, market: marketSlug, state, zip }),
        cache: "no-store",
        headers: { "Content-Type": "application/json" },
        method: "POST",
      });
      const payload = await response.json();

      if (lookupRevision !== identityRevisionRef.current) return;

      if (!response.ok || !payload.property) {
        if (response.status === 422) {
          setInvalidField("zip");
          setMessage(payload.error || "Enter an active service-area ZIP.");
          setMessageTone("error");
          requestAnimationFrame(() => zipInputRef.current?.focus());
          return;
        }

        setMessage(payload.error || "We couldn't find details. Add them below.");
        setMessageTone("error");
        focusPropertyDetails();
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
      setMessage("Found it. Review the details below.");
      setMessageTone("success");
      focusPropertyDetails();
    } catch {
      setMessage("We couldn't find details. Add them below.");
      setMessageTone("error");
      focusPropertyDetails();
    } finally {
      lookupInFlightRef.current = false;
      setIsLookingUp(false);
    }
  }

  function handleLookupKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key !== "Enter") return;
    event.preventDefault();
    void lookupProperty();
  }

  const lookupStatus = (
    <span
      aria-live="polite"
      className={`property-lookup-status ${messageTone}`}
      id="property-lookup-status"
    >
      {message}
    </span>
  );

  const zipDatalist = (
    <datalist id="property-service-area-zips">
      {zipSuggestions.map((area) => (
        <option key={area.slug} value={area.postalCode ?? ""}>{serviceAreaDisplayLabel(area)}</option>
      ))}
    </datalist>
  );

  const locationDetails = (
    <>
      <div className="field full">
        <label htmlFor="addressLine2">Address line 2</label>
        <input
          autoComplete="address-line2"
          id="addressLine2"
          maxLength={160}
          name="addressLine2"
          onChange={(event) => setAddressLine2(event.target.value)}
          value={addressLine2}
        />
      </div>
      <div className="field">
        <label htmlFor="city">City</label>
        <input
          autoComplete="address-level2"
          id="city"
          maxLength={80}
          name="city"
          onChange={(event) => {
            setCity(event.target.value);
            clearDerivedLocation();
          }}
          placeholder="Sherman Oaks"
          value={city}
        />
      </div>
      <div className="field">
        <label htmlFor="state">State</label>
        <input
          autoComplete="address-level1"
          id="state"
          maxLength={2}
          name="state"
          onChange={(event) => {
            setState(event.target.value.toUpperCase());
            clearDerivedLocation();
          }}
          placeholder={marketState}
          value={state}
        />
      </div>
    </>
  );

  const propertyFacts = (
    <>
      <input name="lat" type="hidden" value={lat} />
      <input name="lng" type="hidden" value={lng} />
      <div className="field">
        <label htmlFor="beds">Bedrooms</label>
        <input id="beds" inputMode="numeric" name="bedrooms" onChange={(event) => setBedrooms(event.target.value)} placeholder="4" value={bedrooms} />
      </div>
      <div className="field">
        <label htmlFor="baths">Bathrooms</label>
        <input id="baths" inputMode="decimal" name="bathrooms" onChange={(event) => setBathrooms(event.target.value)} placeholder="2" value={bathrooms} />
      </div>
      <div className="field">
        <label htmlFor="area">Square feet</label>
        <input id="area" inputMode="numeric" name="squareFeet" onChange={(event) => setSquareFeet(event.target.value)} placeholder="2140" value={squareFeet} />
      </div>
      <div className="field">
        <label htmlFor="lot">Lot size</label>
        <input id="lot" inputMode="numeric" name="lotSize" onChange={(event) => setLotSize(event.target.value)} placeholder="7200" value={lotSize} />
      </div>
    </>
  );

  if (presentation === "intake") {
    return (
      <>
        <div className="property-intake-composer">
          <div className="property-intake-control property-intake-address-control">
            <label className="visually-hidden" htmlFor="address">Street address</label>
            <input
              aria-describedby="property-lookup-status"
              aria-invalid={invalidField === "address" || undefined}
              autoComplete="address-line1"
              id="address"
              maxLength={160}
              name="addressLine1"
              onChange={(event) => {
                setAddressLine1(event.target.value);
                clearDerivedLocation();
              }}
              onKeyDown={handleLookupKeyDown}
              placeholder="Street address"
              ref={addressInputRef}
              value={addressLine1}
            />
          </div>
          <div className="property-intake-control property-intake-zip-control">
            <label className="visually-hidden" htmlFor="zip">ZIP code</label>
            <input
              aria-describedby="property-lookup-status"
              aria-invalid={invalidField === "zip" || undefined}
              autoComplete="postal-code"
              id="zip"
              inputMode="numeric"
              list="property-service-area-zips"
              maxLength={16}
              name="zip"
              onChange={(event) => {
                setZip(event.target.value);
                clearDerivedLocation();
              }}
              onKeyDown={handleLookupKeyDown}
              placeholder="ZIP code"
              ref={zipInputRef}
              value={zip}
            />
            {zipDatalist}
          </div>
          <button className="property-intake-lookup-button" disabled={isLookingUp} onClick={lookupProperty} type="button">
            {isLookingUp ? "Finding..." : "Find property"}
          </button>
        </div>
        {lookupStatus}
        <p className="property-intake-privacy">Private &mdash; never posted publicly.</p>

        <section className="seller-property-intake-section property-address-details" aria-labelledby="property-address-details-heading">
          <header className="property-intake-section-head">
            <p className="eyebrow">Step 2</p>
            <h2 id="property-address-details-heading" ref={detailsHeadingRef} tabIndex={-1}>Review the details</h2>
            <p>Update anything we missed.</p>
          </header>
          <div className="form-grid">
            {locationDetails}
            {propertyFacts}
          </div>
        </section>
      </>
    );
  }

  return (
    <>
      <div className="field full">
        <label htmlFor="address">Address</label>
        <div className="lookup-row">
          <input
            aria-describedby="property-lookup-status"
            aria-invalid={invalidField === "address" || undefined}
            autoComplete="address-line1"
            id="address"
            maxLength={160}
            name="addressLine1"
            onChange={(event) => {
              setAddressLine1(event.target.value);
              clearDerivedLocation();
            }}
            onKeyDown={handleLookupKeyDown}
            placeholder="Street address"
            ref={addressInputRef}
            value={addressLine1}
          />
          <button className="button secondary" disabled={isLookingUp} onClick={lookupProperty} type="button">
            {isLookingUp ? "Looking up" : "Autofill facts"}
          </button>
        </div>
        {lookupStatus}
      </div>
      {locationDetails}
      <div className="field">
        <label htmlFor="zip">ZIP</label>
        <input
          aria-describedby="property-lookup-status"
          aria-invalid={invalidField === "zip" || undefined}
          autoComplete="postal-code"
          id="zip"
          inputMode="numeric"
          list="property-service-area-zips"
          maxLength={16}
          name="zip"
          onChange={(event) => {
            setZip(event.target.value);
            clearDerivedLocation();
          }}
          placeholder="91423"
          ref={zipInputRef}
          value={zip}
        />
        {zipDatalist}
      </div>
      {propertyFacts}
    </>
  );
}
