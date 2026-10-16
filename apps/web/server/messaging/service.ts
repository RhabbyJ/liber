// Public messaging service API. Route handlers, pages and other server modules
// import from here; each operation lives in a cohesive module:
//   access.ts             session guards and the conversation eligibility SQL
//   locks.ts              pair -> Invite -> Conversation -> sender lock helpers
//   message-rows.ts       Message projection, DTO mapping and marker lookups
//   conversation-reads.ts inbox listing, threads and message history pages
//   send.ts               guided/plain-text sends and quotas
//   read-state.ts         read markers and unread-email cancellation
//   blocks-and-mutes.ts   mutes, permanent blocks and invite pair checks
//   reports.ts            message reports and the admin moderation queue
//   tour-gate.ts          tour scheduling eligibility and locked delivery
//   unread-email.ts       content-free unread email outbox jobs
export {
  authorizeConversationAccess,
  getConversationThread,
  listConversationMessages,
  listConversations,
} from "./conversation-reads";
export { sendConversationMessage } from "./send";
export { markConversationRead } from "./read-state";
export {
  blockConversationUser,
  blockUserByBuyerProfile,
  lockAndAssertInvitePairAvailable,
  setConversationMuted,
  usersHaveMessagingBlock,
} from "./blocks-and-mutes";
export {
  getAdminMessageReport,
  listAdminMessageReports,
  reportMessage,
  resolveMessageReport,
} from "./reports";
export {
  getConversationScheduleContext,
  getConversationScheduleDeliveryContext,
  withConversationScheduleDelivery,
  withConversationScheduleMutation,
} from "./tour-gate";
