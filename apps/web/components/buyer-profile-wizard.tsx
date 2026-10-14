"use client";

import {
  startTransition,
  useActionState,
  useEffect,
  useRef,
  type FormEvent,
  type ReactNode,
} from "react";
import type { BuyerProfileFormState } from "../lib/buyer-profile-form";
import { GeneratedAvatar } from "./generated-avatar";
import { Icon } from "./icon";
import { LocationLookupFields } from "./location-lookup-fields";
import { PropertyTypePicker } from "./property-type-picker";
import { BuyerBudgetRange } from "./buyer-budget-range";
import { savedBuyerBudget } from "./buyer-budget-values";

const purchaseTypeOptions = ["Cash", "Conventional financing", "Other"];
const seekingPropertyTypeOptions = ["House", "Condo", "Townhouse", "Manufactured", "Land"];

const bedroomsOptions = [
  { label: "Any", value: "" },
  { label: "1+", value: "1" },
  { label: "2+", value: "2" },
  { label: "3+", value: "3" },
  { label: "4+", value: "4" },
  { label: "5+", value: "5" },
];

const bathroomsOptions = [
  { label: "Any", value: "" },
  { label: "1+", value: "1" },
  { label: "2+", value: "2" },
  { label: "3+", value: "3" },
  { label: "4+", value: "4" },
];

const yearBuiltOptions = [
  { label: "Any year", value: "" },
  { label: "1950 or newer", value: "1950" },
  { label: "1970 or newer", value: "1970" },
  { label: "1990 or newer", value: "1990" },
  { label: "2010 or newer", value: "2010" },
];

const conditionOptions = [
  { label: "Any", value: "" },
  { label: "Move-in ready", value: "Move-in ready" },
  { label: "Mild fixer", value: "Mild fixer" },
  { label: "Fixer", value: "Fixer" },
];

const amenityOptions = ["Pool", "Parking", "ADU", "Yard", "Garage"];

type CriteriaForWizard = {
  bedroomsMin?: number;
  bathroomsMin?: number;
  squareFeetMin?: number;
  squareFeetMax?: number;
  lotSizeMin?: number;
  lotSizeMax?: number;
  yearBuiltMin?: number;
  condition?: string;
  features?: string[];
};

type BuyerForWizard = {
  avatarVariant?: string | null;
  id: string;
  name: string;
  type: string;
  purpose: string;
  location: string;
  city: string;
  neighborhood?: string;
  postalCode?: string;
  state: string;
  lat: string | number;
  lng: string | number;
  budgetMin: number;
  budgetMax: number;
  downPaymentMin: number;
  downPaymentMax: number;
  bio: string;
  criteriaDetails?: CriteriaForWizard[];
  serviceAreaSlugs?: string[];
  userId?: string;
};

