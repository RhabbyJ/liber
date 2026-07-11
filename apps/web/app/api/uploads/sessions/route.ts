import { NextResponse, type NextRequest } from "next/server";
import { ZodError } from "zod";
import { isRequestSameOrigin } from "../../../../server/request-origin";
import { getSessionUser } from "../../../../server/session";
import { createUploadSession } from "../../../../server/uploads/service";

export async function POST(request: NextRequest) {
  if (!isRequestSameOrigin(request)) return NextResponse.json({ error: "Invalid origin." }, { status: 403 });
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  try {
    const data = await createUploadSession(await request.json(), user);
    return NextResponse.json(data, { headers: { "Cache-Control": "private, no-store" }, status: 201 });
  } catch (error) {
    const message = error instanceof ZodError
      ? error.issues[0]?.message ?? "Invalid upload request."
      : error instanceof Error ? error.message : "Unable to create upload session.";
    return NextResponse.json({ error: message }, { headers: { "Cache-Control": "private, no-store" }, status: 400 });
  }
}
