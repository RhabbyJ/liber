"use client";

import { useRef, useState, type CSSProperties, type FormEvent } from "react";
import { Icon } from "./icon";
import { LocationLookupFields } from "./location-lookup-fields";
import { activePilotAreas } from "../lib/launch-market";

const buyerTypeOptions = ["Home Buyer", "Investor", "Cash Buyer", "Move-up Buyer", "Downsizing Buyer"];
const buyingPurposeOptions = ["Owner occupy", "Fix and flip", "Other"];

const bedroomsOptions = [
  { label: "Any bedrooms", value: "" },
  { label: "1+ bedrooms", value: "1" },
  { label: "2+ bedrooms", value: "2" },
  { label: "3+ bedrooms", value: "3" },
  { label: "4+ bedrooms", value: "4" },
  { label: "5+ bedrooms", value: "5" },
];

const bathroomsOptions = [
  { label: "Any bathrooms", value: "" },
  { label: "1+ bathrooms", value: "1" },
  { label: "2+ bathrooms", value: "2" },
  { label: "3+ bathrooms", value: "3" },
  { label: "4+ bathrooms", value: "4" },
];

const yearBuiltOptions = [
  { label: "Any year", value: "" },
  { label: "1950 or newer", value: "1950" },
  { label: "1970 or newer", value: "1970" },
  { label: "1990 or newer", value: "1990" },
  { label: "2010 or newer", value: "2010" },
];

const conditionOptions = ["Any condition", "Move-in ready", "Mild fixer", "Fixer"];

const amenityOptions = ["Pool", "Parking", "ADU", "Yard", "Garage"];

type CriteriaForWizard = {
  bedroomsMin?: number;
  bathroomsMin?: number;
  squareFeetMin?: number;
  lotSizeMin?: number;
  yearBuiltMin?: number;
  condition?: string;
  features?: string[];
};

type BuyerForWizard = {
  name: string;
  type: string;
  purpose: string;
  location: string;
  city: string;
  lat: string | number;
  lng: string | number;
  budgetMin: number;
  budgetMax: number;
  downPaymentMin: number;
  downPaymentMax: number;
  bio: string;
  criteriaDetails?: CriteriaForWizard[];
};

const STEPS = [
  { key: 1, label: "Who you are", helper: "Name and intent" },
  { key: 2, label: "Your budget", helper: "Price + down payment" },
  { key: 3, label: "Home fit", helper: "Beds, baths, features" },
  { key: 4, label: "Your story", helper: "A few sentences" },
  { key: 5, label: "Review", helper: "Confirm" },
] as const;

