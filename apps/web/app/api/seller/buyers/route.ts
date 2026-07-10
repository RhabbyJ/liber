import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { canViewBuyerDirectory } from "../../../../server/access";
import { searchBuyers } from "../../../../server/contracts";
import { sellerBuyerSearchResponse } from "../../../../server/buyer-dtos";
import { getSessionUser } from "../../../../server/session";

export async function GET(request: Request) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Authentication required.", buyers: [] }, { status: 401 });
  if (!(await canViewBuyerDirectory(user))) {
    return NextResponse.json({ error: "Seller directory access is required.", buyers: [] }, { status: 403 });
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
    market: searchParams.get("market") || undefined,
    serviceArea: searchParams.get("service_area") || searchParams.get("serviceArea") || undefined,
    sort: searchParams.get("sort") || undefined,
    squareFeet: searchParams.get("squareFeet") || undefined,
  };

  try {
    const { data } = await searchBuyers(input);
    return NextResponse.json(sellerBuyerSearchResponse(data));
  } catch (error) {
    logSearchFailure(error);
    if (isRateLimitError(error)) {
      return NextResponse.json(
        { error: "Too many buyer searches. Try again later.", buyers: [] },
        { status: 429 },
      );
    }
    if (error instanceof ZodError) {
      return NextResponse.json(
        { error: "Invalid buyer search filters.", buyers: [] },
        { status: 400 },
      );
    }
    return NextResponse.json(
      { error: "Unable to search buyers.", buyers: [] },
      { status: 500 },
    );
  }
}

function isRateLimitError(error: unknown) {
  return error instanceof Error && error.message === "Rate limit reached. Try again later.";
}

function logSearchFailure(error: unknown) {
  const details: { code?: string; name: string } = {
    name: error instanceof Error ? error.name : "UnknownError",
  };
  if (error && typeof error === "object" && "code" in error && typeof error.code === "string") {
    details.code = error.code.slice(0, 64);
  }
  console.error("[seller-buyers-api] search failed", details);
}
