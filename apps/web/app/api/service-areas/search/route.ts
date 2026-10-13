import { NextResponse } from "next/server";
import { z } from "zod";
import { limitPublicGeographyRequest, PUBLIC_GEOGRAPHY_CACHE } from "../../../../server/public-geography-http";
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

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const parsed = serviceAreaSearchSchema.safeParse({
    market: searchParams.get("market") || undefined,
    q: searchParams.get("q") ?? undefined,
  });

  if (!parsed.success) {
    return NextResponse.json({
      resolution: { status: "none" },
      suggestions: [],
    });
  }

  const limited = await limitPublicGeographyRequest(request);
  if (limited) return limited;

  try {
    const { resolution, suggestions } = await searchAndResolveActiveServiceAreas(parsed.data.q, 8, parsed.data.market);

    return NextResponse.json({
      resolution: serviceAreaResolutionApiShape(resolution),
      suggestions: suggestions.map(serviceAreaApiShape),
    }, { headers: { "Cache-Control": PUBLIC_GEOGRAPHY_CACHE } });
  } catch (error) {
    const message = error instanceof GeographyUnavailableError
      ? error.message
      : "Liber service-area data is temporarily unavailable.";
    return NextResponse.json({ error: message, resolution: { status: "none" }, suggestions: [] }, { status: 503 });
  }
}