const BUYER_PROFILE_WIZARD_FALLBACK = `
(() => {
  const pilotAreas = ${JSON.stringify(activePilotAreas)};

  function init(form) {
    if (form.dataset.buyerProfileFallbackReady === "true") return;
    form.dataset.buyerProfileFallbackReady = "true";

    const panes = Array.from(form.querySelectorAll("[data-buyer-profile-pane]"));
    const steps = Array.from(form.querySelectorAll("[data-buyer-profile-step-item]"));
    const progress = form.querySelector("[data-buyer-profile-progress]");
    const back = form.querySelector("[data-buyer-profile-back]");
    const next = form.querySelector("[data-buyer-profile-next]");
    const confirm = form.querySelector("[data-buyer-profile-confirm]");
    const error = form.querySelector("[data-buyer-profile-error]");
    if (panes.length === 0) return;

    let step = panes.findIndex((pane) => !pane.hidden);
    if (step < 0) step = 0;
    let isApplyingPilotArea = false;

    function field(name) {
      return form.querySelector('[name="' + name + '"]');
    }

    function text(name) {
      return field(name)?.value?.trim() || "";
    }

    function setValue(name, value, notify) {
      const input = field(name);
      if (!input) return;
      input.value = value || "";
      if (notify === false) return;
      input.dispatchEvent(new Event("input", { bubbles: true }));
      input.dispatchEvent(new Event("change", { bubbles: true }));
    }

    function setError(message) {
      if (!error) return;
      error.textContent = message || "";
      error.hidden = !message;
    }

    function moneyLabel(value) {
      const amount = Number(value);
      if (!Number.isFinite(amount) || amount <= 0) return "No minimum";
      if (amount >= 1000000) return "$" + (amount / 1000000) + "M";
      return "$" + (amount / 1000) + "k";
    }

    function rangeLabel(min, max) {
      return moneyLabel(min) + " - " + moneyLabel(max);
    }

    function summary(key, value) {
      const node = form.querySelector('[data-buyer-summary="' + key + '"]');
      if (node) node.textContent = value || "";
    }

    function selectedFeatures() {
      return Array.from(form.querySelectorAll('input[name="features"]:checked')).map((input) => input.value);
    }

    function homeFitLabel() {
      const facts = [];
      if (text("bedroomsMin")) facts.push(text("bedroomsMin") + "+ bd");
      if (text("bathroomsMin")) facts.push(text("bathroomsMin") + "+ ba");
      if (text("squareFeetMin")) facts.push(Number(text("squareFeetMin")).toLocaleString() + "+ sqft");
      if (text("condition")) facts.push(text("condition"));
      facts.push(...selectedFeatures());
      return facts.length > 0 ? facts.join(" / ") : "Any home";
    }

    function refreshReviewSummary() {
      summary("name", text("displayName") || "Private buyer");
      summary("location", text("desiredLocationText") || text("desiredCity") || "Not set");
      summary("type", text("buyerType") || "Home Buyer");
      summary("purpose", text("buyingPurpose") || "Owner occupy");
      summary("budget", rangeLabel(text("budgetMin"), text("budgetMax")));
      summary("downPayment", rangeLabel(text("downPaymentMin"), text("downPaymentMax")));
      summary("homeFit", homeFitLabel());
    }

    function applyPilotArea(value) {
      const query = (value || "").toLowerCase();
      const area = pilotAreas.find((item) => item.zip === value || query.includes(item.zip) || query.includes(item.city.toLowerCase()));
      if (!area) return;
      isApplyingPilotArea = true;
      setValue("desiredLocationText", area.label, false);
      setValue("desiredCity", area.city, false);
      setValue("desiredState", area.state, false);
      setValue("desiredLat", String(area.lat), false);
      setValue("desiredLng", String(area.lng), false);
      isApplyingPilotArea = false;
    }

    function validate() {
      if (step === 0 && !text("displayName")) return "Add a seller-facing display name.";
      const budgetMin = Number(text("budgetMin") || 0);
      const budgetMax = Number(text("budgetMax") || 0);
      if (step === 1 && budgetMin > 0 && budgetMax > 0 && budgetMin > budgetMax) return "Budget minimum cannot exceed maximum.";
      const downMin = Number(text("downPaymentMin") || 0);
      const downMax = Number(text("downPaymentMax") || 0);
      if (step === 1 && downMin > 0 && downMax > 0 && downMin > downMax) return "Down payment minimum cannot exceed maximum.";
      return null;
    }

    function render(shouldFocus) {
      panes.forEach((pane, index) => {
        const active = index === step;
        pane.hidden = !active;
        pane.setAttribute("aria-hidden", active ? "false" : "true");
      });
      steps.forEach((item, index) => {
        const active = index === step;
        item.classList.toggle("active", active);
        item.classList.toggle("done", index < step);
        const button = item.querySelector("[data-buyer-profile-step-button]");
        if (button) {
          button.disabled = index > step;
          if (active) button.setAttribute("aria-current", "step");
          else button.removeAttribute("aria-current");
        }
      });
      if (progress) progress.style.width = ((step + 1) / panes.length) * 100 + "%";
      if (back) {
        back.disabled = step === 0;
        back.textContent = step === panes.length - 1 ? "No, take me back" : "Back";
      }
      if (next) next.hidden = step >= panes.length - 1;
      if (confirm) confirm.hidden = step < panes.length - 1;
      if (shouldFocus) window.setTimeout(() => panes[step]?.querySelector("input, select, textarea, button:not([disabled])")?.focus(), 0);
    }

    function go(delta) {
      setError("");
      if (delta > 0) {
        const message = validate();
        if (message) return setError(message);
      }
      if (step === panes.length - 2 && delta > 0) refreshReviewSummary();
      step = Math.max(0, Math.min(step + delta, panes.length - 1));
      render(true);
    }

    function submitProfile() {
      const message = validate();
      if (message) return setError(message);
      refreshReviewSummary();
      form.dataset.buyerProfileConfirmed = "true";
      HTMLFormElement.prototype.submit.call(form);
    }

    form.addEventListener("click", (event) => {
      const target = event.target instanceof Element ? event.target : null;
      const stepButton = target?.closest("[data-buyer-profile-step-button]");
      if (!stepButton) return;
      event.preventDefault();
      event.stopPropagation();
      const index = Number(stepButton.dataset.buyerProfileStepButton || 0);
      if (index <= step) {
        step = index;
        render(true);
      }
    }, true);

    next?.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      go(1);
    }, true);

    back?.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      go(-1);
    }, true);

    confirm?.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      submitProfile();
    }, true);

    form.addEventListener("submit", (event) => {
      if (form.dataset.buyerProfileConfirmed === "true") return;
      event.preventDefault();
      event.stopPropagation();
      if (step >= panes.length - 1) submitProfile();
      else go(1);
    }, true);

    form.addEventListener("keydown", (event) => {
      if (event.key !== "Enter" || event.target?.tagName === "TEXTAREA") return;
      event.preventDefault();
      event.stopPropagation();
      if (step >= panes.length - 1) submitProfile();
      else go(1);
    }, true);

    const pilotSelect = Array.from(form.querySelectorAll("select")).find((select) => select.getAttribute("aria-label") === "Active pilot ZIP");
    pilotSelect?.addEventListener("change", (event) => {
      applyPilotArea(event.target.value);
    }, true);

    field("desiredLocationText")?.addEventListener("change", (event) => {
      if (isApplyingPilotArea) return;
      applyPilotArea(event.target.value);
    }, true);

    form.addEventListener("input", () => setError(""));
    render(false);
  }

  function boot() {
    document.querySelectorAll("[data-buyer-profile-wizard]").forEach(init);
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot, { once: true });
  else boot();
})();
`;

