import { messageRouteParamsSchema, reportMessageSchema } from "@liber/validators";
import type { NextRequest } from "next/server";
import { messagingErrorResponse, parseMessagingJson, privateMessagingJson } from "../../../../../server/messaging/http";
import { reportMessage } from "../../../../../server/messaging/service";
import { isRequestSameOrigin } from "../../../../../server/request-origin";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ messageId: string }> },
) {
  if (!isRequestSameOrigin(request)) return privateMessagingJson({ error: "Invalid origin." }, 403);
  try {
    const { messageId } = messageRouteParamsSchema.parse(await params);
    const body = await parseMessagingJson(request, reportMessageSchema);
    return privateMessagingJson(await reportMessage({ messageId, ...body }), 201);
  } catch (error) {
    return messagingErrorResponse(error);
  }
}
