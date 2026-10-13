import { conversationRouteParamsSchema } from "@liber/validators";
import type { NextRequest } from "next/server";
import { tourMutationSchema } from "../../../../../lib/tour-scheduling";
import { MessagingError } from "../../../../../server/messaging/errors";
import { messagingErrorResponse, parseMessagingJson, privateMessagingJson } from "../../../../../server/messaging/http";
import { getConversationTour, mutateConversationTour } from "../../../../../server/messaging/tours";
import { isRequestSameOrigin } from "../../../../../server/request-origin";

type Context = { params: Promise<{ conversationId: string }> };

export async function GET(_request: NextRequest, { params }: Context) {
  try {
    const { conversationId } = conversationRouteParamsSchema.parse(await params);
    return privateMessagingJson(await getConversationTour(conversationId));
  } catch (error) { return messagingErrorResponse(error); }
}

export async function POST(request: NextRequest, { params }: Context) {
  if (!isRequestSameOrigin(request)) return privateMessagingJson({ error: "Invalid origin." }, 403);
  try {
    const { conversationId } = conversationRouteParamsSchema.parse(await params);
    const body = await parseMessagingJson(request, tourMutationSchema);
    return privateMessagingJson(await mutateConversationTour(conversationId, body));
  } catch (error) {
    if (error instanceof MessagingError && ["CONFLICT", "INVALID_INPUT"].includes(error.code)) {
      return privateMessagingJson({ error: error.message }, error.status);
    }
    return messagingErrorResponse(error);
  }
}
