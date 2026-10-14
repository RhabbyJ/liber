"use client";

import { useState, type CSSProperties } from "react";
import { BUYER_BUDGET_MAX, buyerBudgetIndex, buyerBudgetStops, formatBuyerBudget, moveBuyerBudget, readBuyerBudget } from "./buyer-budget-values";
import "./buyer-budget-range.css";

export function BuyerBudgetRange({ defaultMin, defaultMax }: { defaultMin: string; defaultMax: string }) {
  const [minimum, setMinimum] = useState(defaultMin);
  const [maximum, setMaximum] = useState(defaultMax);
  const [typing, setTyping] = useState(false);
  const min = readBuyerBudget(minimum);
  const max = readBuyerBudget(maximum);
  const stops = buyerBudgetStops(min, max);
  const last = stops.length - 1;
  const minIndex = buyerBudgetIndex(stops, min, 0);
  const maxIndex = buyerBudgetIndex(stops, max, last);
  // Partial keystrokes (typing "6" toward $600,000) are transiently below the minimum; judge the range once the box is left.
  const reversed = !typing && min !== null && max !== null && min > max;
  const style = { "--budget-start": `${Math.min(minIndex, maxIndex) / last * 100}%`, "--budget-end": `${Math.max(minIndex, maxIndex) / last * 100}%` } as CSSProperties;

  return (
    <fieldset className="field full buyer-budget-range" style={style}>
      <legend>Budget range (required)</legend>
      <p className="buyer-budget-value">
        {min === null && max === null ? "Choose your price range" : `${min === null ? "Set minimum" : formatBuyerBudget(min)} – ${max === null ? "Set maximum" : formatBuyerBudget(max)}`}
      </p>
      <div className="buyer-budget-track">
        <div className="buyer-budget-rail" aria-hidden="true" />
        <input aria-label="Minimum budget slider" aria-describedby="budget-range-hint" aria-valuetext={min === null ? "Minimum not selected" : formatBuyerBudget(min)} className={`buyer-budget-handle ${minIndex === last ? "buyer-budget-handle-front" : ""}`} type="range" min={0} max={last} step={1} value={minIndex} onChange={(event) => setMinimum(String(moveBuyerBudget(stops, Number(event.target.value), "min", max)))} />
        <input aria-label="Maximum budget slider" aria-describedby="budget-range-hint" aria-valuetext={max === null ? "Maximum not selected" : formatBuyerBudget(max)} className="buyer-budget-handle" type="range" min={0} max={last} step={1} value={maxIndex} onChange={(event) => setMaximum(String(moveBuyerBudget(stops, Number(event.target.value), "max", min)))} />
      </div>
      <div className="buyer-budget-scale" aria-hidden="true"><span>$0</span><span style={{ left: `${buyerBudgetIndex(stops, 500_000, 0) / last * 100}%` }}>$500k</span><span style={{ left: `${buyerBudgetIndex(stops, 1_000_000, 0) / last * 100}%` }}>$1M</span><span>{stops[last] === 10_000_000 ? "$10M" : formatBuyerBudget(stops[last])}</span></div>
      <div className="range-input-pair">
        <label className="range-number-box" htmlFor="budgetMin">
          <span>Min</span><span className="range-number-wrap"><span className="range-prefix" aria-hidden="true">$</span>
            <input aria-describedby="budget-range-hint budget-range-error" aria-invalid={reversed || undefined} className="range-number-input has-prefix" id="budgetMin" inputMode="decimal" min={0} max={BUYER_BUDGET_MAX} name="budgetMin" placeholder="Minimum price" required step="any" type="number" value={minimum} onBlur={() => setTyping(false)} onChange={(event) => setMinimum(event.target.value)} onFocus={() => setTyping(true)} />
          </span>
        </label>
        <span className="range-to" aria-hidden="true">–</span>
        <label className="range-number-box" htmlFor="budgetMax">
          <span>Max</span><span className="range-number-wrap"><span className="range-prefix" aria-hidden="true">$</span>
            <input aria-describedby="budget-range-hint budget-range-error" aria-invalid={reversed || undefined} className="range-number-input has-prefix" id="budgetMax" inputMode="decimal" min={0} max={BUYER_BUDGET_MAX} name="budgetMax" placeholder="Maximum price" required step="any" type="number" value={maximum} onBlur={() => setTyping(false)} onChange={(event) => setMaximum(event.target.value)} onFocus={() => setTyping(true)} />
          </span>
        </label>
      </div>
      <p className="field-hint" id="budget-range-hint">Drag the handles or type an exact amount.</p>
      <p className="field-hint invalid" id="budget-range-error" role={reversed ? "alert" : undefined}>{reversed ? "Minimum budget must be at or below maximum budget." : ""}</p>
    </fieldset>
  );
}
