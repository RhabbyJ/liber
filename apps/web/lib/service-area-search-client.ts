"use client";

import { useEffect, useState } from "react";
import type { ServiceAreaSearchResponse } from "./service-area-api";
import { normalizeServiceAreaSearchTerm, type ServiceArea } from "./service-areas";

export type ServiceAreaSearchState = {
  payload: ServiceAreaSearchResponse | null;
  /** Normalized query that `payload` answers; it can lag the input while a newer request is pending. */
  query: string;
  status: "idle" | "loading" | "ready" | "error";
};

const idleState: ServiceAreaSearchState = { payload: null, query: "", status: "idle" };
const responseCache = new Map<string, ServiceAreaSearchResponse>();
const responseCacheLimit = 100;
const recentLimit = 5;

function cacheKey(marketSlug: string, normalizedQuery: string) {
  return `${marketSlug}\n${normalizedQuery}`;
}

/** Fetches public service-area suggestions with a small in-memory cache shared by every search box. */
export async function fetchServiceAreaSearch(marketSlug: string, query: string, signal?: AbortSignal) {
  const normalized = normalizeServiceAreaSearchTerm(query);
  const key = cacheKey(marketSlug, normalized);
  const cached = responseCache.get(key);
  if (cached) return cached;

  const params = new URLSearchParams({ market: marketSlug, q: normalized });
  const response = await fetch(`/api/service-areas/search?${params}`, { signal });
  if (!response.ok) throw new Error(`Service-area search failed with ${response.status}.`);
  const payload = await response.json() as ServiceAreaSearchResponse;
  responseCache.set(key, payload);
  if (responseCache.size > responseCacheLimit) {
    const oldest = responseCache.keys().next().value;
    if (oldest !== undefined) responseCache.delete(oldest);
  }
  return payload;
}

/** Debounced suggestions that keep the previous answer visible while the next one loads. */
export function useServiceAreaSearch(
  marketSlug: string,
  query: string,
  { delayMs = 150, enabled = true }: { delayMs?: number; enabled?: boolean } = {},
) {
  const normalized = normalizeServiceAreaSearchTerm(query);
  const [state, setState] = useState<ServiceAreaSearchState>(idleState);

  useEffect(() => {
    if (!enabled || !normalized) {
      setState(idleState);
      return;
    }
    const cached = responseCache.get(cacheKey(marketSlug, normalized));
    if (cached) {
      setState({ payload: cached, query: normalized, status: "ready" });
      return;
    }

    setState((current) => ({ ...current, status: "loading" }));
    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      fetchServiceAreaSearch(marketSlug, normalized, controller.signal)
        .then((payload) => setState({ payload, query: normalized, status: "ready" }))
        .catch(() => {
          if (!controller.signal.aborted) setState({ payload: null, query: normalized, status: "error" });
        });
    }, delayMs);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [delayMs, enabled, marketSlug, normalized]);

  return state;
}

function recentStorageKey(marketSlug: string) {
  return `liber:recent-service-areas:${marketSlug}`;
}

/** Per-browser convenience only; the server re-resolves every selected slug before using it. */
export function readRecentServiceAreas(marketSlug: string): ServiceArea[] {
  try {
    const parsed: unknown = JSON.parse(window.localStorage.getItem(recentStorageKey(marketSlug)) ?? "[]");
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(isStoredServiceArea).slice(0, recentLimit);
  } catch {
    return [];
  }
}

export function rememberRecentServiceArea(marketSlug: string, area: ServiceArea) {
  try {
    const next = [area, ...readRecentServiceAreas(marketSlug).filter((recent) => recent.slug !== area.slug)]
      .slice(0, recentLimit);
    window.localStorage.setItem(recentStorageKey(marketSlug), JSON.stringify(next));
  } catch {
    // Storage can be unavailable (private mode, blocked site data); recents are optional.
  }
}

function isStoredServiceArea(value: unknown): value is ServiceArea {
  if (!value || typeof value !== "object") return false;
  const area = value as Partial<ServiceArea>;
  return typeof area.slug === "string" && /^[a-z0-9-]{1,120}$/.test(area.slug)
    && typeof area.label === "string"
    && (area.type === "city" || area.type === "neighborhood" || area.type === "zip" || area.type === "custom")
    && Array.isArray(area.bbox) && area.bbox.length === 4
    && typeof area.center?.lat === "number" && typeof area.center?.lng === "number";
}

export type ServiceAreaOptionText = {
  primary: string;
  secondary: string;
};

const unincorporatedSuffix = /\s*\(unincorporated\)\s*$/i;

/** Two-line suggestion text: the place name, then its kind and parent geography. */
export function serviceAreaOptionText(area: Pick<ServiceArea, "city" | "county" | "label" | "postalCode" | "state" | "type">): ServiceAreaOptionText {
  const county = !area.county || /\bcounty$/i.test(area.county) ? area.county ?? "" : `${area.county} County`;
  const region = [county, area.state].filter(Boolean).join(", ");
  if (area.type === "zip") {
    return { primary: area.postalCode || area.label, secondary: ["ZIP code", region].filter(Boolean).join(" · ") };
  }
  if (area.type === "city") {
    return { primary: area.label, secondary: ["City", region].filter(Boolean).join(" · ") };
  }
  if (area.type === "neighborhood") {
    if (area.city) {
      return {
        primary: area.label,
        secondary: `Neighborhood · ${[area.city, area.state].filter(Boolean).join(", ")}`,
      };
    }
    return {
      primary: area.label.replace(unincorporatedSuffix, ""),
      secondary: ["Unincorporated area", region].filter(Boolean).join(" · "),
    };
  }
  return { primary: area.label, secondary: region };
}

/** Splits `text` so the part matching the typed query can be emphasized; accents and punctuation are ignored. */
export function highlightSegments(text: string, query: string): Array<{ match: boolean; text: string }> {
  const needle = normalizeServiceAreaSearchTerm(query);
  if (!needle) return [{ match: false, text }];

  // Map each normalized character back to its position in the original text.
  let normalized = "";
  const sourceIndex: number[] = [];
  let pendingSpace = false;
  for (let index = 0; index < text.length; index += 1) {
    const folded = normalizeServiceAreaSearchTerm(text[index]);
    if (!folded) {
      pendingSpace = normalized.length > 0;
      continue;
    }
    if (pendingSpace) {
      normalized += " ";
      sourceIndex.push(index);
      pendingSpace = false;
    }
    for (const character of folded) {
      normalized += character;
      sourceIndex.push(index);
    }
  }

  let start = -1;
  for (let position = normalized.indexOf(needle); position !== -1; position = normalized.indexOf(needle, position + 1)) {
    if (position === 0 || normalized[position - 1] === " ") {
      start = position;
      break;
    }
  }
  if (start === -1) return [{ match: false, text }];

  const from = sourceIndex[start];
  const to = sourceIndex[start + needle.length - 1] + 1;
  return [
    { match: false, text: text.slice(0, from) },
    { match: true, text: text.slice(from, to) },
    { match: false, text: text.slice(to) },
  ].filter((segment) => segment.text);
}
