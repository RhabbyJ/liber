import { NextResponse, type NextRequest } from "next/server";
import { expireMarketplaceState, pruneExpiredRateLimitBuckets } from "../../../../server/maintenance";
import { maintenanceRequestAuthorized, runMaintenanceWorkers } from "../../../../server/maintenance-runner";

// Expiry runs in one 15-second transaction; pruning is two bounded deletes.
export const maxDuration = 30;

export async function GET(request: NextRequest) {
  return runMaintenance(request);
}

export async function POST(request: NextRequest) {
  return runMaintenance(request);
}

async function runMaintenance(request: NextRequest) {
  if (!maintenanceRequestAuthorized(request.headers.get("authorization"))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { body, status } = await runMaintenanceWorkers("/api/maintenance/expire", [
    { name: "expiration", heartbeat: "marketplace-expiry", run: () => expireMarketplaceState() },
    { name: "rateLimitBuckets", run: () => pruneExpiredRateLimitBuckets() },
  ]);
  return NextResponse.json(body, { status });
}
