"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState, useTransition, type CSSProperties, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { propertyTypeOptions } from "../lib/property-types";
import { FilterPopover } from "./filter-popover";
import { Icon } from "./icon";

export type SellerSearchFilters = {
  amenities: string[];
  badges: string[];
  bathrooms: string;
  bedrooms: string;
  budgetMax: string;
  budgetMin: string;
  condition: string;
  propertySubtype: string;
  squareFeet: string;
};

const budgetSteps = [
  100_000, 200_000, 300_000, 400_000, 500_000, 600_000, 700_000, 800_000, 900_000,
  1_000_000, 1_250_000, 1_500_000, 1_750_000, 2_000_000, 2_500_000, 3_000_000, 4_000_000, 5_000_000,
];
const roomSteps = ["1", "2", "3", "4", "5"];
const squareFeetSteps = ["500", "750", "1000", "1250", "1500", "1750", "2000", "2500", "3000", "4000"];
const conditionOptions = ["Move-in ready", "Mild fixer", "Fixer"] as const;
const amenityOptions = ["Pool", "Parking", "ADU", "Yard", "Garage"] as const;
const trustOptions = [
  { hint: "Lender letter reviewed by Liber", label: "Pre-approved", value: "PRE_APPROVED" },
  { hint: "Proof of funds reviewed by Liber", label: "Verified funds", value: "VERIFIED_FUNDS" },
  { hint: "Cash purchase with verified funds", label: "Cash buyer", value: "CASH_BUYER" },
] as const;

const emptyFilters: SellerSearchFilters = {
  amenities: [],
  badges: [],
  bathrooms: "",
  bedrooms: "",
  budgetMax: "",
  budgetMin: "",
  condition: "",
  propertySubtype: "",
  squareFeet: "",
};

