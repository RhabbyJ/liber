"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent, type KeyboardEvent } from "react";
import {
  findServiceArea,
  serviceAreaDisplayLabel,
  type ServiceArea,
} from "../lib/service-areas";
import { Icon } from "./icon";

type Props = {
  defaultAmenities?: string[];
  defaultArea?: string;
  defaultBadges?: string[];
  defaultBathrooms?: string;
  defaultBedrooms?: string;
  defaultBudgetMax?: string | number;
  defaultBudgetMin?: string | number;
  defaultCity?: string;
  defaultCondition?: string;
  defaultServiceArea?: string;
  defaultSort?: string;
  defaultSquareFeet?: string;
  defaultState?: string;
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
  defaultAmenities = [],
  defaultArea = "",
  defaultBadges = [],
  defaultBathrooms = "",
  defaultBedrooms = "",
  defaultBudgetMax = "",
  defaultBudgetMin = "",
  defaultCity = "",
  defaultCondition = "",
  defaultServiceArea = "",
  defaultSort = "recommended",
  defaultSquareFeet = "",
  defaultState = "CA",
}: Props) {
  const router = useRouter();
  const [area, setArea] = useState(defaultArea);
  const [serviceArea, setServiceArea] = useState(defaultServiceArea);
  const [city, setCity] = useState(defaultCity);
  const [state, setState] = useState(defaultState);
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

    const matchedArea = findServiceArea(value);
    if (matchedArea) {
      applyServiceArea(matchedArea);
      return;
    }

    setServiceArea("");
    setCity("");
    setState("CA");
  }

  async function handleLocationLookup() {
    if (!area.trim()) return;
    setLocationMessage("");

    const localArea = findServiceArea(area);
    if (localArea) {
      applyServiceArea(localArea);
      return;
    }

    if (area.trim().length < 3) {
      setLocationMessage("Enter a supported city, neighborhood, or ZIP.");
      return;
    }

    setIsLookingUp(true);
    try {
      const params = new URLSearchParams({ q: area });
      const response = await fetch(`/api/service-areas/search?${params}`, { cache: "no-store" });
      const results = await response.json() as ServiceAreaApiResult[];
      const result = results[0];

      if (!response.ok || !result) {
        setLocationMessage("We're not active there yet.");
        return;
      }

      applyServiceArea(apiResultToServiceArea(result));
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
    setServiceArea("");
    setCity("");
    setState("CA");
    setLocationMessage("");
  }

  function applyServiceArea(matchedArea: ServiceArea) {
    setArea(serviceAreaDisplayLabel(matchedArea));
    setServiceArea(matchedArea.slug);
    setCity(matchedArea.type === "neighborhood" ? matchedArea.label : matchedArea.city ?? matchedArea.label);
    setState(matchedArea.state);
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
    if (serviceArea) nextParams.set("serviceArea", serviceArea);
    if (city) nextParams.set("city", city);
    if (state) nextParams.set("state", state);
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
                placeholder="Search city, neighborhood, or ZIP"
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
