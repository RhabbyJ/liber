import { notFound } from "next/navigation";
import { MessageThread } from "../../../components/messaging/message-thread";
import { normalizeConversationThread } from "../../../components/messaging/normalize";
import { messagingTemplateLabel } from "../../../components/messaging/types";
import { MessagingError } from "../../../server/messaging/errors";
import { getConversationThread } from "../../../server/messaging/service";
import { buyerQuickReplyTemplates, sellerFollowUpTemplates } from "../../../server/messaging/templates";

export default async function ConversationPage({
  params,
}: {
  params: Promise<{ conversationId: string }>;
}) {
  const { conversationId } = await params;
  let conversation: Awaited<ReturnType<typeof getConversationThread>>;
  try {
    conversation = await getConversationThread(conversationId);
  } catch (error) {
    if (error instanceof MessagingError && (error.code === "NOT_FOUND" || error.code === "UNAVAILABLE")) notFound();
    throw error;
  }
  const thread = normalizeConversationThread(conversation);
  if (!thread) notFound();
  const templates = (thread.viewerRole === "SELLER" ? sellerFollowUpTemplates : buyerQuickReplyTemplates)
    .map((template) => ({
      key: template.key,
      label: messagingTemplateLabel(template.key),
      text: template.text,
      version: template.version,
    }));

  return <MessageThread initialLoi={{ available: false }} initialThread={thread} key={thread.id} templates={templates} />;
}
