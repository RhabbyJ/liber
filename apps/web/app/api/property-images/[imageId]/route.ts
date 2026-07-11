import { prisma } from "@liber/db";
import { NextResponse } from "next/server";
import { getSessionUser } from "../../../../server/session";
import { createSupabaseAdminClient } from "../../../../server/supabase";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ imageId: string }> },
) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  const { imageId } = await params;
  const image = await prisma.propertyImage.findUnique({
    where: { id: imageId },
    select: { storagePath: true },
  });
  if (!image) return NextResponse.json({ error: "Image not found." }, { status: 404 });
  const [authorization] = await prisma.$queryRaw<Array<{ allowed: boolean }>>`
    SELECT app_private.can_read_property_image(${image.storagePath}, ${user.id}::uuid) AS allowed
  `;
  if (!authorization?.allowed) return NextResponse.json({ error: "Image not found." }, { status: 404 });
  const supabase = createSupabaseAdminClient();
  if (!supabase) return NextResponse.json({ error: "Storage unavailable." }, { status: 503 });
  const { data, error } = await supabase.storage.from("property-images").createSignedUrl(image.storagePath, 60);
  if (error || !data) return NextResponse.json({ error: "Image unavailable." }, { status: 503 });
  return NextResponse.json({ signedUrl: data.signedUrl }, { headers: { "Cache-Control": "private, no-store" } });
}
