import { loiRouteParamsSchema } from "@liber/validators";
import type { NextRequest } from "next/server";
import { LoiError } from "../../../../../../server/loi/errors";
import { loiErrorResponse } from "../../../../../../server/loi/http";
import { alignedLoiRevision, createAlignedLoiPdf } from "../../../../../../server/loi/pdf";
import { getLoiNegotiation } from "../../../../../../server/loi/service";
import { consumeSharedRateLimit } from "../../../../../../server/shared-rate-limit";

export const runtime = "nodejs";
type Context = { params: Promise<{ negotiationId: string }> };

export async function GET(_request: NextRequest, { params }: Context) {
  try {
    const { negotiationId } = loiRouteParamsSchema.parse(await params);
    const negotiation = await getLoiNegotiation(negotiationId);
    const revision = alignedLoiRevision(negotiation);
    const limit = await consumeSharedRateLimit({ identifier: `${negotiation.id}:${negotiation.viewerRole}`, namespace: "loi-pdf", limit: 20, windowSeconds: 60 });
    if (!limit.allowed) throw new LoiError("RATE_LIMITED", "Please wait before trying again.", 429);
    const pdf = await createAlignedLoiPdf(negotiation);
    return new Response(new Uint8Array(pdf), { headers: {
      "Cache-Control": "private, no-store",
      "Content-Disposition": `attachment; filename="Liber-LOI-${negotiation.id}-v${revision.sequence}.pdf"`,
      "Content-Type": "application/pdf",
      "X-Content-Type-Options": "nosniff",
      "X-Robots-Tag": "noindex, noarchive",
    } });
  } catch (error) {
    return loiErrorResponse(error);
  }
}
