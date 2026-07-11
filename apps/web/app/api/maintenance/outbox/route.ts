import { createHash, timingSafeEqual } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { processAuthOperations } from "../../../../server/auth-operations";
import { processEmailOutbox } from "../../../../server/email-outbox";
import { cleanupAbandonedUploads } from "../../../../server/uploads/service";

export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  const authorization = request.headers.get("authorization");
  if (!secret || !authorizationMatches(authorization, secret)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const [authOperations, emailOutbox, uploads] = await Promise.all([
    processAuthOperations(),
    processEmailOutbox(),
    cleanupAbandonedUploads(),
  ]);
  return NextResponse.json({ authOperations, emailOutbox, uploads });
}

function authorizationMatches(authorization: string | null, secret: string) {
  if (!authorization) return false;
  const provided = createHash("sha256").update(authorization).digest();
  const expected = createHash("sha256").update(`Bearer ${secret}`).digest();
  return timingSafeEqual(provided, expected);
}
