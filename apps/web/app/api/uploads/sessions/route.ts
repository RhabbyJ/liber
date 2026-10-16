import { type NextRequest } from "next/server";
import { isRequestSameOrigin } from "../../../../server/request-origin";
import { readBoundedJson } from "../../../../server/request-body";
import { getSessionUser } from "../../../../server/session";
import { createUploadSession } from "../../../../server/uploads/service";
import { privateUploadJson, uploadErrorResponse } from "../../../../server/uploads/http";

export async function POST(request: NextRequest) {
  if (!isRequestSameOrigin(request)) return privateUploadJson({ error: "Invalid origin." }, 403);
  try {
    const user = await getSessionUser();
    if (!user) return privateUploadJson({ error: "Authentication required." }, 401);
    const data = await createUploadSession(await readBoundedJson(request, 8 * 1024), user);
    return privateUploadJson(data, 201);
  } catch (error) {
    return uploadErrorResponse(error, "/api/uploads/sessions");
  }
}