type Step = (typeof STEPS)[number]["key"];

type ReviewSummary = {
  budget: string;
  downPayment: string;
  homeFit: string;
  location: string;
  name: string;
  purpose: string;
  type: string;
};

export function BuyerProfileWizard({
  action,
  buyer,
}: {
  action: (formData: FormData) => Promise<void>;
  buyer: BuyerForWizard;
}) {
  const formRef = useRef<HTMLFormElement>(null);
  const confirmIntentRef = useRef(false);
  const [step, setStep] = useState<Step>(1);
  const [reviewSummary, setReviewSummary] = useState<ReviewSummary>(() => summaryFromBuyer(buyer));
  const total = STEPS.length;
  const progress = (step / total) * 100;
  const criteria = buyer.criteriaDetails?.[0];
  const selectedAmenities = new Set(
    (criteria?.features ?? [])
      .map((feature) => feature.trim().toLowerCase())
      .filter((feature) => amenityOptions.some((amenity) => amenity.toLowerCase() === feature)),
  );

  function refreshReviewSummary() {
    const form = formRef.current;
    if (!form) return;
    setReviewSummary(summaryFromForm(new FormData(form)));
  }

  function goForward() {
    if (step === total - 1) refreshReviewSummary();
    setStep((s) => (s < total ? ((s + 1) as Step) : s));
  }

  function confirmAndSubmit() {
    confirmIntentRef.current = true;
    formRef.current?.requestSubmit();
  }

  // The profile only submits through the explicit "Yes" confirmation button.
  // Enter-key/implicit submissions advance steps instead of activating the profile.
  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    if (step === total && confirmIntentRef.current) {
      confirmIntentRef.current = false;
      return;
    }
    event.preventDefault();
    if (step < total) goForward();
  }

  return (
    <form
      action={action}
      className="wizard stack loose profile-reference-form"
      data-buyer-profile-wizard
      encType="multipart/form-data"
      onSubmit={handleSubmit}
      ref={formRef}
    >
      <header className="wizard-header stack">
        <div className="wizard-progress" aria-hidden="true">
          <div className="wizard-progress-fill" data-buyer-profile-progress style={{ width: `${progress}%` }} />
        </div>
        <ol className="wizard-steps" aria-label="Profile steps">
          {STEPS.map((s, index) => {
            const isActive = step === s.key;
            const isDone = step > s.key;
            return (
              <li
                data-buyer-profile-step-item
                key={s.key}
                className={`wizard-step ${isActive ? "active" : ""} ${isDone ? "done" : ""}`}
              >
                <button
                  aria-current={isActive ? "step" : undefined}
                  className="wizard-step-button"
                  data-buyer-profile-step-button={index}
                  disabled={s.key > step}
                  onClick={() => {
                    // Steps can be revisited, but not skipped ahead of the flow.
                    if (s.key > step) return;
                    setStep(s.key);
                  }}
                  type="button"
                >
                  <span className="wizard-step-num">
                    {isDone ? <Icon name="check" size={14} /> : s.key}
                  </span>
                  <span className="wizard-step-text">
                    <span className="wizard-step-label">{s.label}</span>
                    <span className="wizard-step-helper">{s.helper}</span>
                  </span>
                </button>
              </li>
            );
          })}
        </ol>
      </header>

      <div className="wizard-body stack">
        <section className="wizard-pane" data-buyer-profile-pane hidden={step !== 1} aria-hidden={step !== 1}>
          <div className="section-stack">
            <p className="eyebrow">Step 1 of {total}</p>
            <h2>Who you are</h2>
            <p className="muted small">Sellers see this card first. Keep it clear and privacy-safe.</p>
          </div>
          <div className="form-grid">
            <div className="field">
              <label htmlFor="displayName">Seller-facing display name</label>
              <input id="displayName" name="displayName" defaultValue={buyer.name} placeholder="Private buyer" />
              <span className="field-hint">Use an alias or first name + last initial. Your account name stays private.</span>
            </div>
            <div className="field">
              <label htmlFor="avatar">Profile photo</label>
              <input id="avatar" name="avatar" type="file" accept="image/png,image/jpeg,image/webp" />
              <span className="field-hint">PNG, JPEG, or WebP. Optional.</span>
            </div>
            <div className="field">
              <label htmlFor="buyerType">Buyer type</label>
              <select id="buyerType" name="buyerType" defaultValue={buyer.type || "Home Buyer"}>
                {buyerTypeOptions.map((option) => (
                  <option key={option} value={option}>{option}</option>
                ))}
              </select>
            </div>
            <div className="field">
              <label htmlFor="purpose">Buying purpose</label>
              <select id="purpose" name="buyingPurpose" defaultValue={buyer.purpose || "Owner occupy"}>
                {buyingPurposeOptions.map((option) => (
                  <option key={option} value={option}>{option}</option>
                ))}
              </select>
            </div>
            <LocationLookupFields
              cityName="desiredCity"
              defaultCity={buyer.city}
              defaultLat={String(buyer.lat || "")}
              defaultLng={String(buyer.lng || "")}
              defaultLocation={buyer.location}
              inputName="desiredLocationText"
              intent="store"
              label="Desired pilot area or ZIP"
              latName="desiredLat"
              lngName="desiredLng"
              stateName="desiredState"
            />
          </div>
        </section>

        <section className="wizard-pane" data-buyer-profile-pane hidden={step !== 2} aria-hidden={step !== 2}>
          <div className="section-stack">
            <p className="eyebrow">Step 2 of {total}</p>
            <h2>Your budget</h2>
            <p className="muted small">Ranges, not exact numbers. Sellers filter against this.</p>
          </div>
          <div className="form-grid">
            <NumberRangeField
              defaultMax={String(buyer.budgetMax || "1000000")}
              defaultMin={String(buyer.budgetMin || "")}
              label="Budget range"
              max={3_000_000}
              maxId="budgetMax"
              maxName="budgetMax"
              min={0}
              minId="budgetMin"
              minName="budgetMin"
              step={25_000}
            />
            <NumberRangeField
              defaultMax={String(buyer.downPaymentMax || "200000")}
              defaultMin={String(buyer.downPaymentMin || "")}
              label="Down payment range"
              max={1_000_000}
              maxId="downPaymentMax"
              maxName="downPaymentMax"
              min={0}
              minId="downPaymentMin"
              minName="downPaymentMin"
              step={10_000}
            />
          </div>
        </section>

        <section className="wizard-pane" data-buyer-profile-pane hidden={step !== 3} aria-hidden={step !== 3}>
          <div className="section-stack">
            <p className="eyebrow">Step 3 of {total}</p>
            <h2>Home fit</h2>
            <p className="muted small">The home you&apos;d say yes to. Sellers match their property against this.</p>
          </div>
          <div className="criteria-type-strip" aria-label="Supported property type">
            <span className="criteria-type-tab active">Home</span>
            <span className="criteria-type-pill active">
              <Icon name="home" size={14} />
              Residential home
            </span>
          </div>
          <div className="form-grid">
            <div className="field">
              <label htmlFor="bedroomsMin">Bedrooms min</label>
              <select id="bedroomsMin" name="bedroomsMin" defaultValue={String(criteria?.bedroomsMin || "")}>
                {bedroomsOptions.map((option) => (
                  <option key={option.label} value={option.value}>{option.label}</option>
                ))}
              </select>
            </div>
            <div className="field">
              <label htmlFor="bathroomsMin">Bathrooms min</label>
              <select id="bathroomsMin" name="bathroomsMin" defaultValue={String(criteria?.bathroomsMin || "")}>
                {bathroomsOptions.map((option) => (
                  <option key={option.label} value={option.value}>{option.label}</option>
                ))}
              </select>
            </div>
            <NumberSliderField
              defaultValue={String(criteria?.squareFeetMin || "")}
              id="squareFeetMin"
              label="Square feet min"
              max={6_000}
              min={0}
              name="squareFeetMin"
              placeholder="Any square feet"
              step={100}
              suffix="sqft"
            />
            <NumberSliderField
              defaultValue={String(criteria?.lotSizeMin || "")}
              id="lotSizeMin"
              label="Lot size min"
              max={20_000}
              min={0}
              name="lotSizeMin"
              placeholder="Any lot size"
              step={500}
              suffix="sqft lot"
            />
            <div className="field">
              <label htmlFor="yearBuiltMin">Year built</label>
              <select id="yearBuiltMin" name="yearBuiltMin" defaultValue={String(criteria?.yearBuiltMin || "")}>
                {yearBuiltOptions.map((option) => (
                  <option key={option.label} value={option.value}>{option.label}</option>
                ))}
              </select>
            </div>
            <div className="field">
              <label htmlFor="condition">Condition</label>
              <select id="condition" name="condition" defaultValue={criteria?.condition ?? ""}>
                {conditionOptions.map((option) => (
                  <option key={option} value={option === "Any condition" ? "" : option}>{option}</option>
                ))}
              </select>
            </div>
            <div className="field full">
              <label>Amenities you need</label>
              <div className="pill-row">
                {amenityOptions.map((amenity) => (
                  <label className="checkbox-container" key={amenity} style={{ marginRight: 14 }}>
                    <input
                      defaultChecked={selectedAmenities.has(amenity.toLowerCase())}
                      name="features"
                      type="checkbox"
                      value={amenity}
                    />
                    <span className="checkmark" />
                    {amenity}
                  </label>
                ))}
              </div>
              <span className="field-hint">Sellers can filter buyer demand by these amenity needs.</span>
            </div>
          </div>
        </section>

        <section className="wizard-pane" data-buyer-profile-pane hidden={step !== 4} aria-hidden={step !== 4}>
          <div className="section-stack">
            <p className="eyebrow">Step 4 of {total}</p>
            <h2>Your story</h2>
            <p className="muted small">A short bio helps sellers understand what you're looking for and why.</p>
          </div>
          <div className="form-grid">
            <div className="field full">
              <label htmlFor="bio">Bio</label>
              <textarea
                id="bio"
                name="bio"
                defaultValue={buyer.bio}
                placeholder="Looking to simplify life in a quiet, comfortable home with low maintenance and good access to family."
              />
            </div>
          </div>
        </section>

        <section className="wizard-pane" data-buyer-profile-pane hidden={step !== 5} aria-hidden={step !== 5}>
          <div className="section-stack">
            <p className="eyebrow">Step 5 of {total}</p>
            <h2>Does this all look correct?</h2>
            <p className="muted small">Confirm the profile basics before making it visible to sellers.</p>
          </div>
          <div className="summary-grid">
            <div>
              <span className="summary-label">Name</span>
              <span className="summary-value" data-buyer-summary="name">{reviewSummary.name}</span>
            </div>
            <div>
              <span className="summary-label">Location</span>
              <span className="summary-value" data-buyer-summary="location">{reviewSummary.location}</span>
            </div>
            <div>
              <span className="summary-label">Buyer type</span>
              <span className="summary-value" data-buyer-summary="type">{reviewSummary.type}</span>
            </div>
            <div>
              <span className="summary-label">Buying for</span>
              <span className="summary-value" data-buyer-summary="purpose">{reviewSummary.purpose}</span>
            </div>
            <div>
              <span className="summary-label">Budget</span>
              <span className="summary-value" data-buyer-summary="budget">{reviewSummary.budget}</span>
            </div>
            <div>
              <span className="summary-label">Down payment</span>
              <span className="summary-value" data-buyer-summary="downPayment">{reviewSummary.downPayment}</span>
            </div>
            <div>
              <span className="summary-label">Home fit</span>
              <span className="summary-value" data-buyer-summary="homeFit">{reviewSummary.homeFit}</span>
            </div>
          </div>
        </section>
      </div>

      <p className="signup-error" data-buyer-profile-error hidden />

      <footer className="wizard-footer actions between">
        <button
          className="button ghost"
          data-buyer-profile-back
          disabled={step === 1}
          onClick={() => setStep((s) => (s > 1 ? ((s - 1) as Step) : s))}
          type="button"
        >
          {step === total ? "No, take me back" : "Back"}
        </button>
        <button
          className="button primary"
          data-buyer-profile-next
          hidden={step >= total}
          onClick={goForward}
          type="button"
        >
          Continue
          <Icon name="arrow-right" size={14} />
        </button>
        <button
          className="button primary"
          data-buyer-profile-confirm
          hidden={step < total}
          onClick={confirmAndSubmit}
          type="button"
        >
          <Icon name="sparkle" size={14} />
          Yes, this is correct
        </button>
      </footer>
      <script dangerouslySetInnerHTML={{ __html: BUYER_PROFILE_WIZARD_FALLBACK }} />
    </form>
  );
}

