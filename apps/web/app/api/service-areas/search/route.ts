import { NextResponse } from "next/server";
import { z } from "zod";
import { normalizeServiceAreaSearchTerm } from "../../../../lib/service-areas";
import { checkRateLimit, clientIpFromRequest } from "../../../../server/rate-limit";
import {
  GeographyUnavailableError,
  searchAndResolveActiveServiceAreas,
  serviceAreaApiShape,
  serviceAreaResolutionApiShape,
} from "../../../../server/service-areas";

const serviceAreaSearchSchema = z.object({
  market: z.string().trim().min(1).max(80).regex(/^[a-z0-9-]+$/),
  q: z.string().trim().max(80).default(""),
});

// Responses carry only public canonical geography, so the CDN may share them;
// cache hits never reach the database or the per-IP limiter.
const publicCache = "public, max-age=60, s-maxage=300, stale-while-revalidate=600";
const noStore = "no-store";
const emptyResult = { resolution: { status: "none" }, suggestions: [] };

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const parsed = serviceAreaSearchSchema.safeParse({
    market: searchParams.get("market") || undefined,
    q: searchParams.get("q") ?? undefined,
  });

  if (!parsed.success) {
    return NextResponse.json(emptyResult, { headers: { "Cache-Control": noStore } });
  }
  if (!normalizeServiceAreaSearchTerm(parsed.data.q)) {
    return NextResponse.json(emptyResult, { headers: { "Cache-Control": publicCache } });
  }

  try {
    const limit = await checkRateLimit(`service-area-search:ip:${clientIpFromRequest(request)}`, 120, 60_000);
    if (!limit.allowed) {
      return NextResponse.json(
        { ...emptyResult, error: "Too many searches. Try again in a moment." },
        { headers: { "Cache-Control": noStore, "Retry-After": String(limit.retryAfterSeconds) }, status: 429 },
      );
    }

    const { resolution, suggestions } = await searchAndResolveActiveServiceAreas(parsed.data.q, 8, parsed.data.market);

    return NextResponse.json({
      resolution: serviceAreaResolutionApiShape(resolution),
      suggestions: suggestions.map(serviceAreaApiShape),
    }, { headers: { "Cache-Control": publicCache } });
  } catch (error) {
    const message = error instanceof GeographyUnavailableError
      ? error.message
      : "Liber service-area data is temporarily unavailable.";
    return NextResponse.json({ ...emptyResult, error: message }, { headers: { "Cache-Control": noStore }, status: 503 });
  }
}
