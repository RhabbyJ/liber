import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { enrichPropertyByAddress } from "../../../../server/attom";
import { hasRole } from "../../../../server/authz";
import { checkRateLimit, clientIpFromRequest } from "../../../../server/rate-limit";
import { getSessionUser } from "../../../../server/session";
import { isRequestSameOrigin } from "../../../../server/request-origin";

const enrichQuerySchema = z.object({
  addressLine1: z.string().trim().min(1).max(160),
  city: z.string().trim().max(80).optional(),
  market: z.string().trim().min(1).max(80).regex(/^[a-z0-9-]+$/),
  state: z.string().trim().length(2).optional(),
  zip: z.string().trim().min(5).max(16),
});

export async function POST(request: NextRequest) {
  if (!isRequestSameOrigin(request)) return privateJson({ error: "Invalid origin.", property: null }, 403);
  const user = await getSessionUser();
  if (!user) return privateJson({ error: "Authentication required.", property: null }, 401);
  if (!hasRole(user, "SELLER") && !hasRole(user, "ADMIN")) {
    return privateJson({ error: "Seller role required.", property: null }, 403);
  }

  const [ipLimit, userLimit] = await Promise.all([
    checkRateLimit(`property-enrich:ip:${clientIpFromRequest(request)}`, 30, 60_000),
    checkRateLimit(`property-enrich:user:${user.id}`, 20, 60_000),
  ]);
  if (!ipLimit.allowed || !userLimit.allowed) {
    const retryAfter = Math.max(ipLimit.retryAfterSeconds, userLimit.retryAfterSeconds);
    return NextResponse.json(
      { error: "Rate limit reached. Try again later.", property: null },
      { headers: { "Retry-After": String(retryAfter) }, status: 429 },
    );
  }

  const body = await request.json().catch(() => ({}));
  const parsed = enrichQuerySchema.safeParse({
    ...body,
    state: typeof body.state === "string" ? body.state.trim().toUpperCase() : undefined,
  });

  if (!parsed.success) {
    return privateJson({ error: "Address and active service-area ZIP are required.", property: null }, 400);
  }

  const result = await enrichPropertyByAddress(parsed.data);
  return privateJson(
    { error: result.status >= 500 ? "Property enrichment failed." : result.error, property: result.property },
    result.status,
  );
}

function privateJson(body: unknown, status = 200) {
  return NextResponse.json(body, { headers: { "Cache-Control": "private, no-store" }, status });
}
