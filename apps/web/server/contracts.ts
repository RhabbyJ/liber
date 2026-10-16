import "server-only";

// Re-export barrel for the domain modules in ./domain, kept so existing
// importers do not change. Every function authorizes its own caller. These are
// plain server functions called from pages, route handlers, and the
// form-actions.ts Server Action boundary; this file is deliberately not a
// "use server" module, so none of them is a client-callable action endpoint.
export { getCurrentBuyerProfile, setBuyerAvatarVariant } from "./domain/buyer-profile";
export {
  getAuthorizedBuyerProfile,
  getBuyerProfileForSeller,
  getCurrentSellerAccess,
  searchBuyers,
} from "./domain/seller-directory";
export {
  createSellerProperty,
  getSellerProperty,
  listSellerProperties,
  updateSellerProperty,
  type OwnershipEvidenceStatus,
} from "./domain/seller-properties";
export { sendInvite } from "./domain/invite-send";
export { listBuyerInvites, listSellerInvites, respondToInvite, withdrawSellerInvite } from "./domain/invites";
export { listUsers, reinstateUser, reviewSellerAccess, suspendUser } from "./domain/admin-users";
export {
  hideBuyerProfile,
  listAdminBuyerProfiles,
  listAdminInvites,
  unhideBuyerProfile,
  withdrawInviteAsAdmin,
} from "./domain/admin-moderation";
export { listAuditLog } from "./domain/audit-log";
export { listPendingDocuments, reviewDocument } from "./domain/document-review";
export { grantBadge, revokeBadge } from "./domain/badges";
export { listNotifications } from "./domain/notification-feed";