export function SearchFilterBar({
  actions,
  filters,
  location,
}: {
  actions?: ReactNode;
  filters: SellerSearchFilters;
  location: ReactNode;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [draft, setDraft] = useState(filters);
  const [isSheetOpen, setIsSheetOpen] = useState(false);
  const [isPending, startTransition] = useTransition();
  const filterKey = JSON.stringify(filters);

  useEffect(() => {
    setDraft(JSON.parse(filterKey) as SellerSearchFilters);
  }, [filterKey]);

  useEffect(() => {
    if (!isSheetOpen) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setIsSheetOpen(false);
    };
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [isSheetOpen]);

  function apply(next: SellerSearchFilters) {
    const params = new URLSearchParams();
    for (const key of ["market", "serviceArea", "sort"]) {
      const value = searchParams.get(key);
      if (value) params.set(key, value);
    }
    const scalarKeys = ["budgetMin", "budgetMax", "bedrooms", "bathrooms", "propertySubtype", "squareFeet", "condition"] as const;
    for (const key of scalarKeys) {
      if (next[key]) params.set(key, next[key]);
    }
    next.amenities.forEach((amenity) => params.append("amenities", amenity));
    next.badges.forEach((badge) => params.append("badges", badge));
    const query = params.toString();
    startTransition(() => {
      router.push(query ? `/seller/search?${query}` : "/seller/search", { scroll: false });
    });
  }

  function commit(close?: () => void) {
    apply(draft);
    close?.();
    setIsSheetOpen(false);
  }

  function discard() {
    setDraft(filters);
  }

  const appliedCount = countApplied(filters);
  const update = (patch: Partial<SellerSearchFilters>) => setDraft((current) => ({ ...current, ...patch }));

  return (
    <div className={`search-toolbar${isPending ? " is-pending" : ""}`} data-pending={isPending ? "true" : undefined}>
      <div className="search-toolbar-location">{location}</div>

      <div className="search-toolbar-filters" aria-label="Buyer filters" role="group">
        <FilterPopover appliedLabel={budgetLabel(filters)} label="Budget">
          {(close) => (
            <FilterPanelFrame onApply={() => commit(close)} onReset={() => update({ budgetMax: "", budgetMin: "" })} title="Buyer budget">
              <BudgetFields draft={draft} update={update} />
            </FilterPanelFrame>
          )}
        </FilterPopover>
        <FilterPopover appliedLabel={roomsLabel(filters)} label="Beds & baths">
          {(close) => (
            <FilterPanelFrame onApply={() => commit(close)} onReset={() => update({ bathrooms: "", bedrooms: "" })} title="Bedrooms & bathrooms">
              <RoomFields draft={draft} update={update} />
            </FilterPanelFrame>
          )}
        </FilterPopover>
        <FilterPopover appliedLabel={homeTypeLabel(filters)} label="Home type">
          {(close) => (
            <FilterPanelFrame narrow onApply={() => commit(close)} onReset={() => update({ propertySubtype: "" })} title="Home type">
              <HomeTypeFields draft={draft} update={update} />
            </FilterPanelFrame>
          )}
        </FilterPopover>
        <FilterPopover appliedLabel={trustLabel(filters)} label="Buyer trust">
          {(close) => (
            <FilterPanelFrame onApply={() => commit(close)} onReset={() => update({ badges: [] })} title="Buyer trust">
              <TrustFields draft={draft} update={update} />
            </FilterPanelFrame>
          )}
        </FilterPopover>
        <FilterPopover align="end" appliedLabel={moreLabel(filters)} label="More">
          {(close) => (
            <FilterPanelFrame onApply={() => commit(close)} onReset={() => update({ amenities: [], condition: "", squareFeet: "" })} title="More filters" wide>
              <MoreFields draft={draft} update={update} />
            </FilterPanelFrame>
          )}
        </FilterPopover>
        {appliedCount > 0 ? (
          <button className="filter-reset-link" onClick={() => apply(emptyFilters)} type="button">
            Reset all
          </button>
        ) : null}
      </div>

      {actions ? <div className="search-toolbar-actions">{actions}</div> : null}

      <button
        aria-expanded={isSheetOpen}
        aria-haspopup="dialog"
        className={`filter-button filter-sheet-trigger${appliedCount ? " applied" : ""}`}
        onClick={() => setIsSheetOpen(true)}
        type="button"
      >
        <Icon name="sliders" size={18} />
        <span>Filters</span>
        {appliedCount ? <span className="filter-count">{appliedCount}</span> : null}
      </button>

      {/* Portaled so the full-screen sheet escapes the toolbar's stacking context. */}
      {isSheetOpen ? createPortal(
        <div className="filter-sheet" role="presentation">
          <button aria-label="Close filters" className="filter-sheet-scrim" onClick={() => { discard(); setIsSheetOpen(false); }} type="button" />
          <div aria-label="All filters" aria-modal="true" className="filter-sheet-panel" role="dialog">
            <header className="filter-sheet-head">
              <button aria-label="Close filters" className="icon-button" onClick={() => { discard(); setIsSheetOpen(false); }} type="button">
                <Icon name="close" size={20} />
              </button>
              <strong>Filters</strong>
              <button className="filter-reset-link" onClick={() => setDraft(emptyFilters)} type="button">Reset</button>
            </header>
            <div className="filter-sheet-body">
              <section className="filter-sheet-section">
                <h3>Buyer budget</h3>
                <BudgetFields draft={draft} update={update} />
              </section>
              <section className="filter-sheet-section">
                <h3>Bedrooms & bathrooms</h3>
                <RoomFields draft={draft} update={update} />
              </section>
              <section className="filter-sheet-section">
                <h3>Home type</h3>
                <HomeTypeFields draft={draft} update={update} />
              </section>
              <section className="filter-sheet-section">
                <h3>Buyer trust</h3>
                <TrustFields draft={draft} update={update} />
              </section>
              <section className="filter-sheet-section">
                <h3>Size, condition & amenities</h3>
                <MoreFields draft={draft} update={update} />
              </section>
            </div>
            <footer className="filter-sheet-foot">
              <button className="button primary block lg" onClick={() => commit()} type="button">
                Show matching buyers
              </button>
            </footer>
          </div>
        </div>,
        document.body,
      ) : null}
    </div>
  );
}

/** Zillow's dropdown frame: a grey title band (with Reset), the fields, then one full-width Apply. */
function FilterPanelFrame({
  children,
  narrow = false,
  onApply,
  onReset,
  title,
  wide = false,
}: {
  children: ReactNode;
  narrow?: boolean;
  onApply: () => void;
  onReset: () => void;
  title: string;
  wide?: boolean;
}) {
  return (
    <div className={`filter-panel-frame${wide ? " wide" : ""}${narrow ? " narrow" : ""}`}>
      <div className="filter-panel-band">
        <p className="filter-panel-title">{title}</p>
        <button className="filter-reset-link" onClick={onReset} type="button">Reset</button>
      </div>
      <div className="filter-panel-body">{children}</div>
      <div className="filter-panel-foot">
        <button className="button primary block lg" onClick={onApply} type="button">Apply</button>
      </div>
    </div>
  );
}

type FieldProps = {
  draft: SellerSearchFilters;
  update: (patch: Partial<SellerSearchFilters>) => void;
};

/** Slider stops: 0 is "no min", 1..N are budgetSteps, N + 1 is "no max". */
const lastBudgetStop = budgetSteps.length + 1;

function budgetStop(value: string, fallback: number) {
  const amount = Number(value);
  if (!value || !Number.isFinite(amount) || amount <= 0) return fallback;
  const index = budgetSteps.findIndex((step) => step >= amount);
  return index === -1 ? budgetSteps.length : index + 1;
}

function BudgetFields({ draft, update }: FieldProps) {
  const minStop = budgetStop(draft.budgetMin, 0);
  const maxStop = budgetStop(draft.budgetMax, lastBudgetStop);
  const trackStyle = {
    "--range-from": `${(minStop / lastBudgetStop) * 100}%`,
    "--range-to": `${(maxStop / lastBudgetStop) * 100}%`,
  } as CSSProperties;

  return (
    <div className="budget-fields">
      <div className="range-slider" style={trackStyle}>
        <input
          aria-label="Minimum budget"
          aria-valuetext={minStop === 0 ? "No minimum" : shortMoney(budgetSteps[minStop - 1])}
          max={lastBudgetStop}
          min={0}
          onChange={(event) => {
            const stop = Math.min(Number(event.target.value), maxStop - 1);
            update({ budgetMin: stop === 0 ? "" : String(budgetSteps[stop - 1]) });
          }}
          step={1}
          type="range"
          value={minStop}
        />
        <input
          aria-label="Maximum budget"
          aria-valuetext={maxStop === lastBudgetStop ? "No maximum" : shortMoney(budgetSteps[maxStop - 1])}
          max={lastBudgetStop}
          min={0}
          onChange={(event) => {
            const stop = Math.max(Number(event.target.value), minStop + 1);
            update({ budgetMax: stop === lastBudgetStop ? "" : String(budgetSteps[stop - 1]) });
          }}
          step={1}
          type="range"
          value={maxStop}
        />
      </div>
      <div aria-hidden="true" className="range-scale">
        <span>$0</span>
        <span>{shortMoney(budgetSteps[budgetSteps.length - 1])}+</span>
      </div>
      <div className="budget-range-fields">
        <label className="select-field">
          <span>Min</span>
          <select onChange={(event) => update({ budgetMin: event.target.value })} value={draft.budgetMin}>
            <option value="">No min</option>
            {withCurrent(budgetSteps.map(String), draft.budgetMin).map((value) => (
              <option key={value} value={value}>{shortMoney(Number(value))}</option>
            ))}
          </select>
        </label>
        <span aria-hidden="true" className="budget-range-dash">–</span>
        <label className="select-field">
          <span>Max</span>
          <select onChange={(event) => update({ budgetMax: event.target.value })} value={draft.budgetMax}>
            <option value="">No max</option>
            {withCurrent(budgetSteps.map(String), draft.budgetMax).map((value) => (
              <option key={value} value={value}>{shortMoney(Number(value))}</option>
            ))}
          </select>
        </label>
      </div>
    </div>
  );
}

function RoomFields({ draft, update }: FieldProps) {
  return (
    <div className="room-fields">
      <SegmentedChoice
        label="Bedrooms"
        onChange={(bedrooms) => update({ bedrooms })}
        options={roomSteps}
        value={draft.bedrooms}
      />
      <SegmentedChoice
        label="Bathrooms"
        onChange={(bathrooms) => update({ bathrooms })}
        options={roomSteps.slice(0, 4)}
        value={draft.bathrooms}
      />
    </div>
  );
}

function SegmentedChoice({
  label,
  onChange,
  options,
  value,
}: {
  label: string;
  onChange: (value: string) => void;
  options: string[];
  value: string;
}) {
  return (
    <fieldset className="segmented-field">
      <legend>{label}</legend>
      <div className="segmented-control">
        {["", ...options].map((option) => (
          <button
            aria-pressed={value === option}
            className={value === option ? "selected" : undefined}
            key={option || "any"}
            onClick={() => onChange(option)}
            type="button"
          >
            {option ? `${option}+` : "Any"}
          </button>
        ))}
      </div>
    </fieldset>
  );
}

/** One home type at a time (the server filter is single-valued), drawn as Zillow's list rows. */
function HomeTypeFields({ draft, update }: FieldProps) {
  return (
    <div aria-label="Home type" className="option-list" role="radiogroup">
      {[{ label: "Any home type", value: "" }, ...propertyTypeOptions].map((option) => {
        const selected = draft.propertySubtype === option.value;
        return (
          <button
            aria-checked={selected}
            className={`option-row${selected ? " selected" : ""}`}
            key={option.value || "any"}
            onClick={() => update({ propertySubtype: option.value })}
            role="radio"
            type="button"
          >
            <span aria-hidden="true" className="option-radio" />
            <span>{option.label}</span>
          </button>
        );
      })}
    </div>
  );
}

function TrustFields({ draft, update }: FieldProps) {
  return (
    <div className="check-list">
      {trustOptions.map((option) => {
        const checked = draft.badges.includes(option.value);
        return (
          <label className="check-row" key={option.value}>
            <input
              checked={checked}
              onChange={() => update({
                badges: checked ? draft.badges.filter((badge) => badge !== option.value) : [...draft.badges, option.value],
              })}
              type="checkbox"
            />
            <span className="check-box" aria-hidden="true"><Icon name="check" size={16} /></span>
            <span className="check-copy">
              <strong>{option.label}</strong>
              <small>{option.hint}</small>
            </span>
          </label>
        );
      })}
    </div>
  );
}

function MoreFields({ draft, update }: FieldProps) {
  return (
    <div className="more-filter-fields">
      <label className="select-field">
        <span>Square feet needed</span>
        <select onChange={(event) => update({ squareFeet: event.target.value })} value={draft.squareFeet}>
          <option value="">Any size</option>
          {withCurrent(squareFeetSteps, draft.squareFeet).map((value) => (
            <option key={value} value={value}>{Number(value).toLocaleString()}+ sqft</option>
          ))}
        </select>
      </label>
      <fieldset className="segmented-field">
        <legend>Condition preference</legend>
        <div className="segmented-control wrap">
          {["", ...conditionOptions].map((option) => (
            <button
              aria-pressed={draft.condition === option}
              className={draft.condition === option ? "selected" : undefined}
              key={option || "any"}
              onClick={() => update({ condition: option })}
              type="button"
            >
              {option || "Any"}
            </button>
          ))}
        </div>
      </fieldset>
      <fieldset className="segmented-field">
        <legend>Amenity needs</legend>
        <div className="toggle-chip-row">
          {amenityOptions.map((amenity) => {
            const selected = draft.amenities.includes(amenity);
            return (
              <button
                aria-pressed={selected}
                className={`toggle-chip${selected ? " selected" : ""}`}
                key={amenity}
                onClick={() => update({
                  amenities: selected ? draft.amenities.filter((item) => item !== amenity) : [...draft.amenities, amenity],
                })}
                type="button"
              >
                {selected ? <Icon name="check" size={14} /> : <Icon name="plus" size={14} />}
                {amenity}
              </button>
            );
          })}
        </div>
      </fieldset>
    </div>
  );
}

function withCurrent(values: string[], current: string) {
  if (!current || values.includes(current)) return values;
  return [...values, current].sort((a, b) => Number(a) - Number(b));
}

function countApplied(filters: SellerSearchFilters) {
  return [
    filters.budgetMin || filters.budgetMax,
    filters.bedrooms || filters.bathrooms,
    filters.propertySubtype,
    filters.badges.length > 0,
    filters.squareFeet || filters.condition || filters.amenities.length > 0,
  ].filter(Boolean).length;
}

function budgetLabel(filters: SellerSearchFilters) {
  const min = Number(filters.budgetMin);
  const max = Number(filters.budgetMax);
  if (min > 0 && max > 0) return `${shortMoney(min)} – ${shortMoney(max)}`;
  if (min > 0) return `${shortMoney(min)}+`;
  if (max > 0) return `Up to ${shortMoney(max)}`;
  return "";
}

function roomsLabel(filters: SellerSearchFilters) {
  const parts = [
    filters.bedrooms ? `${filters.bedrooms}+ bd` : "",
    filters.bathrooms ? `${filters.bathrooms}+ ba` : "",
  ].filter(Boolean);
  return parts.join(", ");
}

function homeTypeLabel(filters: SellerSearchFilters) {
  return propertyTypeOptions.find((option) => option.value === filters.propertySubtype)?.label ?? "";
}

function trustLabel(filters: SellerSearchFilters) {
  if (filters.badges.length === 0) return "";
  const first = trustOptions.find((option) => option.value === filters.badges[0])?.label ?? "Trust";
  return filters.badges.length > 1 ? `${first} +${filters.badges.length - 1}` : first;
}

function moreLabel(filters: SellerSearchFilters) {
  const count = [filters.squareFeet, filters.condition, ...filters.amenities].filter(Boolean).length;
  return count ? `More (${count})` : "";
}

export function shortMoney(value: number) {
  if (!Number.isFinite(value) || value <= 0) return "";
  if (value >= 1_000_000) return `$${(value / 1_000_000).toFixed(2).replace(/\.?0+$/, "")}M`;
  return `$${Math.round(value / 1000)}K`;
}
