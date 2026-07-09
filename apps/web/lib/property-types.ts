export const propertyTypeOptions = [
  { label: "House", value: "HOME" },
  { label: "Condo", value: "CONDO" },
  { label: "Townhouse", value: "TOWNHOUSE" },
  { label: "Manufactured", value: "MANUFACTURED" },
  { label: "Land", value: "LAND" },
] as const;

export type PropertySubtype = (typeof propertyTypeOptions)[number]["value"];

const propertySubtypeLabels = Object.fromEntries(
  propertyTypeOptions.map((option) => [option.value, option.label]),
) as Record<PropertySubtype, string>;

export function propertySubtypeLabel(value?: string | null) {
  return propertySubtypeLabels[value as PropertySubtype] ?? "Property";
}

export function propertySubtypeFromSeekingPropertyType(value: unknown): PropertySubtype {
  if (typeof value !== "string") return "HOME";

  const normalized = value.trim().toLowerCase();
  if (normalized === "condo") return "CONDO";
  if (normalized === "townhouse") return "TOWNHOUSE";
  if (normalized === "manufactured") return "MANUFACTURED";
  if (normalized === "land") return "LAND";
  return "HOME";
}
