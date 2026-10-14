import type { ServiceAreaType } from "./service-areas";

/**
 * Deterministic in-memory ranking over reviewed service-area search terms.
 *
 * Resolution (auto-select) only uses the exact tiers that the database lookup
 * has always used: slug, postal code, label, then reviewed term. Everything
 * looser (word prefixes, token reordering, spacing, abbreviations, typos)
 * only produces suggestions that a person must choose explicitly.
 */

export type SearchableServiceArea = {
  city: string | null;
  label: string;
  postalCode: string | null;
  slug: string;
  type: ServiceAreaType;
};

export type ServiceAreaMatchKind = "exact" | "prefix" | "word" | "fuzzy";

export type ServiceAreaSearchHit<T> = {
  area: T;
  exact: boolean;
  match: ServiceAreaMatchKind;
  /** Reviewed alias that matched when it differs from the area's own name, e.g. a ZIP's "woodland hills". */
  matchedTerm?: string;
};

export type ServiceAreaSearchResolution<T> =
  | { status: "none" }
  | { status: "resolved"; area: T }
  | { status: "ambiguous"; areas: T[] };

export type ServiceAreaSearchResult<T> = {
  resolution: ServiceAreaSearchResolution<T>;
  suggestions: ServiceAreaSearchHit<T>[];
};

type Candidate = {
  compact: string;
  text: string;
  tokens: string[];
};

type IndexedArea<T> = {
  area: T;
  candidates: Candidate[];
  labelText: string;
  postalCode: string;
  slugText: string;
  sortLabel: string;
  terms: ReadonlySet<string>;
  typeRank: number;
};

const MAX_SUGGESTIONS = 8;
const TRAILING_REGION_TOKENS = ["ca", "calif", "california", "us", "usa", "united states"];
// Abbreviations are applied only to looser suggestion matching, never to exact resolution.
const TOKEN_EQUIVALENTS: Record<string, string> = {
  e: "east",
  ft: "fort",
  hts: "heights",
  mt: "mount",
  mtn: "mountain",
  n: "north",
  ne: "northeast",
  nw: "northwest",
  pk: "park",
  s: "south",
  se: "southeast",
  st: "saint",
  sw: "southwest",
  w: "west",
};
const TYPE_RANK: Record<ServiceAreaType, number> = { city: 0, neighborhood: 1, zip: 2, custom: 3 };

