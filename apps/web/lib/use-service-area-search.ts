"use client";

import { useEffect, useRef, useState } from "react";
import {
  apiResultToServiceArea,
  type ServiceAreaSearchResponse,
  type ServiceAreaSuggestionArea,
} from "./service-area-api";
import { normalizeServiceAreaQuery } from "./service-area-search";

export type ServiceAreaSearchStatus = "idle" | "loading" | "ready" | "error";

export type ServiceAreaSearchState = {
  errorMessage?: string;
  query: string;
  response: ServiceAreaSearchResponse | null;
  status: ServiceAreaSearchStatus;
  suggestions: ServiceAreaSuggestionArea[];
};

const DEBOUNCE_MS = 120;
const CACHE_TTL_MS = 5 * 60_000;
const CACHE_LIMIT = 120;
const responseCache = new Map<string, { expiresAt: number; response: ServiceAreaSearchResponse }>();

function cacheKey(marketSlug: string, query: string) {
  return `${marketSlug}\u0000${normalizeServiceAreaQuery(query)}`;
}

function cachedResponse(marketSlug: string, query: string) {
  const key = cacheKey(marketSlug, query);
  const hit = responseCache.get(key);
  if (!hit) return null;
  if (hit.expiresAt < Date.now()) {
    responseCache.delete(key);
    return null;
  }
  // Refresh recency so frequently revisited prefixes survive eviction.
  responseCache.delete(key);
  responseCache.set(key, hit);
  return hit.response;
}

function storeResponse(marketSlug: string, query: string, response: ServiceAreaSearchResponse) {
  const key = cacheKey(marketSlug, query);
  responseCache.delete(key);
  responseCache.set(key, { expiresAt: Date.now() + CACHE_TTL_MS, response });
  while (responseCache.size > CACHE_LIMIT) {
    const oldest = responseCache.keys().next().value;
    if (oldest === undefined) break;
    responseCache.delete(oldest);
  }
}

export class ServiceAreaSearchError extends Error {
  constructor(readonly status: number) {
    super(status === 429 ? "Searching too quickly. Pause for a moment and try again." : "Area search is temporarily unavailable.");
    this.name = "ServiceAreaSearchError";
  }
}

/** Fetch one search response, reusing a recent identical query from this tab. */
export async function fetchServiceAreaSearch(marketSlug: string, query: string, signal?: AbortSignal) {
  const cached = cachedResponse(marketSlug, query);
  if (cached) return cached;
  const params = new URLSearchParams({ market: marketSlug, q: query.trim() });
  const response = await fetch(`/api/service-areas/search?${params}`, { signal });
  if (!response.ok) throw new ServiceAreaSearchError(response.status);
  const payload = await response.json() as ServiceAreaSearchResponse;
  storeResponse(marketSlug, query, payload);
  return payload;
}

/**
 * Debounced, cancelable, cached service-area suggestions. Previous suggestions
 * stay visible while the next query loads so the list does not flicker.
 */
export function useServiceAreaSearch(query: string, marketSlug: string, enabled = true): ServiceAreaSearchState {
  const [state, setState] = useState<ServiceAreaSearchState>({ query: "", response: null, status: "idle", suggestions: [] });
  const latestRef = useRef(0);

  useEffect(() => {
    const trimmed = query.trim();
    const ticket = ++latestRef.current;
    if (!enabled || !normalizeServiceAreaQuery(trimmed)) {
      setState({ query: trimmed, response: null, status: "idle", suggestions: [] });
      return;
    }

    const apply = (response: ServiceAreaSearchResponse) => {
      if (ticket !== latestRef.current) return;
      setState({
        query: trimmed,
        response,
        status: "ready",
        suggestions: response.suggestions.map(apiResultToServiceArea),
      });
    };

    const cached = cachedResponse(marketSlug, trimmed);
    if (cached) {
      apply(cached);
      return;
    }

    setState((current) => ({ ...current, query: trimmed, status: "loading" }));
    const controller = new AbortController();
    const timeout = window.setTimeout(() => {
      fetchServiceAreaSearch(marketSlug, trimmed, controller.signal).then(apply, (error: unknown) => {
        if (controller.signal.aborted || ticket !== latestRef.current) return;
        setState({
          errorMessage: error instanceof ServiceAreaSearchError ? error.message : "Area search is temporarily unavailable.",
          query: trimmed,
          response: null,
          status: "error",
          suggestions: [],
        });
      });
    }, DEBOUNCE_MS);

    return () => {
      window.clearTimeout(timeout);
      controller.abort();
    };
  }, [enabled, marketSlug, query]);

  return state;
}
