import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { canViewBuyerDirectory } from "../../../../server/access";
import { searchBuyers } from "../../../../server/contracts";
import { getSessionUser } from "../../../../server/session";

export async function GET(request: Request) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Authentication required.", items: [], pageInfo: null }, { status: 401 });
  if (!(await canViewBuyerDirectory(user))) {
    return NextResponse.json({ error: "Seller directory access is required.", items: [], pageInfo: null }, { status: 403 });
  }

  const { searchParams } = new URL(request.url);
  const input = {
    amenities: searchParams.getAll("amenities"),
    badges: searchParams.getAll("badges"),
    bathrooms: searchParams.get("bathrooms") || undefined,
    bedrooms: searchParams.get("bedrooms") || undefined,
    budgetMax: searchParams.get("budgetMax") || undefined,
    budgetMin: searchParams.get("budgetMin") || undefined,
    condition: searchParams.get("condition") || undefined,
    cursor: searchParams.get("cursor") || undefined,
    lotSize: searchParams.get("lotSize") || undefined,
    market: searchParams.get("market") || undefined,
    pageSize: searchParams.get("pageSize") || undefined,
    propertyCategory: searchParams.get("propertyCategory") || undefined,
    propertySubtype: searchParams.get("propertySubtype") || undefined,
    serviceArea: searchParams.get("service_area") || searchParams.get("serviceArea") || undefined,
    sort: searchParams.get("sort") || undefined,
    squareFeet: searchParams.get("squareFeet") || undefined,
  };

  try {
    const { data } = await searchBuyers(input);
    return NextResponse.json(data);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to search buyers.";
    if (message.toLowerCase().includes("rate limit")) {
      return NextResponse.json(
        { error: "Too many buyer searches. Try again later.", items: [], pageInfo: null },
        { status: 429 },
      );
    }
    if (error instanceof ZodError) {
      return NextResponse.json(
        { error: "Invalid buyer search filters.", items: [], pageInfo: null },
        { status: 400 },
      );
    }
    console.error("[seller-buyers-api] search failed", {
      name: error instanceof Error ? error.name : "UnknownError",
    });
    return NextResponse.json(
      { error: "Unable to search buyers.", items: [], pageInfo: null },
      { status: 500 },
    );
  }
}
