import { propertyTypeOptions, propertySubtypeFromSeekingPropertyType } from "../lib/property-types";
import { Icon } from "./icon";
import { PropertyTypeArtwork } from "./property-type-artwork";

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
              <PropertyTypeArtwork
                className="property-type-choice-art"
                motion="float"
                sizes="(max-width: 640px) 96px, 104px"
                value={option.value}
              />
              <strong>{option.label}</strong>
              <span className="property-type-choice-check">
                <Icon name="check" size={12} />
              </span>
            </label>
          );
        })}
      </div>
    </fieldset>
  );
}
