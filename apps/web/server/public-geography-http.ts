import { NextResponse } from "next/server";
import { clientIpFromRequest } from "./rate-limit";
import { consumeSharedRateLimit } from "./shared-rate-limit";

export const PUBLIC_GEOGRAPHY_CACHE = "public, max-age=60, s-maxage=300";

export async function limitPublicGeographyRequest(request: Request) {
  try {
    const result = await consumeSharedRateLimit({
      identifier: clientIpFromRequest(request),
      limit: 120,
      namespace: "geography:public:ip",
      windowSeconds: 60,
    });
    if (result.allowed) return null;
    return NextResponse.json({ error: "Please wait before searching again." }, {
      headers: { "Cache-Control": "private, no-store", "Retry-After": String(result.retryAfterSeconds) },
      status: 429,
    });
  } catch {
    return NextResponse.json({ error: "Liber geography is temporarily unavailable." }, {
      headers: { "Cache-Control": "private, no-store" }, status: 503,
    });
  }
}
