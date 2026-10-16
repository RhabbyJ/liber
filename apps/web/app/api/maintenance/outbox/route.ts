import { NextResponse, type NextRequest } from "next/server";
import { processAuthOperations } from "../../../../server/auth-operations";
import { processEmailOutbox } from "../../../../server/email-outbox";
import { maintenanceRequestAuthorized, runMaintenanceWorkers } from "../../../../server/maintenance-runner";
import { cleanupAbandonedUploads } from "../../../../server/uploads/service";

// The email worker claims for up to 20 seconds and may finish one in-flight
// send (up to 30 seconds for a tour notice) after that.
export const maxDuration = 60;

export async function GET(request: NextRequest) {
  if (!maintenanceRequestAuthorized(request.headers.get("authorization"))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { body, status } = await runMaintenanceWorkers("/api/maintenance/outbox", [
    { name: "authOperations", run: () => processAuthOperations() },
    { name: "emailOutbox", run: () => processEmailOutbox() },
    { name: "uploads", heartbeat: "upload-cleanup", run: () => cleanupAbandonedUploads() },
  ]);
  return NextResponse.json(body, { status });
}
