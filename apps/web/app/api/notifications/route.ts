import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { markNotificationsRead, readNotificationActivity } from "../../../server/notifications";
import { readBoundedJson, RequestBodyError } from "../../../server/request-body";
import { isRequestSameOrigin } from "../../../server/request-origin";
import { getSessionUser } from "../../../server/session";

const readInput = z.union([
  z.object({ notificationId: z.string().trim().min(1).max(191) }).strict(),
  z.object({ all: z.literal(true) }).strict(),
]);

function privateJson(body: unknown, status = 200) {
  return NextResponse.json(body, { status, headers: { "Cache-Control": "private, no-store" } });
}

export async function GET() {
  try {
    const user = await getSessionUser();
    if (!user) return privateJson({ error: "Sign in to view notifications." }, 401);
    return privateJson(await readNotificationActivity(user));
  } catch {
    return privateJson({ error: "Notifications are temporarily unavailable." }, 503);
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const fetchSite = request.headers.get("sec-fetch-site");
    if ((fetchSite && fetchSite !== "same-origin" && fetchSite !== "none") || !isRequestSameOrigin(request)) {
      return privateJson({ error: "Invalid request origin." }, 403);
    }
    const user = await getSessionUser();
    if (!user) return privateJson({ error: "Sign in to update notifications." }, 401);
    const parsed = readInput.safeParse(await readBoundedJson(request, 1024));
    if (!parsed.success) return privateJson({ error: "Invalid notification update." }, 400);
    return privateJson(await markNotificationsRead(user, parsed.data));
  } catch (error) {
    if (error instanceof RequestBodyError) return privateJson({ error: error.message }, error.status);
    return privateJson({ error: "Notifications are temporarily unavailable." }, 503);
  }
}
