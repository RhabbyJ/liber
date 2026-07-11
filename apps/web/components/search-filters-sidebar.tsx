"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent, type KeyboardEvent } from "react";
import {
  serviceAreaDisplayLabel,
  type ServiceArea,
} from "../lib/service-areas";
import {
  hasSearchSuggestions,
  resolvedAreaFromSearchPayload,
  type ServiceAreaSearchResponse,
} from "../lib/service-area-api";
import { propertyTypeOptions } from "../lib/property-types";
import { Icon } from "./icon";

type Props = {
  defaultAmenities?: string[];
  defaultArea?: string;
  defaultBadges?: string[];
  defaultBathrooms?: string;
  defaultBedrooms?: string;
  defaultBudgetMax?: string | number;
  defaultBudgetMin?: string | number;
  defaultCondition?: string;
  defaultPropertySubtype?: string;
  defaultServiceArea?: string;
  defaultSort?: string;
  defaultSquareFeet?: string;
  marketSlug: string;
};

const amenityOptions = ["Pool", "Parking", "ADU", "Yard", "Garage"] as const;
const conditionOptions = ["Move-in ready", "Mild fixer", "Fixer"] as const;

const trustOptions = [
  { label: "Pre-approved", value: "PRE_APPROVED" },
  { label: "Verified funds", value: "VERIFIED_FUNDS" },
  { label: "Cash buyer", value: "CASH_BUYER" },
];

export function SearchFiltersSidebar({
  defaultAmenities = [],
  defaultArea = "",
  defaultBadges = [],
  defaultBathrooms = "",
  defaultBedrooms = "",
  defaultBudgetMax = "",
  defaultBudgetMin = "",
  defaultCondition = "",
  defaultPropertySubtype = "",
  defaultServiceArea = "",
  defaultSort = "recommended",
  defaultSquareFeet = "",
  marketSlug,
}: Props) {
  const router = useRouter();
  const [area, setArea] = useState(defaultArea);
  const [serviceArea, setServiceArea] = useState(defaultServiceArea);
  const [locationMessage, setLocationMessage] = useState("");
  const [isLookingUp, setIsLookingUp] = useState(false);
  const [minBudget, setMinBudget] = useState(String(defaultBudgetMin || ""));
  const [maxBudget, setMaxBudget] = useState(String(defaultBudgetMax || ""));
  const [checkedBadges, setCheckedBadges] = useState<string[]>(defaultBadges);
  const [bedrooms, setBedrooms] = useState(defaultBedrooms);
  const [bathrooms, setBathrooms] = useState(defaultBathrooms);
  const [squareFeet, setSquareFeet] = useState(defaultSquareFeet);
  const [condition, setCondition] = useState(defaultCondition);
  const [propertySubtype, setPropertySubtype] = useState(defaultPropertySubtype);
  const [amenities, setAmenities] = useState<string[]>(defaultAmenities);

  function handleLocationChange(value: string) {
    setArea(value);
    setLocationMessage("");

    setServiceArea("");
  }

  async function handleLocationLookup() {
    if (!area.trim()) return;
    setLocationMessage("");

    if (area.trim().length < 3) {
      setLocationMessage("Enter a supported city, neighborhood, or ZIP.");
      return;
    }

    setIsLookingUp(true);
    try {
      const params = new URLSearchParams({ market: marketSlug, q: area });
      const response = await fetch(`/api/service-areas/search?${params}`, { cache: "no-store" });
      const payload = await response.json() as ServiceAreaSearchResponse;

      if (!response.ok) {
        setLocationMessage("We're not active there yet.");
        return;
      }
      const resolvedArea = resolvedAreaFromSearchPayload(payload);
      if (resolvedArea) {
        applyServiceArea(resolvedArea);
        setLocationMessage(`${resolvedArea.label} verified.`);
        return;
      }
      if (hasSearchSuggestions(payload)) {
        setLocationMessage("Choose a specific supported city, neighborhood, or ZIP.");
        return;
      }

      setLocationMessage("We're not active there yet.");
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
    setLocationMessage("");
  }

  function applyServiceArea(matchedArea: ServiceArea) {
    setArea(serviceAreaDisplayLabel(matchedArea));
    setServiceArea(matchedArea.slug);
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
    const nextParams = new URLSearchParams({ market: marketSlug });
    if (defaultSort !== "recommended") nextParams.set("sort", defaultSort);
    router.push(queryPath(nextParams));
  }

  function handleFormSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const nextParams = new URLSearchParams({ market: marketSlug });
    if (serviceArea) {
      nextParams.set("serviceArea", serviceArea);
    }
    if (minBudget) nextParams.set("budgetMin", minBudget);
    if (maxBudget) nextParams.set("budgetMax", maxBudget);
    if (bedrooms) nextParams.set("bedrooms", bedrooms);
    if (bathrooms) nextParams.set("bathrooms", bathrooms);
    if (squareFeet) nextParams.set("squareFeet", squareFeet);
    if (condition) nextParams.set("condition", condition);
    if (propertySubtype) nextParams.set("propertySubtype", propertySubtype);
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
            <input
              aria-label="Minimum budget"
              inputMode="numeric"
              min="0"
              onChange={(event) => setMinBudget(event.target.value)}
              placeholder="No min"
              step="1000"
              type="number"
              value={minBudget}
            />
            <span className="budget-separator">to</span>
            <input
              aria-label="Maximum budget"
              inputMode="numeric"
              min="0"
              onChange={(event) => setMaxBudget(event.target.value)}
              placeholder="No max"
              step="1000"
              type="number"
              value={maxBudget}
            />
          </div>
        </div>

        <div className="filter-section">
          <h4 className="filter-section-title">Home fit</h4>
          <div className="form-grid filter-form-grid">
            <div className="select-wrapper">
              <select aria-label="Property type" onChange={(event) => setPropertySubtype(event.target.value)} value={propertySubtype}>
                <option value="">Any type</option>
                {propertyTypeOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>
            <input
              aria-label="Bedrooms"
              inputMode="numeric"
              min="0"
              onChange={(event) => setBedrooms(event.target.value)}
              placeholder="Any beds"
              step="1"
              type="number"
              value={bedrooms}
            />
            <input
              aria-label="Bathrooms"
              inputMode="numeric"
              min="0"
              onChange={(event) => setBathrooms(event.target.value)}
              placeholder="Any baths"
              step="1"
              type="number"
              value={bathrooms}
            />
            <input
              aria-label="Square feet"
              inputMode="numeric"
              min="0"
              onChange={(event) => setSquareFeet(event.target.value)}
              placeholder="Any sqft"
              step="1"
              type="number"
              value={squareFeet}
            />
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
