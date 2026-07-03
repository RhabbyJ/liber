"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent, type KeyboardEvent } from "react";
import { findPilotArea } from "../lib/launch-market";
import { Icon } from "./icon";

type Props = {
  defaultArea?: string;
  defaultCity?: string;
  defaultState?: string;
  defaultLat?: string | number;
  defaultLng?: string | number;
  defaultRadiusMiles?: string | number;
  defaultBudgetMin?: string | number;
  defaultBudgetMax?: string | number;
  defaultBadges?: string[];
  defaultSort?: string;
  defaultBedrooms?: string;
  defaultBathrooms?: string;
  defaultSquareFeet?: string;
  defaultCondition?: string;
  defaultAmenities?: string[];
};

const amenityOptions = ["Pool", "Parking", "ADU", "Yard", "Garage"] as const;
const conditionOptions = ["Move-in ready", "Mild fixer", "Fixer"] as const;

const minBudgetOptions = [
  { label: "No min", value: "" },
  { label: "$300k", value: "300000" },
  { label: "$400k", value: "400000" },
  { label: "$500k", value: "500000" },
  { label: "$600k", value: "600000" },
  { label: "$700k", value: "700000" },
  { label: "$800k", value: "800000" },
  { label: "$900k", value: "900000" },
  { label: "$1M", value: "1000000" },
];

const maxBudgetOptions = [
  { label: "No max", value: "" },
  { label: "$500k", value: "500000" },
  { label: "$750k", value: "750000" },
  { label: "$1M", value: "1000000" },
  { label: "$1.2M", value: "1200000" },
  { label: "$1.5M", value: "1500000" },
  { label: "$2M", value: "2000000" },
  { label: "$3M", value: "3000000" },
];

const trustOptions = [
  { label: "Pre-approved", value: "PRE_APPROVED" },
  { label: "Verified funds", value: "VERIFIED_FUNDS" },
  { label: "Cash buyer", value: "CASH_BUYER" },
  { label: "Non-contingent", value: "NON_CONTINGENT" },
];