export function BuyerProfileWizard({
  action,
  buyer,
  isPublished,
  marketSlug,
}: {
  action: (state: BuyerProfileFormState, formData: FormData) => Promise<BuyerProfileFormState>;
  buyer: BuyerForWizard;
  isPublished: boolean;
  marketSlug: string;
}) {
  const [state, formAction, isPending] = useActionState(action, { message: "" });
  const errorRef = useRef<HTMLDivElement>(null);
  const criteria = buyer.criteriaDetails?.[0];
  const selectedAmenities = new Set(
    (criteria?.features ?? [])
      .map((feature) => feature.trim().toLowerCase())
      .filter((feature) => amenityOptions.some((amenity) => amenity.toLowerCase() === feature)),
  );
  const avatarSeed = buyer.userId || buyer.id || buyer.name;
  const selectedPurchaseType = purchaseTypeOptions.includes(buyer.type) ? buyer.type : "Conventional financing";
  const selectedSeekingPropertyType = seekingPropertyTypeOptions.includes(buyer.purpose) ? buyer.purpose : "House";
  const savedBudget = savedBuyerBudget(buyer.budgetMin, buyer.budgetMax);

  useEffect(() => {
    if (!state.message || !errorRef.current) return;
    errorRef.current.focus();
    errorRef.current.scrollIntoView({
      behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth",
      block: "center",
    });
  }, [state.message]);

  function submitProfile(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    startTransition(() => formAction(formData));
  }

  return (
    <form aria-busy={isPending} className="buyer-profile-form profile-reference-form" onSubmit={submitProfile}>
      <input name="profileIntent" type="hidden" value={isPublished ? "save" : "publish"} />
      <ProfileFormSection title="Public identity">
        <div className="identity-preview buyer-identity-preview">
          <GeneratedAvatar
            decorative
            name={buyer.name}
            seed={avatarSeed}
            size="md"
            variant={buyer.avatarVariant}
          />
          <span>
            <strong>{buyer.name}</strong>
            <small>Sellers see your first name, last initial, and account code, never your full surname, photo, phone number, or documents.</small>
          </span>
        </div>
      </ProfileFormSection>

      <ProfileFormSection title="Budget & basics">
        <div className="form-grid">
          <ChoiceGroup
            defaultValue={selectedPurchaseType}
            legend="Purchase type"
            name="buyerType"
            options={purchaseTypeOptions.map((option) => ({ label: option, value: option }))}
            required
          />
          <PropertyTypePicker
            defaultValue={selectedSeekingPropertyType}
            legend="Seeking property type"
            name="buyingPurpose"
            required
            valueMode="label"
          />
          <BuyerBudgetRange
            defaultMax={savedBudget.max}
            defaultMin={savedBudget.min}
          />
          <NumberRangeField
            defaultMax={String(buyer.downPaymentMax || "")}
            defaultMin={String(buyer.downPaymentMin || "")}
            label="Down payment range"
            maxId="downPaymentMax"
            maxName="downPaymentMax"
            min={0}
            minId="downPaymentMin"
            minName="downPaymentMin"
            prefix="$"
            step={5_000}
          />
          <ChoiceGroup
            defaultValue={String(criteria?.bedroomsMin || "")}
            half
            legend="Bedrooms"
            name="bedroomsMin"
            options={bedroomsOptions}
          />
          <ChoiceGroup
            defaultValue={String(criteria?.bathroomsMin || "")}
            half
            legend="Bathrooms"
            name="bathroomsMin"
            options={bathroomsOptions}
          />
        </div>
      </ProfileFormSection>

      <ProfileFormSection optional title="Home & lot size">
        <div className="form-grid">
          <NumberRangeField
            defaultMax={String(criteria?.squareFeetMax || "")}
            defaultMin={String(criteria?.squareFeetMin || "")}
            label="Square feet"
            maxId="squareFeetMax"
            maxName="squareFeetMax"
            min={0}
            minId="squareFeetMin"
            minName="squareFeetMin"
            step={500}
            suffix="sqft"
          />
          <NumberRangeField
            defaultMax={String(criteria?.lotSizeMax || "")}
            defaultMin={String(criteria?.lotSizeMin || "")}
            label="Lot size"
            maxId="lotSizeMax"
            maxName="lotSizeMax"
            min={0}
            minId="lotSizeMin"
            minName="lotSizeMin"
            step={500}
            suffix="sqft"
          />
          <div className="field buyer-year-field">
            <label htmlFor="yearBuiltMin">Year built</label>
            <select id="yearBuiltMin" name="yearBuiltMin" defaultValue={String(criteria?.yearBuiltMin || "")}>
              {yearBuiltOptions.map((option) => (
                <option key={option.label} value={option.value}>{option.label}</option>
              ))}
            </select>
          </div>
        </div>
      </ProfileFormSection>

      <ProfileFormSection optional title="Preferences">
        <div className="form-grid">
          <ChoiceGroup
            defaultValue={criteria?.condition ?? ""}
            legend="Condition"
            name="condition"
            options={conditionOptions}
            variant="wrap"
          />
          <fieldset className="field full buyer-amenities-field">
            <legend>Amenities you need</legend>
            <div className="buyer-chip-row">
              {amenityOptions.map((amenity) => (
                <label className="buyer-chip" key={amenity}>
                  <input
                    defaultChecked={selectedAmenities.has(amenity.toLowerCase())}
                    name="features"
                    type="checkbox"
                    value={amenity}
                  />
                  <Icon className="buyer-chip-add" name="plus" size={14} />
                  <Icon className="buyer-chip-on" name="check" size={14} />
                  {amenity}
                </label>
              ))}
            </div>
          </fieldset>
          <div className="field full">
            <label htmlFor="bio">Note to matching sellers</label>
            <textarea
              id="bio"
              name="bio"
              defaultValue={buyer.bio}
              placeholder="Looking to simplify life in a quiet, comfortable home with low maintenance and good access to family."
            />
          </div>
        </div>
      </ProfileFormSection>

      <ProfileFormSection title="Target area">
        <div className="form-grid">
          <LocationLookupFields
            defaultLocation={buyer.location}
            defaultServiceAreaSlug={buyer.serviceAreaSlugs?.[0] ?? ""}
            inputId="desiredServiceAreaSearch"
            label="Search city, neighborhood, or ZIP"
            marketSlug={marketSlug}
          />
        </div>
      </ProfileFormSection>

      {state.message ? (
        <div
          className="inline-alert danger buyer-profile-form-error"
          ref={errorRef}
          role="alert"
          tabIndex={-1}
        >
          <Icon name="info" size={20} />
          <p><strong>Check your profile.</strong> {state.message}</p>
        </div>
      ) : null}

      <div className="buyer-profile-submit">
        <button className="button primary lg" disabled={isPending} type="submit">
          {isPending
            ? isPublished ? "Saving changes..." : "Publishing profile..."
            : isPublished ? "Save changes" : "Publish buyer profile"}
        </button>
      </div>
    </form>
  );
}

