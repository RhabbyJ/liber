import { conversationRouteParamsSchema } from "@liber/validators";
import { getConversationThread } from "../../../../server/messaging/service";
import { messagingErrorResponse, privateMessagingJson } from "../../../../server/messaging/http";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ conversationId: string }> },
) {
  try {
    const { conversationId } = conversationRouteParamsSchema.parse(await params);
    return privateMessagingJson(await getConversationThread(conversationId));
  } catch (error) {
    return messagingErrorResponse(error);
  }
}
