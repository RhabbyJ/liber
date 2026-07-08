import { NextResponse } from "next/server";
import { z } from "zod";
import { getActiveServiceAreaBySlug, serviceAreaApiShape } from "../../../../server/service-areas";

const serviceAreaSlugSchema = z.string().trim().min(1).max(80).regex(/^[a-z0-9-]+$/);

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ slug: string }> },
) {
  const { slug } = await params;
  const parsed = serviceAreaSlugSchema.safeParse(slug);
  if (!parsed.success) return NextResponse.json({ error: "Unsupported service area." }, { status: 404 });

  const area = await getActiveServiceAreaBySlug(parsed.data);
  if (!area) return NextResponse.json({ error: "Unsupported service area." }, { status: 404 });

  return NextResponse.json(serviceAreaApiShape(area));
}
