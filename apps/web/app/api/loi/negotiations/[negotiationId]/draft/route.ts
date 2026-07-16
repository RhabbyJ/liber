import { discardLoiDraftSchema, loiRouteParamsSchema, saveLoiDraftEnvelopeSchema } from "@liber/validators";
import type { NextRequest } from "next/server";
import { loiErrorResponse, parseLoiJson, privateLoiJson } from "../../../../../../server/loi/http";
import { discardLoiDraft, saveLoiDraft } from "../../../../../../server/loi/service";
import { isRequestSameOrigin } from "../../../../../../server/request-origin";

type Context = { params: Promise<{ negotiationId: string }> };

export async function PUT(request: NextRequest, { params }: Context) {
  if (!isRequestSameOrigin(request)) return privateLoiJson({ error: "Invalid origin." }, 403);
  try {
    const { negotiationId } = loiRouteParamsSchema.parse(await params);
    return privateLoiJson(await saveLoiDraft({ ...(await parseLoiJson(request, saveLoiDraftEnvelopeSchema)), negotiationId }));
  } catch (error) {
    return loiErrorResponse(error);
  }
}

export async function DELETE(request: NextRequest, { params }: Context) {
  if (!isRequestSameOrigin(request)) return privateLoiJson({ error: "Invalid origin." }, 403);
  try {
    const { negotiationId } = loiRouteParamsSchema.parse(await params);
    return privateLoiJson(await discardLoiDraft({ ...(await parseLoiJson(request, discardLoiDraftSchema)), negotiationId }));
  } catch (error) {
    return loiErrorResponse(error);
  }
}
