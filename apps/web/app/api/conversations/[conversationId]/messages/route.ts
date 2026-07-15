import {
  conversationMessagesQuerySchema,
  conversationRouteParamsSchema,
  sendConversationMessageSchema,
} from "@liber/validators";
import type { NextRequest } from "next/server";
import { messagingErrorResponse, parseMessagingJson, privateMessagingJson } from "../../../../../server/messaging/http";
import {
  listConversationMessages,
  sendConversationMessage,
} from "../../../../../server/messaging/service";
import { isRequestSameOrigin } from "../../../../../server/request-origin";

type RouteContext = { params: Promise<{ conversationId: string }> };

export async function GET(request: NextRequest, { params }: RouteContext) {
  try {
    const { conversationId } = conversationRouteParamsSchema.parse(await params);
    const query = conversationMessagesQuerySchema.parse(Object.fromEntries(request.nextUrl.searchParams));
    return privateMessagingJson(await listConversationMessages({
      after: query.after,
      conversationId,
      cursor: query.cursor,
      pageSize: query.pageSize,
    }));
  } catch (error) {
    return messagingErrorResponse(error);
  }
}

export async function POST(request: NextRequest, { params }: RouteContext) {
  if (!isRequestSameOrigin(request)) return privateMessagingJson({ error: "Invalid origin." }, 403);
  try {
    const { conversationId } = conversationRouteParamsSchema.parse(await params);
    const body = await parseMessagingJson(request, sendConversationMessageSchema);
    return privateMessagingJson(await sendConversationMessage({ ...body, conversationId }), 201);
  } catch (error) {
    return messagingErrorResponse(error);
  }
}
