import { NextResponse, type NextRequest } from "next/server";
import { expireMarketplaceState } from "../../../../server/maintenance";

export async function POST(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  const authorization = request.headers.get("authorization");

  if (!secret || authorization !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const result = await expireMarketplaceState();
  return NextResponse.json(result);
}
