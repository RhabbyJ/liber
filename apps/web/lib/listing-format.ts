type CriteriaLike = {
  bathroomsMin?: number;
  bedroomsMin?: number;
  lotSizeMin?: number;
  squareFeetMin?: number;
};

export type ListingFact = {
  label: string;
  value: string;
};

export function compactMoney(value?: number | null) {
  if (!value || !Number.isFinite(value) || value <= 0) return "";
  if (value >= 1_000_000) {
    const millions = value / 1_000_000;
    return `$${millions.toFixed(millions >= 10 ? 1 : 2).replace(/\.?0+$/, "")}M`;
  }
  return `$${Math.round(value / 1000)}K`;
}

export function compactBudgetRange(min?: number | null, max?: number | null) {
  const low = compactMoney(min);
  const high = compactMoney(max);
  if (low && high) return low === high ? low : `${low} – ${high}`;
  if (high) return `Up to ${high}`;
  if (low) return `${low}+`;
  return "Budget not set";
}

/** Zillow-style "3 bds | 2 ba | 1,500 sqft" facts, expressed as buyer minimums. */
export function criteriaFacts(criteria?: CriteriaLike | null): ListingFact[] {
  if (!criteria) return [];
  const facts: ListingFact[] = [];
  if (criteria.bedroomsMin) facts.push({ label: "bds", value: `${criteria.bedroomsMin}+` });
  if (criteria.bathroomsMin) facts.push({ label: "ba", value: `${criteria.bathroomsMin}+` });
  if (criteria.squareFeetMin) facts.push({ label: "sqft", value: `${criteria.squareFeetMin.toLocaleString("en-US")}+` });
  else if (criteria.lotSizeMin) facts.push({ label: "sqft lot", value: `${criteria.lotSizeMin.toLocaleString("en-US")}+` });
  return facts;
}

export function seekingLabel(propertyType?: string | null) {
  const value = propertyType?.trim();
  if (!value || value.toLowerCase() === "buyer") return "Buyer demand";
  return `Seeking ${value.toLowerCase()}`;
}

export function pinBudgetLabel(min?: number | null, max?: number | null) {
  return compactMoney(max || min) || "Buyer";
}