type NumberRangeFieldProps = {
  defaultMax: string;
  defaultMin: string;
  label: string;
  max: number;
  maxId: string;
  maxName: string;
  min: number;
  minId: string;
  minName: string;
  step: number;
};

function NumberRangeField({
  defaultMax,
  defaultMin,
  label,
  max,
  maxId,
  maxName,
  min,
  minId,
  minName,
  step,
}: NumberRangeFieldProps) {
  const [minValue, setMinValue] = useState(() => normalizeNumberValue(defaultMin, min, max, ""));
  const [maxValue, setMaxValue] = useState(() => normalizeNumberValue(defaultMax, min, max, String(max)));
  const minSliderValue = sliderNumber(minValue, min, max);
  const maxSliderValue = sliderNumber(maxValue, min, max);
  const lowerValue = Math.min(minSliderValue, maxSliderValue);
  const upperValue = Math.max(minSliderValue, maxSliderValue);

  return (
    <div className="field full range-field">
      <label>{label}</label>
      <div className="range-input-pair">
        <label className="range-number-box" htmlFor={minId}>
          <span>Min</span>
          <span className="range-number-wrap">
            <span className="range-prefix" aria-hidden="true">$</span>
            <input
              className="range-number-input has-prefix"
              id={minId}
              inputMode="numeric"
              max={max}
              min={min}
              name={minName}
              onChange={(event) => setMinValue(normalizeNumberValue(event.target.value, min, max, ""))}
              placeholder="No min"
              step={step}
              type="number"
              value={minValue}
            />
          </span>
        </label>
        <label className="range-number-box" htmlFor={maxId}>
          <span>Max</span>
          <span className="range-number-wrap">
            <span className="range-prefix" aria-hidden="true">$</span>
            <input
              className="range-number-input has-prefix"
              id={maxId}
              inputMode="numeric"
              max={max}
              min={min}
              name={maxName}
              onChange={(event) => setMaxValue(normalizeNumberValue(event.target.value, min, max, String(max)))}
              placeholder="No max"
              step={step}
              type="number"
              value={maxValue}
            />
          </span>
        </label>
      </div>
      <div className="range-control dual" style={rangeStyle(lowerValue, upperValue, min, max)}>
        <span className="range-track" aria-hidden="true" />
        <input
          aria-label={`${label} minimum`}
          className="profile-range"
          max={max}
          min={min}
          onChange={(event) => {
            const next = Math.min(Number(event.target.value), maxSliderValue);
            setMinValue(next === min ? "" : String(next));
          }}
          step={step}
          type="range"
          value={minSliderValue}
        />
        <input
          aria-label={`${label} maximum`}
          className="profile-range"
          max={max}
          min={min}
          onChange={(event) => {
            const next = Math.max(Number(event.target.value), minSliderValue);
            setMaxValue(String(next));
          }}
          step={step}
          type="range"
          value={maxSliderValue}
        />
      </div>
    </div>
  );
}

