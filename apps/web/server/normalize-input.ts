const nullableBlankFields = new Set([
  "desiredServiceAreaSlug",
]);

export function normalizeInput(input: unknown) {
  if (!(input instanceof FormData)) return input;

  const output: Record<string, unknown> = {};

  for (const key of Array.from(input.keys())) {
    const rawValues = input.getAll(key);
    const values = rawValues.filter((value) => value !== "");
    if (values.length === 0 && nullableBlankFields.has(key) && rawValues.length > 0) {
      output[key] = null;
      continue;
    }
    if (values.length === 0) continue;

    output[key] = values.length > 1 ? values : values[0];
  }

  if (typeof output.features === "string" || Array.isArray(output.features)) {
    const rawFeatures = Array.isArray(output.features) ? output.features : [output.features];
    output.features = Array.from(new Set(
      rawFeatures
        .filter((value): value is string => typeof value === "string")
        .flatMap((value) => value.split(","))
        .map((value) => value.trim())
        .filter(Boolean),
    ));
  }

  if (typeof output.termsAccepted === "string") {
    output.termsAccepted = output.termsAccepted === "true" || output.termsAccepted === "on";
  }

  if (typeof output.ownershipConfirmed === "string") {
    output.ownershipConfirmed = output.ownershipConfirmed === "true" || output.ownershipConfirmed === "on";
  }

  for (const key of ["identityMatchesOwner", "authorityConfirmed", "addressMatchesProperty", "ownerOrEntityMatches"]) {
    if (typeof output[key] === "string") output[key] = output[key] === "true" || output[key] === "on";
  }

  return output;
}
