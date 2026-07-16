import { loiRouteParamsSchema, submitLoiRevisionSchema } from "@liber/validators";
import type { NextRequest } from "next/server";
import { loiErrorResponse, parseLoiJson, privateLoiJson } from "../../../../../../server/loi/http";
import { submitLoiRevision } from "../../../../../../server/loi/service";
import { isRequestSameOrigin } from "../../../../../../server/request-origin";

type Context = { params: Promise<{ negotiationId: string }> };

export async function POST(request: NextRequest, { params }: Context) {
  if (!isRequestSameOrigin(request)) return privateLoiJson({ error: "Invalid origin." }, 403);
  try {
    const { negotiationId } = loiRouteParamsSchema.parse(await params);
    return privateLoiJson(await submitLoiRevision({ ...(await parseLoiJson(request, submitLoiRevisionSchema)), negotiationId }), 201);
  } catch (error) {
    return loiErrorResponse(error);
  }
}