type NumberSliderFieldProps = {
  defaultValue: string;
  id: string;
  label: string;
  max: number;
  min: number;
  name: string;
  placeholder: string;
  step: number;
  suffix: string;
};

function NumberSliderField({
  defaultValue,
  id,
  label,
  max,
  min,
  name,
  placeholder,
  step,
  suffix,
}: NumberSliderFieldProps) {
  const [value, setValue] = useState(() => normalizeNumberValue(defaultValue, min, max, ""));
  const sliderValue = sliderNumber(value, min, max);

  return (
    <div className="field range-field">
      <label htmlFor={id}>{label}</label>
      <span className="range-number-wrap">
        <input
          className="range-number-input"
          id={id}
          inputMode="numeric"
          max={max}
          min={min}
          name={name}
          onChange={(event) => setValue(normalizeNumberValue(event.target.value, min, max, ""))}
          placeholder={placeholder}
          step={step}
          type="number"
          value={value}
        />
        <span className="range-suffix" aria-hidden="true">{suffix}</span>
      </span>
      <div className="range-control single" style={rangeStyle(min, sliderValue, min, max)}>
        <span className="range-track" aria-hidden="true" />
        <input
          aria-label={`${label} slider`}
          className="profile-range"
          max={max}
          min={min}
          onChange={(event) => {
            const next = Number(event.target.value);
            setValue(next === min ? "" : String(next));
          }}
          step={step}
          type="range"
          value={sliderValue}
        />
      </div>
    </div>
  );
}

