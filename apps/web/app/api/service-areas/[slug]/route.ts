import { NextResponse } from "next/server";
import { z } from "zod";
import {
  GeographyUnavailableError,
  getActiveServiceAreaBySlug,
  serviceAreaApiShape,
} from "../../../../server/service-areas";

const serviceAreaSlugSchema = z.string().trim().min(1).max(80).regex(/^[a-z0-9-]+$/);

export async function GET(
  request: Request,
  { params }: { params: Promise<{ slug: string }> },
) {
  const { slug } = await params;
  const parsed = serviceAreaSlugSchema.safeParse(slug);
  if (!parsed.success) return NextResponse.json({ error: "Unsupported service area." }, { status: 404 });
  const market = new URL(request.url).searchParams.get("market");
  const parsedMarket = serviceAreaSlugSchema.safeParse(market);
  if (!parsedMarket.success) return NextResponse.json({ error: "Market is required." }, { status: 400 });

  try {
    const area = await getActiveServiceAreaBySlug(parsed.data, parsedMarket.data);
    if (!area) return NextResponse.json({ error: "Unsupported service area." }, { status: 404 });

    return NextResponse.json(serviceAreaApiShape(area));
  } catch (error) {
    const message = error instanceof GeographyUnavailableError
      ? error.message
      : "Liber service-area data is temporarily unavailable.";
    return NextResponse.json({ error: message }, { status: 503 });
  }
}
