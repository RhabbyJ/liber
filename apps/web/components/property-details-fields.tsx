import { propertyConditionOptions, propertyFeatureChoices } from "../lib/property-details";
import styles from "./property-details-fields.module.css";

export function PropertyDetailsFields({ condition = "", features = [] }: { condition?: string; features?: string[] }) {
  const historicalCondition = condition && !propertyConditionOptions.some((option) => option === condition);
  return (
    <>
      <div className="field">
        <label htmlFor="condition">Condition</label>
        <select defaultValue={condition} id="condition" name="condition">
          <option value="">Not specified</option>
          {propertyConditionOptions.map((option) => <option key={option} value={option}>{option}</option>)}
          {historicalCondition ? <option value={condition}>{condition} (previously saved)</option> : null}
        </select>
      </div>
      <fieldset aria-describedby="property-features-hint" className={`field full ${styles.fieldset}`}>
        <legend>Property features</legend>
        <p className="field-hint" id="property-features-hint">Select everything this property includes.</p>
        <input name="features" type="hidden" value="" />
        <div className={styles.choices}>
          {propertyFeatureChoices(features).map((feature) => (
            <label className={styles.choice} key={feature.value}>
              <input defaultChecked={feature.selected} name="features" type="checkbox" value={feature.value} />
              {feature.label}
            </label>
          ))}
        </div>
      </fieldset>
    </>
  );
}

export function PropertyFeatureSummary({ condition, features = [] }: { condition?: string; features?: string[] }) {
  const labels = [...new Set([condition, ...features].filter((value): value is string => Boolean(value?.trim())))];
  if (!labels.length) return null;
  return <ul aria-label="Property condition and features" className={styles.summary}>{labels.map((label) => <li className="pill" key={label}>{label}</li>)}</ul>;
}
