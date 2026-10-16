import { prisma } from "@liber/db";
import { checkRateLimit } from "../../../../server/rate-limit";
import { getSessionUser } from "../../../../server/session";
import { createSupabaseAdminClient } from "../../../../server/supabase";
import { privateUploadJson, uploadErrorResponse } from "../../../../server/uploads/http";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ imageId: string }> },
) {
  try {
    const user = await getSessionUser();
    if (!user) return privateUploadJson({ error: "Authentication required." }, 401);
    const limit = await checkRateLimit(`property-image-read:${user.id}`, 180, 60_000);
    if (!limit.allowed) return privateUploadJson({ error: "Image limit reached. Try again later." }, 429, limit.retryAfterSeconds);
    const { imageId } = await params;
    if (!imageId || imageId.length > 200) return privateUploadJson({ error: "Image not found." }, 404);
    const image = await prisma.propertyImage.findUnique({
      where: { id: imageId },
      select: { storagePath: true },
    });
    if (!image) return privateUploadJson({ error: "Image not found." }, 404);
    const [authorization] = await prisma.$queryRaw<Array<{ allowed: boolean }>>`
      SELECT app_private.can_read_property_image(${image.storagePath}, ${user.id}::uuid) AS allowed
    `;
    if (!authorization?.allowed) return privateUploadJson({ error: "Image not found." }, 404);
    const supabase = createSupabaseAdminClient();
    if (!supabase) return privateUploadJson({ error: "Storage unavailable." }, 503);
    const { data, error } = await supabase.storage.from("property-images").createSignedUrl(image.storagePath, 60);
    if (error || !data) return privateUploadJson({ error: "Image unavailable." }, 503);
    return privateUploadJson({ signedUrl: data.signedUrl });
  } catch (error) {
    return uploadErrorResponse(error, "/api/property-images/[imageId]");
  }
}
