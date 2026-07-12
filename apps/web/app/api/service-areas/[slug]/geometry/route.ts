import { NextResponse } from "next/server";
import { z } from "zod";
import {
  GeographyUnavailableError,
  getActiveServiceAreaGeometryBySlug,
} from "../../../../../server/service-areas";

const slugSchema = z.string().trim().min(1).max(120).regex(/^[a-z0-9-]+$/);
const versionSchema = z.string().regex(/^[a-f0-9]{64}$/);

export async function GET(request: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const url = new URL(request.url);
  const parsedSlug = slugSchema.safeParse(slug);
  const parsedMarket = slugSchema.safeParse(url.searchParams.get("market"));
  const requestedVersion = url.searchParams.get("v");
  const parsedVersion = requestedVersion === null ? null : versionSchema.safeParse(requestedVersion);
  if (!parsedSlug.success || !parsedMarket.success || (parsedVersion && !parsedVersion.success)) {
    return NextResponse.json({ error: "Unsupported service-area geometry." }, { status: 404 });
  }

  try {
    const geometry = await getActiveServiceAreaGeometryBySlug(
      parsedSlug.data,
      parsedMarket.data,
      parsedVersion?.success ? parsedVersion.data : undefined,
    );
    if (!geometry) {
      return NextResponse.json({ error: "Unsupported service-area geometry." }, { status: 404 });
    }

    const etag = `"${geometry.sha256}"`;
    const cacheControl = parsedVersion?.success
      ? "public, max-age=31536000, immutable"
      : "public, max-age=60";
    if (request.headers.get("if-none-match") === etag) {
      return new Response(null, { status: 304, headers: { "Cache-Control": cacheControl, ETag: etag } });
    }

    return NextResponse.json(geometry.geojson, {
      headers: { "Cache-Control": cacheControl, ETag: etag },
    });
  } catch (error) {
    const message = error instanceof GeographyUnavailableError
      ? error.message
      : "Liber service-area geometry is temporarily unavailable.";
    return NextResponse.json({ error: message }, { status: 503 });
  }
}
