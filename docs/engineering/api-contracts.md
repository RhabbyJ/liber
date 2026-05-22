# API Contracts

Use server actions or route handlers. Every mutation must validate input with Zod and perform a server-side permission check.

## Buyer

- `createBuyerProfile(input)`
- `updateBuyerProfile(input)`
- `upsertBuyerCriteria(input)`
- `setBuyerProfileVisibility(status)`
- `uploadBuyerAvatar(file)`
- `uploadBuyerVerificationDocument(documentType, file)`
- `listBuyerInvites()`
- `respondToInvite(inviteId, response)`
- `listNotifications()`

## Seller

- `searchBuyers(filters)`
- `getBuyerProfileForSeller(buyerProfileId)`
- `createSellerProperty(input)`
- `updateSellerProperty(propertyId, input)`
- `uploadPropertyImage(propertyId, file)`
- `uploadOwnershipDocument(propertyId, file)`
- `sendInvite(input)`
- `listSellerInvites()`

## Admin

- `listUsers(filters)`
- `listPendingDocuments()`
- `reviewDocument(documentId, decision)`
- `grantBadge(input)`
- `revokeBadge(badgeId)`
- `suspendUser(userId)`
- `hideBuyerProfile(buyerProfileId)`
- `listAuditLog(filters)`

## Cross-Cutting Rules

- Seller invite actions require seller role.
- Admin actions require admin role.
- Seller can only invite from owned properties.
- Buyer profile must be active before receiving invites.
- Badge status must be active and unexpired to affect search.
- Invite send and admin badge grant/revoke actions create buyer notifications.
- Admin document review creates a notification for the submitting user.
- Seller search filters are structured only. Supported fields are city/state, budget ceiling, property category/subtype, bedrooms, bathrooms, square feet, lot size, cap rate, units, active badges, minimum rating, minimum review count, sort, and optional radius search with `centerLat`, `centerLng`, and `radiusMiles`.
- `POST /api/maintenance/expire` requires `Authorization: Bearer $CRON_SECRET` and marks expired badges plus stale sent/viewed invites as expired.