export function SearchFiltersSidebar({
  defaultArea = "",
  defaultCity = "",
  defaultState = "CA",
  defaultLat = "",
  defaultLng = "",
  defaultRadiusMiles = 8,
  defaultBudgetMin = "",
  defaultBudgetMax = "",
  defaultBadges = [],
  defaultSort = "recommended",
  defaultBedrooms = "",
  defaultBathrooms = "",
  defaultSquareFeet = "",
  defaultCondition = "",
  defaultAmenities = [],
}: Props) {
  const router = useRouter();
  const [area, setArea] = useState(defaultArea);
  const [city, setCity] = useState(defaultCity);
  const [state, setState] = useState(defaultState);
  const [lat, setLat] = useState(String(defaultLat || ""));
  const [lng, setLng] = useState(String(defaultLng || ""));
  const [radiusMiles, setRadiusMiles] = useState(String(defaultRadiusMiles || 8));
  const [locationMessage, setLocationMessage] = useState("");
  const [isLookingUp, setIsLookingUp] = useState(false);
  const [minBudget, setMinBudget] = useState(String(defaultBudgetMin || ""));
  const [maxBudget, setMaxBudget] = useState(String(defaultBudgetMax || ""));
  const [checkedBadges, setCheckedBadges] = useState<string[]>(defaultBadges);
  const [bedrooms, setBedrooms] = useState(defaultBedrooms);
  const [bathrooms, setBathrooms] = useState(defaultBathrooms);
  const [squareFeet, setSquareFeet] = useState(defaultSquareFeet);
  const [condition, setCondition] = useState(defaultCondition);
  const [amenities, setAmenities] = useState<string[]>(defaultAmenities);

  function handleLocationChange(value: string) {
    setArea(value);
    setLocationMessage("");

    const matchedArea = findPilotArea(value);
    if (matchedArea) {
      setCity(matchedArea.city);
      setState(matchedArea.state);
      setLat(String(matchedArea.lat));
      setLng(String(matchedArea.lng));
      setRadiusMiles(String(matchedArea.radiusMiles));
      return;
    }

    setCity("");
    setState("CA");
    setLat("");
    setLng("");
  }

  async function handleLocationLookup() {
    if (!area.trim()) return;
    setLocationMessage("");

    const localArea = findPilotArea(area);
    const nextArea = findPilotArea(area, { includeNext: true });

    if (localArea) {
      setArea(localArea.label);
      setCity(localArea.city);
      setState(localArea.state);
      setLat(String(localArea.lat));
      setLng(String(localArea.lng));
      setRadiusMiles(String(localArea.radiusMiles));
      return;
    }

    if (nextArea) {
      setLocationMessage(`${nextArea.label} is next pilot ZIP, not active yet.`);
      return;
    }

    if (area.trim().length < 3) {
      setLocationMessage("Enter a supported city or ZIP.");
      return;
    }

    setIsLookingUp(true);
    try {
      const params = new URLSearchParams({ intent: "search", kind: "place", query: area });
      const response = await fetch(`/api/geo/geocode?${params}`, { cache: "no-store" });
      const payload = await response.json();
      const result = payload.results?.[0];

      if (!response.ok || !result) {
        setLocationMessage(payload.error || "That area is outside the active pilot.");
        return;
      }

      setArea(result.label);
      setCity(result.city);
      setState(result.state);
      setLat(String(result.lat));
      setLng(String(result.lng));
      setRadiusMiles(String(result.radiusMiles || 8));
      setLocationMessage(`${result.label} verified.`);
    } catch {
      setLocationMessage("Location lookup failed.");
    } finally {
      setIsLookingUp(false);
    }
  }

  function handleLocationKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key !== "Enter") return;
    event.preventDefault();
    void handleLocationLookup();
  }

  function handleClearLocation() {
    setArea("");
    setCity("");
    setState("CA");
    setLat("");
    setLng("");
    setRadiusMiles("8");
    setLocationMessage("");
  }

  function toggleBadge(badge: string) {
    setCheckedBadges((current) =>
      current.includes(badge) ? current.filter((item) => item !== badge) : [...current, badge],
    );
  }

  function toggleAmenity(amenity: string) {
    setAmenities((current) =>
      current.includes(amenity) ? current.filter((item) => item !== amenity) : [...current, amenity],
    );
  }

  function handleClearFilters() {
    router.push(queryPath(new URLSearchParams(defaultSort === "recommended" ? "" : `sort=${defaultSort}`)));
  }

  function handleFormSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const nextParams = new URLSearchParams();
    if (area) nextParams.set("area", area);
    if (city) nextParams.set("city", city);
    if (state) nextParams.set("state", state);
    if (lat.trim() && lng.trim()) {
      nextParams.set("centerLat", lat);
      nextParams.set("centerLng", lng);
      if (radiusMiles) nextParams.set("radiusMiles", radiusMiles);
    }
    if (minBudget) nextParams.set("budgetMin", minBudget);
    if (maxBudget) nextParams.set("budgetMax", maxBudget);
    if (bedrooms) nextParams.set("bedrooms", bedrooms);
    if (bathrooms) nextParams.set("bathrooms", bathrooms);
    if (squareFeet) nextParams.set("squareFeet", squareFeet);
    if (condition) nextParams.set("condition", condition);
    if (defaultSort !== "recommended") nextParams.set("sort", defaultSort);

    amenities.forEach((amenity) => nextParams.append("amenities", amenity));
    checkedBadges.forEach((badge) => nextParams.append("badges", badge));

    router.push(queryPath(nextParams));
  }

  return (
    <aside className="search-sidebar-filters" id="search-filters">
      <form className="filters-form" onSubmit={handleFormSubmit}>
        <div className="filter-section">
          <h4 className="filter-section-title">Location</h4>
          <div className="location-input-container">
            <div className="input-with-clear">
              <Icon name="search" className="search-field-icon" size={15} />
              <input
                autoComplete="off"
                id="search-area-input"
                name="area"
                onBlur={handleLocationLookup}
                onChange={(event) => handleLocationChange(event.target.value)}
                onKeyDown={handleLocationKeyDown}
                placeholder="City, ZIP, or neighborhood"
                type="text"
                value={area}
              />
              {area ? (
                <button
                  aria-label="Clear location input"
                  className="clear-input-btn"
                  onClick={handleClearLocation}
                  type="button"
                >
                  &times;
                </button>
              ) : null}
            </div>
          </div>
          <button className="link-button" disabled={isLookingUp || !area.trim()} onClick={handleLocationLookup} type="button">
            {isLookingUp ? "Checking..." : "Verify area"}
          </button>
          {locationMessage ? <span className="location-message-info">{locationMessage}</span> : null}
        </div>

        <div className="filter-section">
          <h4 className="filter-section-title">Budget</h4>
          <div className="budget-select-row">
            <div className="select-wrapper">
              <select aria-label="Minimum budget" onChange={(event) => setMinBudget(event.target.value)} value={minBudget}>
                {minBudgetOptions.map((option) => (
                  <option key={option.label} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>
            <span className="budget-separator">to</span>
            <div className="select-wrapper">
              <select aria-label="Maximum budget" onChange={(event) => setMaxBudget(event.target.value)} value={maxBudget}>
                {maxBudgetOptions.map((option) => (
                  <option key={option.label} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </div>

        <div className="filter-section">
          <h4 className="filter-section-title">Home fit</h4>
          <div className="form-grid filter-form-grid">
            <div className="select-wrapper">
              <select aria-label="Bedrooms" onChange={(event) => setBedrooms(event.target.value)} value={bedrooms}>
                <option value="">Any beds</option>
                <option value="1">1+ bed</option>
                <option value="2">2+ beds</option>
                <option value="3">3+ beds</option>
                <option value="4">4+ beds</option>
                <option value="5">5+ beds</option>
              </select>
            </div>
            <div className="select-wrapper">
              <select aria-label="Bathrooms" onChange={(event) => setBathrooms(event.target.value)} value={bathrooms}>
                <option value="">Any baths</option>
                <option value="1">1+ bath</option>
                <option value="2">2+ baths</option>
                <option value="3">3+ baths</option>
                <option value="4">4+ baths</option>
              </select>
            </div>
            <div className="select-wrapper">
              <select aria-label="Square feet" onChange={(event) => setSquareFeet(event.target.value)} value={squareFeet}>
                <option value="">Any sqft</option>
                <option value="1000">1,000+ sqft</option>
                <option value="1200">1,200+ sqft</option>
                <option value="1500">1,500+ sqft</option>
                <option value="2000">2,000+ sqft</option>
                <option value="2500">2,500+ sqft</option>
                <option value="3000">3,000+ sqft</option>
              </select>
            </div>
            <div className="select-wrapper">
              <select aria-label="Condition" onChange={(event) => setCondition(event.target.value)} value={condition}>
                <option value="">Any condition</option>
                {conditionOptions.map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <span className="field-hint">Use your property facts to find buyers whose needs fit.</span>
        </div>

        <div className="filter-section">
          <h4 className="filter-section-title">Amenity needs</h4>
          <div className="property-pills-row wrap">
            {amenityOptions.map((amenity) => (
              <button
                className={`pill-btn ${amenities.includes(amenity) ? "active" : "outlined"}`}
                key={amenity}
                onClick={() => toggleAmenity(amenity)}
                type="button"
              >
                {amenity}
              </button>
            ))}
          </div>
        </div>

        <div className="filter-section">
          <h4 className="filter-section-title">Buyer trust</h4>
          <div className="checkboxes-stack">
            {trustOptions.map((option) => (
              <label className="checkbox-container" key={option.value}>
                <input
                  checked={checkedBadges.includes(option.value)}
                  onChange={() => toggleBadge(option.value)}
                  type="checkbox"
                />
                <span className="checkmark" />
                {option.label}
              </label>
            ))}
          </div>
        </div>

        <div className="sidebar-form-actions">
          <button className="button primary update-matches-btn" type="submit">
            <Icon name="search" size={15} />
            Update matches
          </button>
          <button className="clear-filters-link" onClick={handleClearFilters} type="button">
            Clear filters
          </button>
        </div>
      </form>
    </aside>
  );
}

function queryPath(params: URLSearchParams) {
  const query = params.toString();
  return query ? `/seller/search?${query}` : "/seller/search";
}
