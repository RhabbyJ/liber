import { notFound } from "next/navigation";
import { ConversationInbox } from "../../../components/messaging/conversation-inbox";
import { MessageThread } from "../../../components/messaging/message-thread";
import {
  normalizeConversationSummaries,
  normalizeConversationThread,
  normalizeListPageInfo,
} from "../../../components/messaging/normalize";
import { messagingTemplateLabel } from "../../../components/messaging/types";
import { MessagingError } from "../../../server/messaging/errors";
import { getConversationThread, listConversations } from "../../../server/messaging/service";
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
  // The side inbox is a convenience; the thread still renders if the list cannot load.
  const inbox = await listConversations().catch(() => null);
  const conversations = inbox ? normalizeConversationSummaries(inbox) : [];
  const pageInfo = inbox ? normalizeListPageInfo(inbox) : { hasMore: false, moderationRevision: null, nextCursor: null };
  const templates = (thread.viewerRole === "SELLER" ? sellerFollowUpTemplates : buyerQuickReplyTemplates)
    .map((template) => ({
      key: template.key,
      label: messagingTemplateLabel(template.key),
      text: template.text,
      version: template.version,
    }));

  return (
    <div className="chat-shell is-thread">
      <aside aria-label="Conversations" className="chat-sidebar">
        <h2 className="chat-sidebar-title">Messages</h2>
        <ConversationInbox activeId={thread.id} initialConversations={conversations} initialPageInfo={pageInfo} />
      </aside>
      <MessageThread
        counterpartAvatarVariant={conversations.find((item) => item.id === thread.id)?.counterpartAvatarVariant ?? null}
        initialLoi={{ available: false }}
        initialThread={thread}
        key={thread.id}
        templates={templates}
      />
    </div>
  );
}