export function normalizeServiceAreaQuery(value: string) {
  return value
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

export function createServiceAreaSearchIndex<T extends SearchableServiceArea>(
  entries: ReadonlyArray<{ area: T; terms: readonly string[] }>,
) {
  const indexed: IndexedArea<T>[] = [];
  for (const { area, terms } of entries) {
    const reviewed = new Set(terms.map(normalizeServiceAreaQuery).filter(Boolean));
    // Areas without reviewed terms fail closed, exactly like the indexed SQL join.
    if (reviewed.size === 0) continue;
    const labelText = normalizeServiceAreaQuery(area.label);
    const slugText = area.slug.replace(/-/g, " ");
    const postalCode = area.postalCode ?? "";
    const texts = new Set([labelText, slugText, postalCode, ...reviewed].filter(Boolean));
    indexed.push({
      area,
      candidates: [...texts].map(candidateFor),
      labelText,
      postalCode,
      slugText,
      sortLabel: labelText,
      terms: reviewed,
      typeRank: TYPE_RANK[area.type] ?? 3,
    });
  }

  return {
    size: indexed.length,
    search(query: string, limit = MAX_SUGGESTIONS): ServiceAreaSearchResult<T> {
      return searchIndex(indexed, query, Math.min(Math.max(Math.trunc(limit) || 1, 1), MAX_SUGGESTIONS));
    },
  };
}

export type ServiceAreaSearchIndex<T extends SearchableServiceArea> = ReturnType<typeof createServiceAreaSearchIndex<T>>;

function searchIndex<T extends SearchableServiceArea>(
  indexed: IndexedArea<T>[],
  rawQuery: string,
  limit: number,
): ServiceAreaSearchResult<T> {
  const query = queryText(rawQuery);
  if (!query) return { resolution: { status: "none" }, suggestions: [] };

  const regionless = stripTrailingRegion(query);
  const exactQueries = regionless && regionless !== query ? [query, regionless] : [query];
  const exactTiers = indexed.map((entry) => bestExactTier(entry, exactQueries));
  const bestTier = Math.min(...exactTiers);
  const exactAreas = Number.isFinite(bestTier)
    ? indexed.filter((_, position) => exactTiers[position] === bestTier)
    : [];

  const looseQueries = uniqueQueries([query, regionless, stripTrailingPostal(regionless || query)]);
  type Scored = { entry: IndexedArea<T>; exact: boolean; match: ServiceAreaMatchKind; score: number; text?: string };
  const scored = indexed.flatMap((entry, position): Scored[] => {
    const tier = exactTiers[position];
    if (Number.isFinite(tier)) {
      const term = tier === 4 ? exactQueries.find((candidate) => entry.terms.has(candidate)) : undefined;
      return [{ entry, exact: tier === bestTier, match: "exact", score: 1000 - tier * 10, text: term }];
    }
    const loose = bestLooseScore(entry, looseQueries);
    return loose ? [{ entry, exact: false, ...loose }] : [];
  });

  // Typo tolerance is a fallback: once anything matches as typed, near-misses are noise.
  if (scored.some((item) => item.match !== "fuzzy")) {
    for (let index = scored.length - 1; index >= 0; index -= 1) {
      if (scored[index].match === "fuzzy") scored.splice(index, 1);
    }
  }

  // ZIP-shaped input should list ZIP areas ahead of communities that carry ZIP aliases.
  const typeRank = /^\d+$/.test(query)
    ? (entry: IndexedArea<T>) => (entry.area.type === "zip" ? -1 : entry.typeRank)
    : (entry: IndexedArea<T>) => entry.typeRank;
  scored.sort((left, right) =>
    right.score - left.score
    || Number(right.exact) - Number(left.exact)
    || typeRank(left.entry) - typeRank(right.entry)
    || left.entry.sortLabel.length - right.entry.sortLabel.length
    || compareText(left.entry.sortLabel, right.entry.sortLabel)
    || compareText(left.entry.area.slug, right.entry.area.slug),
  );

  return {
    resolution: resolutionFor(exactAreas.map((entry) => entry.area)),
    suggestions: scored.slice(0, limit).map(({ entry, exact, match, text }) => {
      const matchedTerm = text && isAlias(entry, text) ? text : undefined;
      return { area: entry.area, exact, match, ...(matchedTerm ? { matchedTerm } : {}) };
    }),
  };
}

function queryText(rawQuery: string) {
  const zipPlusFour = rawQuery.trim().match(/^(\d{5})-\d{4}$/);
  return normalizeServiceAreaQuery(zipPlusFour ? zipPlusFour[1] : rawQuery);
}

function bestExactTier<T extends SearchableServiceArea>(entry: IndexedArea<T>, queries: string[]) {
  let best = Infinity;
  for (const query of queries) {
    if (entry.slugText === query) best = Math.min(best, 1);
    else if (entry.postalCode === query) best = Math.min(best, 2);
    else if (entry.labelText === query) best = Math.min(best, 3);
    else if (entry.terms.has(query)) best = Math.min(best, 4);
  }
  return best;
}

function bestLooseScore<T extends SearchableServiceArea>(entry: IndexedArea<T>, queries: string[]) {
  let best: { match: ServiceAreaMatchKind; score: number; text: string } | null = null;
  for (const query of queries) {
    const queryTokens = canonicalTokens(query);
    const queryCompact = query.replace(/ /g, "");
    for (const candidate of entry.candidates) {
      const result = looseScore(query, queryTokens, queryCompact, candidate);
      if (result && (!best || result.score > best.score)) best = { ...result, text: candidate.text };
    }
  }
  return best;
}

function isAlias<T extends SearchableServiceArea>(entry: IndexedArea<T>, text: string) {
  if (text === entry.labelText || text === entry.slugText || text === entry.postalCode) return false;
  // Name variants such as "granada hills ca" or "los angeles granada hills" add nothing.
  return entry.terms.has(text) && !text.includes(entry.labelText);
}

function looseScore(
  query: string,
  queryTokens: string[],
  queryCompact: string,
  candidate: Candidate,
): { match: ServiceAreaMatchKind; score: number } | null {
  if (candidate.text.startsWith(query)) return { match: "prefix", score: 900 };
  if (queryCompact.length >= 3 && candidate.compact.startsWith(queryCompact)) return { match: "prefix", score: 880 };
  if (/^\d+$/.test(query)) return null;

  const tokenMatch = matchTokens(queryTokens, candidate.tokens);
  if (tokenMatch && tokenMatch.edits === 0) {
    return tokenMatch.anchored ? { match: "prefix", score: 860 } : { match: "word", score: 700 };
  }
  if (tokenMatch && query.length >= 4) {
    return { match: "fuzzy", score: 500 - tokenMatch.edits * 60 + (tokenMatch.anchored ? 20 : 0) };
  }
  if (queryCompact.length >= 5) {
    const edits = boundedEditDistance(queryCompact, candidate.compact.slice(0, queryCompact.length + 1), allowedEdits(queryCompact));
    const shorter = boundedEditDistance(queryCompact, candidate.compact.slice(0, queryCompact.length), allowedEdits(queryCompact));
    const distance = Math.min(edits, shorter);
    if (distance <= allowedEdits(queryCompact)) return { match: "fuzzy", score: 440 - distance * 60 };
  }
  return null;
}

/**
 * Match every query token to a distinct candidate token. The final query token
 * may be a partial word that is still being typed. Returns total typo edits and
 * whether the first query token matched the first candidate word.
 */
function matchTokens(queryTokens: string[], candidateTokens: string[]) {
  if (queryTokens.length === 0 || queryTokens.length > candidateTokens.length) return null;
  const used = new Set<number>();
  let edits = 0;
  let anchored = false;
  for (let index = 0; index < queryTokens.length; index += 1) {
    const token = queryTokens[index];
    const isLast = index === queryTokens.length - 1;
    let bestPosition = -1;
    let bestEdits = Infinity;
    for (let position = 0; position < candidateTokens.length; position += 1) {
      if (used.has(position)) continue;
      const tokenEdits = tokenDistance(token, candidateTokens[position], isLast);
      if (tokenEdits < bestEdits || (tokenEdits === bestEdits && position === index)) {
        bestEdits = tokenEdits;
        bestPosition = position;
      }
      if (bestEdits === 0 && bestPosition === index) break;
    }
    if (bestPosition < 0 || !Number.isFinite(bestEdits)) return null;
    used.add(bestPosition);
    edits += bestEdits;
    if (index === 0) anchored = bestPosition === 0;
  }
  return { anchored, edits };
}

function tokenDistance(queryToken: string, candidateToken: string, allowPrefix: boolean) {
  if (candidateToken === queryToken) return 0;
  if (allowPrefix && candidateToken.startsWith(queryToken)) return 0;
  const budget = allowedEdits(queryToken);
  if (budget === 0) return Infinity;
  const whole = boundedEditDistance(queryToken, candidateToken, budget);
  if (!allowPrefix) return whole <= budget ? whole : Infinity;
  const prefix = Math.min(
    boundedEditDistance(queryToken, candidateToken.slice(0, queryToken.length), budget),
    boundedEditDistance(queryToken, candidateToken.slice(0, queryToken.length + 1), budget),
  );
  const distance = Math.min(whole, prefix);
  return distance <= budget ? distance : Infinity;
}

function allowedEdits(token: string) {
  if (/^\d+$/.test(token) || token.length < 4) return 0;
  return token.length < 8 ? 1 : 2;
}

/** Optimal-string-alignment distance with an early exit once the budget is exceeded. */
function boundedEditDistance(left: string, right: string, budget: number) {
  if (Math.abs(left.length - right.length) > budget) return budget + 1;
  let previousPrevious: number[] = [];
  let previous = Array.from({ length: right.length + 1 }, (_, index) => index);
  for (let row = 1; row <= left.length; row += 1) {
    const current = [row];
    let rowMinimum = row;
    for (let column = 1; column <= right.length; column += 1) {
      const cost = left[row - 1] === right[column - 1] ? 0 : 1;
      let value = Math.min(previous[column] + 1, current[column - 1] + 1, previous[column - 1] + cost);
      if (row > 1 && column > 1 && left[row - 1] === right[column - 2] && left[row - 2] === right[column - 1]) {
        value = Math.min(value, previousPrevious[column - 2] + 1);
      }
      current[column] = value;
      rowMinimum = Math.min(rowMinimum, value);
    }
    if (rowMinimum > budget) return budget + 1;
    previousPrevious = previous;
    previous = current;
  }
  return previous[right.length];
}

function candidateFor(text: string): Candidate {
  return { compact: text.replace(/ /g, ""), text, tokens: canonicalTokens(text) };
}

function canonicalTokens(text: string) {
  return text.split(" ").filter(Boolean).map((token) => TOKEN_EQUIVALENTS[token] ?? token);
}

function stripTrailingRegion(query: string) {
  let value = query;
  for (;;) {
    const match = TRAILING_REGION_TOKENS.find((token) => value.endsWith(` ${token}`));
    if (!match) return value;
    value = value.slice(0, -(match.length + 1)).trim();
  }
}

function stripTrailingPostal(query: string) {
  const stripped = query.replace(/ \d{5}$/, "").trim();
  return stripped === query ? "" : stripTrailingRegion(stripped);
}

function uniqueQueries(values: string[]) {
  return [...new Set(values.filter(Boolean))];
}

function resolutionFor<T>(areas: T[]): ServiceAreaSearchResolution<T> {
  if (areas.length === 0) return { status: "none" };
  if (areas.length === 1) return { status: "resolved", area: areas[0] };
  return { status: "ambiguous", areas };
}

function compareText(left: string, right: string) {
  return left < right ? -1 : left > right ? 1 : 0;
}