function normalizeNumberValue(value: string, min: number, max: number, emptyFallback: string) {
  if (value.trim() === "") return emptyFallback;
  const amount = Number(value);
  if (!Number.isFinite(amount)) return emptyFallback;
  return String(Math.max(min, Math.min(max, Math.round(amount))));
}

function sliderNumber(value: string, min: number, max: number) {
  const amount = Number(value);
  if (!Number.isFinite(amount)) return min;
  return Math.max(min, Math.min(max, amount));
}

function rangeStyle(start: number, end: number, min: number, max: number) {
  const startPercent = ((start - min) / (max - min)) * 100;
  const endPercent = ((end - min) / (max - min)) * 100;
  return {
    "--range-start": `${Math.max(0, Math.min(100, startPercent))}%`,
    "--range-end": `${Math.max(0, Math.min(100, endPercent))}%`,
  } as CSSProperties;
}

function formText(formData: FormData, key: string) {
  const value = formData.get(key);
  return typeof value === "string" ? value.trim() : "";
}

function moneyLabel(value: string) {
  const amount = Number(value);
  if (!Number.isFinite(amount) || amount <= 0) return "No minimum";
  if (amount >= 1_000_000) return `$${amount / 1_000_000}M`;
  return `$${amount / 1_000}k`;
}

