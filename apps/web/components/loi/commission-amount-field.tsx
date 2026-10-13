"use client";

import { validLoiCommissionAmount } from "@liber/validators";
import { useEffect, useRef, useState } from "react";
import { readCommissionAmount, selectCommissionAmountUnit, writeCommissionAmount, type CommissionAmountUnit } from "./commission-amount-value";
import "./commission-amount-field.css";

export function CommissionAmountField({ error, id, label, onChange, required = false, value }: {
  error?: string;
  id: string;
  label: string;
  onChange: (value: string) => void;
  required?: boolean;
  value: string;
}) {
  const [input, setInput] = useState(() => readCommissionAmount(value));
  const lastValue = useRef(value);
  useEffect(() => {
    if (value === lastValue.current) return;
    lastValue.current = value;
    setInput(readCommissionAmount(value));
  }, [value]);

  const percent = input.unit === "PERCENT";
  const serialized = writeCommissionAmount(input);
  const localError = input.amount.trim() && !validLoiCommissionAmount(serialized)
    ? percent ? "Enter a percentage from 0 to 100, with up to two decimal places." : "Enter a dollar amount with up to two decimal places."
    : undefined;
  const visibleError = localError || error;

  function chooseUnit(unit: CommissionAmountUnit) {
    const next = selectCommissionAmountUnit(input, unit);
    if (next === input) return;
    setInput(next);
    lastValue.current = "";
    onChange("");
  }

  return (
    <div className="field loi-commission-field">
      <label htmlFor={id}>{label}</label>
      <div aria-label={`${label} unit`} className="loi-commission-units" role="group">
        <button aria-pressed={percent} onClick={() => chooseUnit("PERCENT")} type="button">Percent (%)</button>
        <button aria-pressed={!percent} onClick={() => chooseUnit("DOLLAR")} type="button">Dollar amount ($)</button>
      </div>
      <div className={`loi-commission-input ${percent ? "is-percent" : "is-dollar"}`}>
        <span aria-hidden="true">{percent ? "%" : "$"}</span>
        <input
          aria-describedby={`${id}-hint${visibleError ? ` ${id}-error` : ""}`}
          aria-invalid={visibleError ? true : undefined}
          id={id}
          inputMode="decimal"
          maxLength={79}
          onBlur={() => {
            if (serialized && validLoiCommissionAmount(serialized)) {
              setInput({ ...input, amount: readCommissionAmount(serialized).amount });
            }
          }}
          onChange={(event) => {
            const next = { ...input, amount: event.target.value };
            setInput(next);
            const nextValue = writeCommissionAmount(next);
            lastValue.current = nextValue;
            onChange(nextValue);
          }}
          placeholder={percent ? "e.g. 2.5" : "e.g. 10,000"}
          required={required}
          type="text"
          value={input.amount}
        />
      </div>
      <span className="field-hint" id={`${id}-hint`}>{percent ? "Percentage of the sales price." : "Enter the dollar amount."}</span>
      {visibleError ? <p className="field-hint invalid loi-field-error" id={`${id}-error`}>{visibleError}</p> : null}
    </div>
  );
}
