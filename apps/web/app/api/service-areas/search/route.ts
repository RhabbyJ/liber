import { NextResponse } from "next/server";
import { z } from "zod";
import { searchActiveServiceAreas, serviceAreaApiShape } from "../../../../server/service-areas";

const serviceAreaSearchSchema = z.object({
  q: z.string().trim().min(2).max(80),
});

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const parsed = serviceAreaSearchSchema.safeParse({
    q: searchParams.get("q"),
  });

  if (!parsed.success) return NextResponse.json([]);

  const areas = await searchActiveServiceAreas(parsed.data.q);
  return NextResponse.json(areas.map(serviceAreaApiShape));
}
