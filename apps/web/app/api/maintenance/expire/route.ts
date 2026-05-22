import { NextResponse, type NextRequest } from "next/server";
import { createHash, timingSafeEqual } from "node:crypto";
import { expireMarketplaceState } from "../../../../server/maintenance";

export async function GET(request: NextRequest) {
  return runMaintenance(request);
}

export async function POST(request: NextRequest) {
  return runMaintenance(request);
}

async function runMaintenance(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  const authorization = request.headers.get("authorization");

  if (!secret || !authorizationMatches(authorization, secret)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const result = await expireMarketplaceState();
  return NextResponse.json(result);
}

function authorizationMatches(authorization: string | null, secret: string) {
  if (!authorization) return false;
  const provided = createHash("sha256").update(authorization).digest();
  const expected = createHash("sha256").update(`Bearer ${secret}`).digest();
  return timingSafeEqual(provided, expected);
}
