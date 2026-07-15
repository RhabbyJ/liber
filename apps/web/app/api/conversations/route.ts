import { conversationListQuerySchema } from "@liber/validators";
import type { NextRequest } from "next/server";
import { listConversations } from "../../../server/messaging/service";
import { messagingErrorResponse, privateMessagingJson } from "../../../server/messaging/http";

export async function GET(request: NextRequest) {
  try {
    const query = conversationListQuerySchema.parse(Object.fromEntries(request.nextUrl.searchParams));
    return privateMessagingJson(await listConversations(query));
  } catch (error) {
    return messagingErrorResponse(error);
  }
}
