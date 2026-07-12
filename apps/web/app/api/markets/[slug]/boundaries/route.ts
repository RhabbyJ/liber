import { NextResponse } from "next/server";
import { z } from "zod";
import {
  GeographyUnavailableError,
  getActiveMarketDisplayGeometryBySlug,
} from "../../../../../server/service-areas";

const slugSchema = z.string().trim().min(1).max(80).regex(/^[a-z0-9-]+$/);
const versionSchema = z.string().regex(/^[a-f0-9]{64}$/);

export async function GET(request: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const parsedSlug = slugSchema.safeParse(slug);
  const requestedVersion = new URL(request.url).searchParams.get("v");
  const parsedVersion = requestedVersion === null ? null : versionSchema.safeParse(requestedVersion);
  if (!parsedSlug.success || (parsedVersion && !parsedVersion.success)) {
    return NextResponse.json({ error: "Unsupported market boundaries." }, { status: 404 });
  }

  try {
    const geometry = await getActiveMarketDisplayGeometryBySlug(
      parsedSlug.data,
      parsedVersion?.success ? parsedVersion.data : undefined,
    );
    if (!geometry) {
      return NextResponse.json({ error: "Unsupported market boundaries." }, { status: 404 });
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
      : "Liber market boundaries are temporarily unavailable.";
    return NextResponse.json({ error: message }, { status: 503 });
  }
}
