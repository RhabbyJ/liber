"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState, type FormEvent } from "react";
import { serviceAreaDisplayLabel } from "../lib/service-areas";
import { propertyTypeOptions } from "../lib/property-types";
import { Icon } from "./icon";
import { ServiceAreaCombobox } from "./service-area-combobox";

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
  const [minBudget, setMinBudget] = useState(String(defaultBudgetMin || ""));
  const [maxBudget, setMaxBudget] = useState(String(defaultBudgetMax || ""));
  const [checkedBadges, setCheckedBadges] = useState<string[]>(defaultBadges);
  const [bedrooms, setBedrooms] = useState(defaultBedrooms);
  const [bathrooms, setBathrooms] = useState(defaultBathrooms);
  const [squareFeet, setSquareFeet] = useState(defaultSquareFeet);
  const [condition, setCondition] = useState(defaultCondition);
  const [propertySubtype, setPropertySubtype] = useState(defaultPropertySubtype);
  const [amenities, setAmenities] = useState<string[]>(defaultAmenities);

  useEffect(() => {
    setArea(defaultArea);
    setServiceArea(defaultServiceArea);
  }, [defaultArea, defaultServiceArea, marketSlug]);

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
          <ServiceAreaCombobox
            ariaLabel="Filter buyers by city, neighborhood, or ZIP"
            className="filter-area-search"
            clearLabel="Clear location filter"
            defaultValue={area}
            inputId="search-area-input"
            marketSlug={marketSlug}
            onClear={() => {
              setArea("");
              setServiceArea("");
            }}
            onQueryChange={() => setServiceArea("")}
            onSelect={(selected) => {
              setArea(serviceAreaDisplayLabel(selected));
              setServiceArea(selected.slug);
            }}
            placeholder="Search city, neighborhood, or ZIP"
          />
          <span className="location-message-info" role="status">
            {serviceArea ? `Filtering to ${area}` : area ? "Choose an area from the list to filter." : "Any LA County area"}
          </span>
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
