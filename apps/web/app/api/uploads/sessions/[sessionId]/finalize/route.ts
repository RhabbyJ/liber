import { NextResponse, type NextRequest } from "next/server";
import { isRequestSameOrigin } from "../../../../../../server/request-origin";
import { getSessionUser } from "../../../../../../server/session";
import { finalizeUploadSession } from "../../../../../../server/uploads/service";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ sessionId: string }> },
) {
  if (!isRequestSameOrigin(request)) return NextResponse.json({ error: "Invalid origin." }, { status: 403 });
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  try {
    const { sessionId } = await params;
    const data = await finalizeUploadSession({ sessionId }, user);
    return NextResponse.json(data, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to finalize upload.";
    return NextResponse.json({ error: message }, { headers: { "Cache-Control": "private, no-store" }, status: 400 });
  }
}
