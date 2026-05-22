import { NextResponse } from "next/server";
import { enrichPropertyByAddress } from "../../../../server/attom";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const addressLine1 = searchParams.get("addressLine1")?.trim() ?? "";
  const city = searchParams.get("city")?.trim() ?? "";
  const state = searchParams.get("state")?.trim().toUpperCase() ?? "";
  const zip = searchParams.get("zip")?.trim() ?? "";

  if (!addressLine1 || !zip) {
    return NextResponse.json({ error: "Address and active pilot ZIP are required.", property: null }, { status: 400 });
  }

  const result = await enrichPropertyByAddress({ addressLine1, city, state, zip });
  return NextResponse.json(
    { error: result.error, property: result.property },
    { status: result.status },
  );
}
