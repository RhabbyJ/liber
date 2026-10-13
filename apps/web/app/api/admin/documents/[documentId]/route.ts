import { prisma } from "@liber/db";
import { hasRole } from "../../../../../server/authz";
import { checkRateLimit } from "../../../../../server/rate-limit";
import { getSessionUser } from "../../../../../server/session";
import { createSupabaseAdminClient } from "../../../../../server/supabase";
import { privateUploadJson, uploadErrorResponse } from "../../../../../server/uploads/http";
import { requireConfidentialDocumentAccess } from "../../../../../server/verification/document-access";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ documentId: string }> },
) {
  try {
    const user = await getSessionUser();
    if (!user) return privateUploadJson({ error: "Authentication required." }, 401);
    if (!hasRole(user, "ADMIN")) return privateUploadJson({ error: "Document not found." }, 404);
    requireConfidentialDocumentAccess();
    const limit = await checkRateLimit(`admin-document-read:${user.id}`, 60, 60_000);
    if (!limit.allowed) return privateUploadJson({ error: "Document limit reached. Try again later." }, 429, limit.retryAfterSeconds);
    const { documentId } = await params;
    if (!documentId || documentId.length > 200) return privateUploadJson({ error: "Document not found." }, 404);
    const document = await prisma.verificationDocument.findUnique({
      where: { id: documentId },
      select: {
        documentType: true,
        propertyIdentityVersion: true,
        reviewStatus: true,
        storageBucket: true,
        storagePath: true,
        property: {
          select: {
            identityVersion: true,
            authorityAttestedIdentityVersion: true,
            authorityAttestedByUserId: true,
            ownerUserId: true,
          },
        },
      },
    });
    if (!document || document.reviewStatus !== "PENDING" || document.storageBucket !== "verification-documents") {
      return privateUploadJson({ error: "Document not found." }, 404);
    }
    if (document.documentType === "OWNERSHIP" && (
      !document.property
      || document.propertyIdentityVersion !== document.property.identityVersion
      || document.property.authorityAttestedIdentityVersion !== document.property.identityVersion
      || document.property.authorityAttestedByUserId !== document.property.ownerUserId
    )) return privateUploadJson({ error: "Document not found." }, 404);

    const supabase = createSupabaseAdminClient();
    if (!supabase) return privateUploadJson({ error: "Document unavailable." }, 503);
    const { data, error } = await supabase.storage.from("verification-documents").createSignedUrl(document.storagePath, 60);
    if (error || !data) return privateUploadJson({ error: "Document unavailable." }, 503);
    await prisma.adminAuditLog.create({
      data: { action: "document_accessed", actorUserId: user.id, targetId: documentId, targetType: "verification_document" },
    });
    return new Response(null, {
      status: 302,
      headers: {
        "Cache-Control": "private, no-store",
        "Referrer-Policy": "no-referrer",
        Location: data.signedUrl,
      },
    });
  } catch (error) {
    return uploadErrorResponse(error);
  }
}
