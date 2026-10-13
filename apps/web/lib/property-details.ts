export const propertyConditionOptions = ["Move-in ready", "Mild fixer", "Fixer"] as const;

export const propertyFeatureOptions = [
  "Pool", "Fireplace", "Garage", "Parking", "ADU", "Yard", "Single story", "Central air conditioning",
] as const;

export function propertyFeatureChoices(savedFeatures: string[] = []) {
  const choices = new Map<string, { label: string; selected: boolean; value: string }>(
    propertyFeatureOptions.map((value) => [value.toLowerCase(), { label: value, selected: false, value }]),
  );
  for (const saved of savedFeatures) {
    const value = saved.trim();
    if (!value) continue;
    const key = value.toLowerCase();
    const existing = choices.get(key);
    choices.set(key, existing ? { ...existing, selected: true } : { label: value, selected: true, value });
  }
  return [...choices.values()];
}
