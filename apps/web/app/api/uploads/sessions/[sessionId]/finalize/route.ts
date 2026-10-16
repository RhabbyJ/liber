import { type NextRequest } from "next/server";
import { isRequestSameOrigin } from "../../../../../../server/request-origin";
import { getSessionUser } from "../../../../../../server/session";
import { finalizeUploadSession } from "../../../../../../server/uploads/service";
import { privateUploadJson, uploadErrorResponse } from "../../../../../../server/uploads/http";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ sessionId: string }> },
) {
  if (!isRequestSameOrigin(request)) return privateUploadJson({ error: "Invalid origin." }, 403);
  try {
    const user = await getSessionUser();
    if (!user) return privateUploadJson({ error: "Authentication required." }, 401);
    const { sessionId } = await params;
    const data = await finalizeUploadSession({ sessionId }, user);
    return privateUploadJson(data);
  } catch (error) {
    return uploadErrorResponse(error, "/api/uploads/sessions/[sessionId]/finalize");
  }
}