function ProfileFormSection({
  children,
  optional = false,
  title,
}: {
  children: ReactNode;
  optional?: boolean;
  title: string;
}) {
  return (
    <section className="buyer-form-section">
      <h2>
        {title}
        {optional ? <span className="optional-tag"> (optional)</span> : null}
      </h2>
      <div className="buyer-form-fields">{children}</div>
    </section>
  );
}

/** Redfin-style segmented radios: one native radio per option, so the form submits exactly the old select values. */
function ChoiceGroup({
  defaultValue,
  half = false,
  legend,
  name,
  options,
  required = false,
  variant = "segmented",
}: {
  defaultValue: string;
  half?: boolean;
  legend: string;
  name: string;
  options: Array<{ label: string; value: string }>;
  required?: boolean;
  variant?: "segmented" | "wrap";
}) {
  const checkedValue = options.some((option) => option.value === defaultValue) ? defaultValue : options[0]?.value;

  return (
    <fieldset className={`field${half ? "" : " full"} buyer-choice-field`}>
      <legend>{legend}</legend>
      <div className={`buyer-choice-group ${variant}`}>
        {options.map((option) => (
          <label className="buyer-choice" key={option.value || "any"}>
            <input
              defaultChecked={option.value === checkedValue}
              name={name}
              required={required}
              type="radio"
              value={option.value}
            />
            <span>{option.label}</span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}

type NumberRangeFieldProps = {
  defaultMax: string;
  defaultMin: string;
  label: string;
  maxId: string;
  maxName: string;
  min: number;
  minId: string;
  minName: string;
  prefix?: string;
  required?: boolean;
  step: number;
  suffix?: string;
};

function NumberRangeField({
  defaultMax,
  defaultMin,
  label,
  maxId,
  maxName,
  min,
  minId,
  minName,
  prefix,
  required = false,
  step,
  suffix,
}: NumberRangeFieldProps) {
  return (
    <fieldset className="field full range-field buyer-range-field">
      <legend>{label}</legend>
      <div className="range-input-pair">
        <label className="range-number-box" htmlFor={minId}>
          <span>Min</span>
          <span className="range-number-wrap">
            {prefix ? <span className="range-prefix" aria-hidden="true">{prefix}</span> : null}
            <input
              aria-describedby={`${minId}-step-hint`}
              className={`range-number-input ${prefix ? "has-prefix" : ""} ${suffix ? "has-suffix" : ""}`}
              defaultValue={defaultMin}
              id={minId}
              inputMode="numeric"
              min={min}
              name={minName}
              placeholder="No min"
              required={required}
              step={step}
              type="number"
            />
            {suffix ? <span className="range-suffix" aria-hidden="true">{suffix}</span> : null}
          </span>
        </label>
        <span className="range-to" aria-hidden="true">–</span>
        <label className="range-number-box" htmlFor={maxId}>
          <span>Max</span>
          <span className="range-number-wrap">
            {prefix ? <span className="range-prefix" aria-hidden="true">{prefix}</span> : null}
            <input
              aria-describedby={`${minId}-step-hint`}
              className={`range-number-input ${prefix ? "has-prefix" : ""} ${suffix ? "has-suffix" : ""}`}
              defaultValue={defaultMax}
              id={maxId}
              inputMode="numeric"
              min={min}
              name={maxName}
              placeholder="No max"
              required={required}
              step={step}
              type="number"
            />
            {suffix ? <span className="range-suffix" aria-hidden="true">{suffix}</span> : null}
          </span>
        </label>
      </div>
      <span className="field-hint" id={`${minId}-step-hint`}>
        {prefix}{step.toLocaleString("en-US")}{suffix ? ` ${suffix}` : ""} increments
      </span>
    </fieldset>
  );
}
