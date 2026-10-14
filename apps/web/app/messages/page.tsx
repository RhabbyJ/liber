import { notFound } from "next/navigation";
import { ConversationInbox } from "../../components/messaging/conversation-inbox";
import {
  normalizeListPageInfo,
  normalizeConversationSummaries,
} from "../../components/messaging/normalize";
import { Icon } from "../../components/icon";
import { MessagingError } from "../../server/messaging/errors";
import { listConversations } from "../../server/messaging/service";

export default async function MessagesPage() {
  let result: Awaited<ReturnType<typeof listConversations>>;
  try {
    result = await listConversations();
  } catch (error) {
    if (error instanceof MessagingError && (error.code === "NOT_FOUND" || error.code === "UNAVAILABLE")) notFound();
    throw error;
  }
  const conversations = normalizeConversationSummaries(result);
  const pageInfo = normalizeListPageInfo(result);

  return (
    <div className="chat-shell is-list">
      <aside aria-label="Conversations" className="chat-sidebar">
        <h1 className="chat-sidebar-title">Messages</h1>
        <ConversationInbox initialConversations={conversations} initialPageInfo={pageInfo} />
      </aside>
      <section aria-label="No conversation selected" className="chat-placeholder">
        <span aria-hidden="true" className="chat-placeholder-icon"><Icon name="message" size={32} /></span>
        <h2>Your property conversations</h2>
        <p>Pick a conversation to keep talking about a home. Invites, tours and LOIs all live in the chat.</p>
      </section>
    </div>
  );
}
