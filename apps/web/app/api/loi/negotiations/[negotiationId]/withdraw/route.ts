import { loiRouteParamsSchema, withdrawLoiNegotiationSchema } from "@liber/validators";
import type { NextRequest } from "next/server";
import { loiErrorResponse, parseLoiJson, privateLoiJson } from "../../../../../../server/loi/http";
import { withdrawLoiNegotiation } from "../../../../../../server/loi/service";
import { isRequestSameOrigin } from "../../../../../../server/request-origin";

type Context = { params: Promise<{ negotiationId: string }> };

export async function POST(request: NextRequest, { params }: Context) {
  if (!isRequestSameOrigin(request)) return privateLoiJson({ error: "Invalid origin." }, 403);
  try {
    const { negotiationId } = loiRouteParamsSchema.parse(await params);
    return privateLoiJson(await withdrawLoiNegotiation({ ...(await parseLoiJson(request, withdrawLoiNegotiationSchema)), negotiationId }));
  } catch (error) {
    return loiErrorResponse(error);
  }
}
