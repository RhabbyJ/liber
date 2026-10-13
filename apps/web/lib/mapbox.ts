export function mapboxServiceAreaQueries(feature: Record<string, unknown>) {
  const properties = recordValue(feature.properties);
  const context = recordValue(properties.context);
  const typedPostcode = properties.feature_type === "postcode" ? properties.name : recordValue(context.postcode).name;
  const typedPlace = properties.feature_type === "place" ? properties.name : recordValue(context.place).name;
  return [typedPostcode, typedPlace]
    .filter((value): value is string => typeof value === "string" && Boolean(value.trim()))
    .map((value) => value.trim());
}

function recordValue(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" ? value as Record<string, unknown> : {};
}
