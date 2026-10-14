"use client";

import { useState } from "react";
import { serviceAreaDisplayLabel } from "../lib/service-areas";
import { Icon } from "./icon";
import { ServiceAreaCombobox } from "./service-area-combobox";

type Props = {
  defaultLocation?: string;
  defaultServiceAreaSlug?: string;
  inputId: string;
  label: string;
  marketSlug: string;
};

export function LocationLookupFields({
  defaultLocation = "",
  defaultServiceAreaSlug = "",
  inputId,
  label,
  marketSlug,
}: Props) {
  const [selectedLabel, setSelectedLabel] = useState(defaultServiceAreaSlug ? defaultLocation : "");
  const [serviceAreaSlug, setServiceAreaSlug] = useState(defaultServiceAreaSlug);
  const [hasTyped, setHasTyped] = useState(false);

  return (
    <>
      <div className="field full">
        <label htmlFor={inputId}>{label}</label>
        <ServiceAreaCombobox
          ariaLabel={label}
          className="buyer-location-lookup"
          clearLabel="Clear target area"
          defaultValue={selectedLabel || defaultLocation}
          inputId={inputId}
          marketSlug={marketSlug}
          onClear={() => {
            setSelectedLabel("");
            setServiceAreaSlug("");
          }}
          onQueryChange={() => {
            setHasTyped(true);
            setServiceAreaSlug("");
          }}
          onSelect={(area) => {
            setSelectedLabel(serviceAreaDisplayLabel(area));
            setServiceAreaSlug(area.slug);
            setHasTyped(false);
          }}
          placeholder="Search city, neighborhood, or ZIP"
        />
        <span
          aria-live="polite"
          className={`location-selection-status ${serviceAreaSlug ? "selected" : ""}`}
          id={`${inputId}-selection`}
        >
          {serviceAreaSlug ? <Icon name="check" size={16} /> : null}
          {serviceAreaSlug
            ? `Selected area: ${selectedLabel || defaultLocation}`
            : hasTyped
              ? "Choose a matching area from the list."
              : "Start typing, then choose a matching area."}
        </span>
      </div>
      <input name="desiredServiceAreaSlug" type="hidden" value={serviceAreaSlug} />
      <input name="desiredMarketSlug" type="hidden" value={marketSlug} />
    </>
  );
}
