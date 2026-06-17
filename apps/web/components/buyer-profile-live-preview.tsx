"use client";

import { useEffect, useState } from "react";
import type { Badge } from "../lib/mock-data";
import { Avatar } from "./avatar";
import { BadgePill } from "./badge-pill";

type BuyerPreviewInput = {
  avatarUrl?: string;
  budgetMax: number;
  budgetMin: number;
  downPaymentMax: number;
  downPaymentMin: number;
  location: string;
  name: string;
  purpose: string;
};

type PreviewState = {
  budgetMax: string;
  budgetMin: string;
  downPaymentMax: string;
  downPaymentMin: string;
  location: string;
  name: string;
  purpose: string;
};

export function BuyerProfileLivePreview({
  activeBadges,
  buyer,
}: {
  activeBadges: Badge[];
  buyer: BuyerPreviewInput;
}) {
  const [preview, setPreview] = useState<PreviewState>(() => previewFromBuyer(buyer));

  useEffect(() => {
    const form = document.querySelector<HTMLFormElement>("form[data-buyer-profile-wizard]");
    if (!form) return;

    const updatePreview = () => setPreview(previewFromForm(form, buyer));
    updatePreview();

    form.addEventListener("input", updatePreview);
    form.addEventListener("change", updatePreview);
    return () => {
      form.removeEventListener("input", updatePreview);
      form.removeEventListener("change", updatePreview);
    };
  }, [buyer]);

  return (
    <article className="card stack buyer-live-preview">
      <p className="eyebrow">Live preview</p>
      <div style={{ alignItems: "center", display: "flex", flexDirection: "column", gap: 12 }}>
        <div className="profile-photo">
          <Avatar name={preview.name} size="xl" src={buyer.avatarUrl} />
        </div>
        <div style={{ textAlign: "center" }}>
          <h2 style={{ fontSize: 22, margin: 0 }}>{preview.name}</h2>
          <p className="muted small" style={{ marginTop: 4 }}>{preview.location}</p>
        </div>
      </div>
      <div className="summary-grid" style={{ gridTemplateColumns: "1fr" }}>
        <div>
          <span className="summary-label">Budget</span>
          <span className="summary-value">{rangeLabel(preview.budgetMin, preview.budgetMax)}</span>
        </div>
        <div>
          <span className="summary-label">Down payment</span>
          <span className="summary-value">{rangeLabel(preview.downPaymentMin, preview.downPaymentMax)}</span>
        </div>
        <div>
          <span className="summary-label">Buying for</span>
          <span className="summary-value">{preview.purpose || "Owner occupy"}</span>
        </div>
      </div>
      {activeBadges.length > 0 ? (
        <div className="pill-row">
          {activeBadges.map((badge) => (
            <BadgePill badge={badge} key={badge.label} />
          ))}
        </div>
      ) : (
        <p className="muted small">No trust badges yet. Add one below to stand out.</p>
      )}
      <p className="muted small">Finish the steps before sharing the seller-facing page.</p>
    </article>
  );
}

function formText(formData: FormData, key: string) {
  const value = formData.get(key);
  return typeof value === "string" ? value.trim() : "";
}

function moneyLabel(value: string) {
  const amount = Number(value);
  if (!Number.isFinite(amount) || amount <= 0) return "Not set";

  return new Intl.NumberFormat("en-US", {
    currency: "USD",
    maximumFractionDigits: 0,
    style: "currency",
  }).format(amount);
}

function previewFromBuyer(buyer: BuyerPreviewInput): PreviewState {
  return {
    budgetMax: String(buyer.budgetMax || ""),
    budgetMin: String(buyer.budgetMin || ""),
    downPaymentMax: String(buyer.downPaymentMax || ""),
    downPaymentMin: String(buyer.downPaymentMin || ""),
    location: buyer.location || "Not set",
    name: buyer.name || "New buyer",
    purpose: buyer.purpose || "Owner occupy",
  };
}

function previewFromForm(form: HTMLFormElement, buyer: BuyerPreviewInput): PreviewState {
  const formData = new FormData(form);
  const location =
    formText(formData, "desiredLocationText") ||
    formText(formData, "desiredCity") ||
    buyer.location ||
    "Not set";

  return {
    budgetMax: formText(formData, "budgetMax"),
    budgetMin: formText(formData, "budgetMin"),
    downPaymentMax: formText(formData, "downPaymentMax"),
    downPaymentMin: formText(formData, "downPaymentMin"),
    location,
    name: formText(formData, "displayName") || buyer.name || "New buyer",
    purpose: formText(formData, "buyingPurpose") || buyer.purpose || "Owner occupy",
  };
}

function rangeLabel(min: string, max: string) {
  const minLabel = moneyLabel(min);
  const maxLabel = moneyLabel(max);

  if (minLabel === "Not set" && maxLabel === "Not set") return "Not set";
  if (minLabel === "Not set") return `Up to ${maxLabel}`;
  if (maxLabel === "Not set") return `${minLabel}+`;
  return `${minLabel} - ${maxLabel}`;
}
