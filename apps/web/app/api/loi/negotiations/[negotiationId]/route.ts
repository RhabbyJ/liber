import { loiRouteParamsSchema } from "@liber/validators";
import type { NextRequest } from "next/server";
import { loiErrorResponse, privateLoiJson } from "../../../../../server/loi/http";
import { getLoiNegotiation } from "../../../../../server/loi/service";

type Context = { params: Promise<{ negotiationId: string }> };

export async function GET(_request: NextRequest, { params }: Context) {
  try {
    const { negotiationId } = loiRouteParamsSchema.parse(await params);
    return privateLoiJson(await getLoiNegotiation(negotiationId));
  } catch (error) {
    return loiErrorResponse(error);
  }
}

