import { conversationRouteParamsSchema } from "@liber/validators";
import { messagingErrorResponse, privateMessagingJson } from "../../../../../server/messaging/http";
import { getMessagingLoiSummary } from "../../../../../server/messaging/loi-summary";
import { authorizeConversationAccess } from "../../../../../server/messaging/service";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ conversationId: string }> },
) {
  try {
    const { conversationId } = conversationRouteParamsSchema.parse(await params);
    await authorizeConversationAccess(conversationId);
    return privateMessagingJson(await getMessagingLoiSummary(conversationId));
  } catch (error) {
    return messagingErrorResponse(error);
  }
}
