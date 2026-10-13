import { notFound } from "next/navigation";
import { ConversationInbox } from "../../components/messaging/conversation-inbox";
import {
  normalizeListPageInfo,
  normalizeConversationSummaries,
} from "../../components/messaging/normalize";
import { PageTitle } from "../../components/page-title";
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
    <div className="page stack loose message-inbox-page">
      <PageTitle eyebrow="Your conversations" title="Messages">
        A private place to talk about properties, ask questions, and plan a viewing.
      </PageTitle>
      <ConversationInbox initialConversations={conversations} initialPageInfo={pageInfo} />
    </div>
  );
}