function rangeLabel(min: string, max: string) {
  return `${moneyLabel(min)} - ${moneyLabel(max)}`;
}

function homeFitLabel(parts: Array<string | undefined>) {
  const facts = parts.filter((part): part is string => Boolean(part));
  return facts.length > 0 ? facts.join(" · ") : "Any home";
}

function summaryFromBuyer(buyer: BuyerForWizard): ReviewSummary {
  const criteria = buyer.criteriaDetails?.[0];
  return {
    budget: rangeLabel(String(buyer.budgetMin || ""), String(buyer.budgetMax || "")),
    downPayment: rangeLabel(String(buyer.downPaymentMin || ""), String(buyer.downPaymentMax || "")),
    homeFit: homeFitLabel([
      criteria?.bedroomsMin ? `${criteria.bedroomsMin}+ bd` : undefined,
      criteria?.bathroomsMin ? `${criteria.bathroomsMin}+ ba` : undefined,
      criteria?.squareFeetMin ? `${criteria.squareFeetMin.toLocaleString()}+ sqft` : undefined,
      criteria?.condition || undefined,
      ...(criteria?.features ?? []),
    ]),
    location: buyer.location || buyer.city || "Not set",
    name: buyer.name || "New buyer",
    purpose: buyer.purpose || "Owner occupy",
    type: buyer.type || "Home Buyer",
  };
}

function summaryFromForm(formData: FormData): ReviewSummary {
  const bedrooms = formText(formData, "bedroomsMin");
  const bathrooms = formText(formData, "bathroomsMin");
  const squareFeet = formText(formData, "squareFeetMin");
  const features = formData.getAll("features").filter((value): value is string => typeof value === "string" && value !== "");
  return {
    budget: rangeLabel(formText(formData, "budgetMin"), formText(formData, "budgetMax")),
    downPayment: rangeLabel(formText(formData, "downPaymentMin"), formText(formData, "downPaymentMax")),
    homeFit: homeFitLabel([
      bedrooms ? `${bedrooms}+ bd` : undefined,
      bathrooms ? `${bathrooms}+ ba` : undefined,
      squareFeet ? `${Number(squareFeet).toLocaleString()}+ sqft` : undefined,
      formText(formData, "condition") || undefined,
      ...features,
    ]),
    location: formText(formData, "desiredLocationText") || formText(formData, "desiredCity") || "Not set",
    name: formText(formData, "displayName") || "New buyer",
    purpose: formText(formData, "buyingPurpose") || "Owner occupy",
    type: formText(formData, "buyerType") || "Home Buyer",
  };
}
