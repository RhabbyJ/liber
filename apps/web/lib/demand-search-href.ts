export type DemandSearchParams = {
  amenities?: string | string[];
  area?: string;
  badges?: string | string[];
  bathrooms?: string;
  bedrooms?: string;
  budgetMax?: string;
  budgetMin?: string;
  condition?: string;
  cursor?: string;
  market?: string;
  propertySubtype?: string;
  serviceArea?: string;
  sort?: string;
  squareFeet?: string;
  view?: string;
};

/** The one buyer-demand map lives at the root. */
export const DEMAND_MAP_PATH = "/";

const demandSearchParamKeys = [
  "amenities",
  "badges",
  "bathrooms",
  "bedrooms",
  "budgetMax",
  "budgetMin",
  "condition",
  "cursor",
  "market",
  "propertySubtype",
  "serviceArea",
  "sort",
  "squareFeet",
  "view",
] as const satisfies readonly (keyof DemandSearchParams)[];

/** A map URL that keeps every known search parameter except the removed ones. */
export function demandSearchHref(params: DemandSearchParams, remove: readonly string[] = []) {
  const next = new URLSearchParams();
  for (const key of demandSearchParamKeys) {
    const value = params[key];
    if (remove.includes(key) || value === undefined || value === "") continue;
    if (Array.isArray(value)) value.forEach((item) => next.append(key, item));
    else next.set(key, value);
  }
  return demandSearchPath(next);
}

export function demandSearchPath(params: URLSearchParams) {
  const query = params.toString();
  return query ? `${DEMAND_MAP_PATH}?${query}` : DEMAND_MAP_PATH;
}
