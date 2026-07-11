import { NextResponse } from "next/server";
import { z } from "zod";
import { mapboxServiceAreaQueries } from "../../../../lib/mapbox";
import { serviceAreaDisplayLabel, type ServiceArea } from "../../../../lib/service-areas";
import {
  GeographyUnavailableError,
  getActiveMarketBySlug,
  marketBboxParam,
  resolveActiveServiceArea,
} from "../../../../server/service-areas";
import { checkRateLimit, clientIpFromRequest } from "../../../../server/rate-limit";
import { getSessionUser } from "../../../../server/session";
import { fetchWithRetry } from "../../../../server/external-fetch";

type GeocodeResult = {
  city: string;
  label: string;
  lat: number;
  lng: number;
  state: string;
  zip: string;
};

const geocodeQuerySchema = z.object({
  intent: z.enum(["search", "store"]).default("search"),
  kind: z.enum(["address", "place"]).default("place"),
  market: z.string().trim().min(1).max(80).regex(/^[a-z0-9-]+$/),
  query: z.string().trim().min(3).max(160),
});

export async function GET(request: Request) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Authentication required.", results: [] }, { status: 401 });

  const [ipLimit, userLimit] = await Promise.all([
    checkRateLimit(`geocode:ip:${clientIpFromRequest(request)}`, 60, 60_000),
    checkRateLimit(`geocode:user:${user.id}`, 40, 60_000),
  ]);
  if (!ipLimit.allowed || !userLimit.allowed) {
    const retryAfter = Math.max(ipLimit.retryAfterSeconds, userLimit.retryAfterSeconds);
    return NextResponse.json(
      { error: "Rate limit reached. Try again later.", results: [] },
      { headers: { "Retry-After": String(retryAfter) }, status: 429 },
    );
  }

  const { searchParams } = new URL(request.url);
  const parsed = geocodeQuerySchema.safeParse({
    intent: searchParams.get("intent") || undefined,
    kind: searchParams.get("kind") || undefined,
    market: searchParams.get("market"),
    query: searchParams.get("query"),
  });

  if (!parsed.success) {
    return NextResponse.json({ error: "Enter at least 3 characters.", results: [] }, { status: 400 });
  }
  const { intent, kind, market: marketSlug, query } = parsed.data;

  let localResolution;
  try {
    localResolution = await resolveActiveServiceArea(query, marketSlug);
  } catch (error) {
    return geographyErrorResponse(error);
  }
  const localArea = localResolution.status === "resolved" ? localResolution.area : null;
  if (localArea) {
    return NextResponse.json({ error: null, results: [areaToResult(localArea)] });
  }

  const token = process.env.NEXT_PUBLIC_MAPBOX_TOKEN;
  if (!token) {
    return NextResponse.json({ error: "Mapbox is not configured.", results: [] }, { status: 503 });
  }

  let market;
  try {
    market = await getActiveMarketBySlug(marketSlug);
  } catch (error) {
    return geographyErrorResponse(error);
  }
  const params = new URLSearchParams({
    access_token: token,
    bbox: marketBboxParam(market),
    country: market.country.toLowerCase(),
    language: "en",
    limit: "3",
    permanent: intent === "store" ? "true" : "false",
    q: query,
    types: kind === "address" ? "address,postcode,place" : "postcode,place",
  });

  const response = await fetchWithRetry(`https://api.mapbox.com/search/geocode/v6/forward?${params}`, {
    cache: "no-store",
  });

  if (!response.ok) {
    return NextResponse.json({ error: "Mapbox lookup failed.", results: [] }, { status: 502 });
  }

  const payload = await response.json();
  const mappedResults = await Promise.all(
    (payload?.features ?? []).map((feature: Record<string, unknown>) => featureToMarketResult(feature, marketSlug)),
  );
  const results = mappedResults.filter((result: GeocodeResult | null): result is GeocodeResult => Boolean(result));

  if (results.length === 0) {
    return NextResponse.json({ error: "That area is outside active Liber service areas.", results: [] }, { status: 404 });
  }

  return NextResponse.json({ error: null, results });
}

async function featureToMarketResult(feature: Record<string, any>, marketSlug: string) {
  for (const value of mapboxServiceAreaQueries(feature)) {
    const resolution = await resolveActiveServiceArea(value, marketSlug);
    if (resolution.status === "resolved") return areaToResult(resolution.area);
  }
  return null;
}

function geographyErrorResponse(error: unknown) {
  const message = error instanceof GeographyUnavailableError
    ? error.message
    : "Liber service-area data is temporarily unavailable.";
  return NextResponse.json({ error: message, results: [] }, { status: 503 });
}

function areaToResult(area: ServiceArea) {
  return {
    city: area.type === "neighborhood" ? area.label : area.city ?? area.label,
    label: serviceAreaDisplayLabel(area),
    lat: area.center.lat,
    lng: area.center.lng,
    state: area.state,
    zip: area.postalCode ?? "",
  };
}
