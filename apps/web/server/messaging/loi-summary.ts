import { normalizeMessagingLoiSummary, type MessagingLoiSummary } from "../../lib/messaging-loi-summary";
import { getLoiForConversation } from "../loi/service";

const FAILURE_LOG_INTERVAL_MS = 60_000;
let nextFailureLogAt = 0;

export async function getMessagingLoiSummary(conversationId: string): Promise<MessagingLoiSummary> {
  try {
    return normalizeMessagingLoiSummary(await getLoiForConversation(conversationId));
  } catch {
    logSummaryFailure();
    return { available: false };
  }
}

function logSummaryFailure() {
  const now = Date.now();
  if (now < nextFailureLogAt) return;
  nextFailureLogAt = now + FAILURE_LOG_INTERVAL_MS;
  console.error("Messaging LOI summary unavailable.", { code: "LOI_SUMMARY_UNAVAILABLE" });
}
