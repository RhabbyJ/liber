"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState, useRef } from "react";
import { activePilotAreas, findPilotArea, pilotAreas } from "../lib/launch-market";
import { Icon } from "./icon";

type Props = {
  defaultArea?: string;
  defaultCity?: string;
  defaultState?: string;
  defaultLat?: string | number;
  defaultLng?: string | number;
  defaultRadiusMiles?: string | number;
  defaultBudgetMax?: string | number;
  defaultPropertySubtype?: string;
  defaultBadges?: string[];
  defaultSort?: string;
};

const minBudgetOptions = [
  { label: "$300k", value: "300000" },
  { label: "$400k", value: "400000" },
  { label: "$500k", value: "500000" },
  { label: "$600k", value: "600000" },
  { label: "$700k", value: "700000" },
  { label: "$800k", value: "800000" },
  { label: "$900k", value: "900000" },
  { label: "$1.0M", value: "1000000" },
];

const maxBudgetOptions = [
  { label: "$500k", value: "500000" },
  { label: "$750k", value: "750000" },
  { label: "$1.0M", value: "1000000" },
  { label: "$1.2M+", value: "1200000" },
  { label: "$1.5M", value: "1500000" },
  { label: "$2.0M", value: "2000000" },
  { label: "$3.0M+", value: "3000000" },
];

