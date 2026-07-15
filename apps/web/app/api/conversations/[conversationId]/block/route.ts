import { blockConversationSchema, conversationRouteParamsSchema } from "@liber/validators";
import type { NextRequest } from "next/server";
import { messagingErrorResponse, parseMessagingJson, privateMessagingJson } from "../../../../../server/messaging/http";
import { blockConversationUser } from "../../../../../server/messaging/service";
import { isRequestSameOrigin } from "../../../../../server/request-origin";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ conversationId: string }> },
) {
  if (!isRequestSameOrigin(request)) return privateMessagingJson({ error: "Invalid origin." }, 403);
  try {
    const { conversationId } = conversationRouteParamsSchema.parse(await params);
    const body = await parseMessagingJson(request, blockConversationSchema);
    return privateMessagingJson(await blockConversationUser({ conversationId, ...body }));
  } catch (error) {
    return messagingErrorResponse(error);
  }
}
