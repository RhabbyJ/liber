import { propertyTypeOptions, propertySubtypeFromSeekingPropertyType, type PropertySubtype } from "../lib/property-types";
import { Icon, type IconName } from "./icon";

const typeIcons: Record<PropertySubtype, IconName> = {
  CONDO: "condo",
  HOME: "home",
  LAND: "land",
  MANUFACTURED: "manufactured",
  TOWNHOUSE: "townhouse",
};

/** Redfin-style home-type tiles: a line icon over the label, one native radio per tile. */
export function PropertyTypePicker({
  defaultValue,
  legend,
  name,
  required = false,
  valueMode = "subtype",
}: {
  defaultValue?: string | null;
  legend: string;
  name: string;
  required?: boolean;
  valueMode?: "label" | "subtype";
}) {
  const selectedSubtype = propertySubtypeFromSeekingPropertyType(defaultValue);

  return (
    <fieldset className="field full property-type-picker">
      <legend>{legend}</legend>
      <div className="property-type-options">
        {propertyTypeOptions.map((option) => {
          const id = `${name}-${option.value.toLowerCase()}`;
          const value = valueMode === "label" ? option.label : option.value;

          return (
            <label className="property-type-choice" htmlFor={id} key={option.value}>
              <input
                defaultChecked={selectedSubtype === option.value}
                id={id}
                name={name}
                required={required}
                type="radio"
                value={value}
              />
              <Icon className="property-type-choice-icon" name={typeIcons[option.value]} size={28} />
              <strong>{option.label}</strong>
            </label>
          );
        })}
      </div>
    </fieldset>
  );
}