export function SearchFiltersSidebar({
  defaultArea = "",
  defaultCity = "",
  defaultState = "CA",
  defaultLat = "",
  defaultLng = "",
  defaultRadiusMiles = 8,
  defaultBudgetMax = "",
  defaultPropertySubtype = "",
  defaultBadges = [],
  defaultSort = "recommended",
}: Props) {
  const router = useRouter();
  const searchParams = useSearchParams();

  // Location States
  const [area, setArea] = useState(defaultArea);
  const [city, setCity] = useState(defaultCity);
  const [state, setState] = useState(defaultState);
  const [lat, setLat] = useState(String(defaultLat || ""));
  const [lng, setLng] = useState(String(defaultLng || ""));
  const [radiusMiles, setRadiusMiles] = useState(String(defaultRadiusMiles || 8));
  const [locationMessage, setLocationMessage] = useState("");
  const [isLookingUp, setIsLookingUp] = useState(false);

  // Budget States
  const [minBudget, setMinBudget] = useState("600000"); // Mockup defaults to $600k
  const [maxBudget, setMaxBudget] = useState(String(defaultBudgetMax || "1200000")); // Mockup defaults to $1.2M+

  // Slider visual positions (percent 0-100)
  const [minPercent, setMinPercent] = useState(25);
  const [maxPercent, setMaxPercent] = useState(65);

  // Property Type States: SFR, Condo, Townhome (active SFR in mockup)
  const [propertyType, setPropertyType] = useState<"SFR" | "Condo" | "Townhome" | null>(
    defaultPropertySubtype === "HOME" ? "SFR" : null
  );

  // Buyer Trust States
  const [checkedBadges, setCheckedBadges] = useState<string[]>(
    defaultBadges.length > 0 ? defaultBadges : ["PRE_APPROVED", "CASH_BUYER", "NON_CONTINGENT"]
  );

  // Other States
  const [offMarketOnly, setOffMarketOnly] = useState(false);

  // Sync Slider percentages on mount or value change
  useEffect(() => {
    const minVal = Number(minBudget) || 300000;
    const maxVal = Number(maxBudget) || 1200000;
    
    // Scale $300k - $3M range to 0 - 100%
    const minP = Math.min(100, Math.max(0, ((minVal - 300000) / 2700000) * 100));
    const maxP = Math.min(100, Math.max(0, ((maxVal - 300000) / 2700000) * 100));
    
    setMinPercent(minP);
    setMaxPercent(maxP);
  }, [minBudget, maxBudget]);

  const handleLocationChange = (val: string) => {
    setArea(val);
    setLocationMessage("");

    const matchedArea = findPilotArea(val);
    if (matchedArea) {
      setCity(matchedArea.city);
      setState(matchedArea.state);
      setLat(String(matchedArea.lat));
      setLng(String(matchedArea.lng));
      setRadiusMiles(String(matchedArea.radiusMiles));
    } else {
      setCity("");
      setState("CA");
      setLat("");
      setLng("");
    }
  };

  const handleLocationLookup = async () => {
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
  };

  const handleClearLocation = () => {
    setArea("");
    setCity("");
    setState("CA");
    setLat("");
    setLng("");
    setRadiusMiles("8");
    setLocationMessage("");
  };

  const toggleBadge = (badge: string) => {
    setCheckedBadges((prev) =>
      prev.includes(badge) ? prev.filter((b) => b !== badge) : [...prev, badge]
    );
  };

  const handleClearFilters = () => {
    setArea("");
    setCity("");
    setState("CA");
    setLat("");
    setLng("");
    setRadiusMiles("8");
    setLocationMessage("");
    setMinBudget("300000");
    setMaxBudget("1200000");
    setPropertyType(null);
    setCheckedBadges([]);
    setOffMarketOnly(false);
    
    // Trigger submit with cleared values
    const nextParams = new URLSearchParams();
    nextParams.set("sort", defaultSort);
    router.push(`/seller/search?${nextParams.toString()}`);
  };

  const handleFormSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    const nextParams = new URLSearchParams();
    if (area) nextParams.set("area", area);
    if (city) nextParams.set("city", city);
    if (state) nextParams.set("state", state);
    if (lat) nextParams.set("centerLat", lat);
    if (lng) nextParams.set("centerLng", lng);
    if (radiusMiles) nextParams.set("radiusMiles", radiusMiles);
    if (maxBudget) nextParams.set("budgetMax", maxBudget);
    
    if (propertyType) {
      nextParams.set("propertySubtype", "HOME");
    }

    checkedBadges.forEach((badge) => {
      nextParams.append("badges", badge);
    });

    nextParams.set("sort", defaultSort);
    router.push(`/seller/search?${nextParams.toString()}`);
  };

  return (
    <aside className="search-sidebar-filters">
      <form onSubmit={handleFormSubmit} className="filters-form">
        
        {/* Section: Location */}
        <div className="filter-section">
          <h4 className="filter-section-title">Location</h4>
          <div className="location-input-container">
            <div className="input-with-clear">
              <Icon name="search" className="search-field-icon" size={15} />
              <input
                autoComplete="off"
                id="search-area-input"
                name="area"
                onChange={(e) => handleLocationChange(e.target.value)}
                onBlur={handleLocationLookup}
                onKeyDown={(e) => e.key === "Enter" && handleLocationLookup()}
                placeholder="San Fernando Valley"
                type="text"
                value={area}
              />
              {area && (
                <button
                  type="button"
                  className="clear-input-btn"
                  onClick={handleClearLocation}
                  aria-label="Clear location input"
                >
                  &times;
                </button>
              )}
            </div>
          </div>
          <button
            type="button"
            className="add-neighborhood-link"
            onClick={() => document.getElementById("search-area-input")?.focus()}
          >
            + Add neighborhood
          </button>
          {locationMessage && (
            <span className="location-message-info">{locationMessage}</span>
          )}
        </div>

        {/* Section: Budget Range */}
        <div className="filter-section">
          <h4 className="filter-section-title">Budget Range</h4>
          <div className="budget-select-row">
            <div className="select-wrapper">
              <select
                aria-label="Min Budget"
                value={minBudget}
                onChange={(e) => setMinBudget(e.target.value)}
              >
                {minBudgetOptions.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>
            <span className="budget-separator">-</span>
            <div className="select-wrapper">
              <select
                aria-label="Max Budget"
                value={maxBudget}
                onChange={(e) => setMaxBudget(e.target.value)}
              >
                {maxBudgetOptions.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Slider Visual representation */}
          <div className="slider-container">
            <div className="slider-track" />
            <div
              className="slider-highlight-bar"
              style={{
                left: `${minPercent}%`,
                width: `${maxPercent - minPercent}%`,
              }}
            />
            <div className="slider-thumb thumb-left" style={{ left: `${minPercent}%` }} />
            <div className="slider-thumb thumb-right" style={{ left: `${maxPercent}%` }} />
          </div>
        </div>

        {/* Section: Property Type */}
        <div className="filter-section">
          <h4 className="filter-section-title">Property Type</h4>
          <div className="property-pills-row">
            <button
              type="button"
              className={`pill-btn ${propertyType === "SFR" ? "active" : "outlined"}`}
              onClick={() => setPropertyType(propertyType === "SFR" ? null : "SFR")}
            >
              SFR
            </button>
            <button
              type="button"
              className={`pill-btn ${propertyType === "Condo" ? "active" : "outlined"}`}
              onClick={() => setPropertyType(propertyType === "Condo" ? null : "Condo")}
            >
              Condo
            </button>
            <button
              type="button"
              className={`pill-btn ${propertyType === "Townhome" ? "active" : "outlined"}`}
              onClick={() => setPropertyType(propertyType === "Townhome" ? null : "Townhome")}
            >
              Townhome
            </button>
          </div>
        </div>

        {/* Section: Buyer Trust */}
        <div className="filter-section">
          <h4 className="filter-section-title">Buyer Trust</h4>
          <div className="checkboxes-stack">
            <label className="checkbox-container">
              <input
                type="checkbox"
                checked={checkedBadges.includes("PRE_APPROVED")}
                onChange={() => toggleBadge("PRE_APPROVED")}
              />
              <span className="checkmark" />
              Pre-approved
            </label>
            <label className="checkbox-container">
              <input
                type="checkbox"
                checked={checkedBadges.includes("CASH_BUYER")}
                onChange={() => toggleBadge("CASH_BUYER")}
              />
              <span className="checkmark" />
              Cash buyer
            </label>
            <label className="checkbox-container">
              <input
                type="checkbox"
                checked={checkedBadges.includes("NON_CONTINGENT")}
                onChange={() => toggleBadge("NON_CONTINGENT")}
              />
              <span className="checkmark" />
              Non-contingent
            </label>
          </div>
        </div>

        {/* Section: Other */}
        <div className="filter-section">
          <h4 className="filter-section-title">Other</h4>
          <div className="checkboxes-stack">
            <label className="checkbox-container">
              <input
                type="checkbox"
                checked={offMarketOnly}
                onChange={() => setOffMarketOnly(!offMarketOnly)}
              />
              <span className="checkmark" />
              Off-market only
            </label>
          </div>
        </div>

        {/* Form Action Buttons */}
        <div className="sidebar-form-actions">
          <button type="submit" className="button primary update-matches-btn">
            <svg
              className="refresh-icon"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
              width="15"
              height="15"
            >
              <path d="M21.5 2v6h-6M21.34 15.57a10 10 0 1 1-.57-8.38l.73-.73" />
            </svg>
            Update matches
          </button>
          <button
            type="button"
            className="clear-filters-link"
            onClick={handleClearFilters}
          >
            Clear filters
          </button>
        </div>
      </form>
    </aside>
  );
}
