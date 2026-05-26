"use client";

import Link from "next/link";
import { useState } from "react";
import { Icon } from "./icon";
import { LocationLookupFields } from "./location-lookup-fields";

const budgetMinOptions = [
  { label: "No minimum", value: "" },
  { label: "$500k", value: "500000" },
  { label: "$750k", value: "750000" },
  { label: "$1M", value: "1000000" },
  { label: "$1.5M", value: "1500000" },
  { label: "$2M", value: "2000000" },
];

const budgetMaxOptions = [
  { label: "$500k", value: "500000" },
  { label: "$750k", value: "750000" },
  { label: "$1M", value: "1000000" },
  { label: "$1.5M", value: "1500000" },
  { label: "$2M", value: "2000000" },
  { label: "$3M+", value: "3000000" },
];

const downPaymentOptions = [
  { label: "No minimum", value: "" },
  { label: "$50k", value: "50000" },
  { label: "$100k", value: "100000" },
  { label: "$200k", value: "200000" },
  { label: "$300k", value: "300000" },
  { label: "$500k+", value: "500000" },
];

const buyerTypeOptions = ["Home Buyer", "Investor", "Cash Buyer", "Move-up Buyer", "Downsizing Buyer"];
const buyingPurposeOptions = ["Owner occupy", "Rental", "Fix and flip", "Other"];

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
};

const STEPS = [
  { key: 1, label: "Who you are", helper: "Name and intent" },
  { key: 2, label: "Your budget", helper: "Price + down payment" },
  { key: 3, label: "Your story", helper: "A few sentences" },
] as const;

export function BuyerProfileWizard({
  action,
  buyer,
}: {
  action: (formData: FormData) => Promise<void>;
  buyer: BuyerForWizard;
}) {
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const total = STEPS.length;
  const progress = (step / total) * 100;

  return (
    <form action={action} className="wizard stack loose" encType="multipart/form-data">
      <header className="wizard-header stack">
        <div className="wizard-progress" aria-hidden="true">
          <div className="wizard-progress-fill" style={{ width: `${progress}%` }} />
        </div>
        <ol className="wizard-steps" aria-label="Profile steps">
          {STEPS.map((s) => {
            const isActive = step === s.key;
            const isDone = step > s.key;
            return (
              <li key={s.key} className={`wizard-step ${isActive ? "active" : ""} ${isDone ? "done" : ""}`}>
                <button
                  aria-current={isActive ? "step" : undefined}
                  className="wizard-step-button"
                  onClick={() => setStep(s.key)}
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
        <section className="wizard-pane" hidden={step !== 1} aria-hidden={step !== 1}>
          <div className="section-stack">
            <p className="eyebrow">Step 1 of {total}</p>
            <h2>Who you are</h2>
            <p className="muted small">Sellers see this card first. Keep it clear and human.</p>
          </div>
          <div className="form-grid">
            <div className="field">
              <label htmlFor="displayName">Display name</label>
              <input id="displayName" name="displayName" defaultValue={buyer.name} placeholder="Julie P." />
              <span className="field-hint">Most buyers use first name + last initial.</span>
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

        <section className="wizard-pane" hidden={step !== 2} aria-hidden={step !== 2}>
          <div className="section-stack">
            <p className="eyebrow">Step 2 of {total}</p>
            <h2>Your budget</h2>
            <p className="muted small">Ranges, not exact numbers. Sellers filter against this.</p>
          </div>
          <div className="form-grid">
            <div className="field">
              <label htmlFor="budgetMin">Budget min</label>
              <select id="budgetMin" name="budgetMin" defaultValue={String(buyer.budgetMin || "")}>
                {budgetMinOptions.map((option) => (
                  <option key={option.label} value={option.value}>{option.label}</option>
                ))}
              </select>
            </div>
            <div className="field">
              <label htmlFor="budgetMax">Budget max</label>
              <select id="budgetMax" name="budgetMax" defaultValue={String(buyer.budgetMax || "1000000")}>
                {budgetMaxOptions.map((option) => (
                  <option key={option.label} value={option.value}>{option.label}</option>
                ))}
              </select>
            </div>
            <div className="field">
              <label htmlFor="downPaymentMin">Down payment min</label>
              <select id="downPaymentMin" name="downPaymentMin" defaultValue={String(buyer.downPaymentMin || "")}>
                {downPaymentOptions.map((option) => (
                  <option key={option.label} value={option.value}>{option.label}</option>
                ))}
              </select>
            </div>
            <div className="field">
              <label htmlFor="downPaymentMax">Down payment max</label>
              <select id="downPaymentMax" name="downPaymentMax" defaultValue={String(buyer.downPaymentMax || "200000")}>
                {downPaymentOptions.slice(1).map((option) => (
                  <option key={option.label} value={option.value}>{option.label}</option>
                ))}
              </select>
            </div>
          </div>
        </section>

        <section className="wizard-pane" hidden={step !== 3} aria-hidden={step !== 3}>
          <div className="section-stack">
            <p className="eyebrow">Step 3 of {total}</p>
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
          <p className="muted small">
            Want to fine-tune bedrooms, baths, lot size, and features? <Link href="/buyer/criteria">Edit search criteria →</Link>
          </p>
        </section>
      </div>

      <footer className="wizard-footer actions between">
        <button
          className="button ghost"
          disabled={step === 1}
          onClick={() => setStep((s) => (s > 1 ? ((s - 1) as 1 | 2 | 3) : s))}
          type="button"
        >
          Back
        </button>
        {step < total ? (
          <button
            className="button primary"
            onClick={() => setStep((s) => (s < total ? ((s + 1) as 1 | 2 | 3) : s))}
            type="button"
          >
            Continue
            <Icon name="arrow-right" size={14} />
          </button>
        ) : (
          <button className="button primary" name="visibilityStatus" type="submit" value="ACTIVE">
            <Icon name="sparkle" size={14} />
            Submit profile
          </button>
        )}
      </footer>
    </form>
  );
}
