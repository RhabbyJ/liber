import { loiRevisionPageQuerySchema, loiRouteParamsSchema } from "@liber/validators";
import type { NextRequest } from "next/server";
import { loiErrorResponse, privateLoiJson } from "../../../../../../server/loi/http";
import { getLoiRevisionPage } from "../../../../../../server/loi/service";

type Context = { params: Promise<{ negotiationId: string }> };

export async function GET(request: NextRequest, { params }: Context) {
  try {
    const { negotiationId } = loiRouteParamsSchema.parse(await params);
    const { beforeSequence } = loiRevisionPageQuerySchema.parse({
      beforeSequence: request.nextUrl.searchParams.get("beforeSequence"),
    });
    return privateLoiJson(await getLoiRevisionPage(negotiationId, beforeSequence));
  } catch (error) {
    return loiErrorResponse(error);
  }
}
