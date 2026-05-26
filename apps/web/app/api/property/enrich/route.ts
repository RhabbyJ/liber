import { NextResponse } from "next/server";
import { z } from "zod";
import { canViewBuyerDirectory } from "../../../../server/access";
import { enrichPropertyByAddress } from "../../../../server/attom";
import { checkRateLimit, clientIpFromRequest } from "../../../../server/rate-limit";
import { getSessionUser } from "../../../../server/session";

const enrichQuerySchema = z.object({
  addressLine1: z.string().trim().min(1).max(160),
  city: z.string().trim().max(80).optional(),
  state: z.string().trim().length(2).optional(),
  zip: z.string().trim().min(5).max(16),
});

export async function GET(request: Request) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Authentication required.", property: null }, { status: 401 });
  if (!(await canViewBuyerDirectory(user))) {
    return NextResponse.json({ error: "Seller access must be approved.", property: null }, { status: 403 });
  }

  const ipLimit = checkRateLimit(`property-enrich:ip:${clientIpFromRequest(request)}`, 30, 60_000);
  const userLimit = checkRateLimit(`property-enrich:user:${user.id}`, 20, 60_000);
  if (!ipLimit.allowed || !userLimit.allowed) {
    const retryAfter = Math.max(ipLimit.retryAfterSeconds, userLimit.retryAfterSeconds);
    return NextResponse.json(
      { error: "Rate limit reached. Try again later.", property: null },
      { headers: { "Retry-After": String(retryAfter) }, status: 429 },
    );
  }

  const { searchParams } = new URL(request.url);
  const parsed = enrichQuerySchema.safeParse({
    addressLine1: searchParams.get("addressLine1"),
    city: searchParams.get("city") || undefined,
    state: searchParams.get("state")?.trim().toUpperCase() || undefined,
    zip: searchParams.get("zip"),
  });

  if (!parsed.success) {
    return NextResponse.json({ error: "Address and active pilot ZIP are required.", property: null }, { status: 400 });
  }

  const result = await enrichPropertyByAddress(parsed.data);
  return NextResponse.json(
    { error: result.status >= 500 ? "Property enrichment failed." : result.error, property: result.property },
    { status: result.status },
  );
}
