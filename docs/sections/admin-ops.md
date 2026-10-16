# Section: Admin Operations

## Purpose

Owns internal admin review and moderation tools: users, seller access, buyer profiles, documents, badges, invites, reports, and audit logs.

## Main files

- `apps/web/app/admin/**`
- `apps/web/server/contracts.ts` — `"use server"` re-export barrel; the logic lives in `apps/web/server/domain/**`
- `apps/web/server/domain/admin-users.ts` — users list, seller-access review, suspension
- `apps/web/server/domain/admin-moderation.ts` — buyer-profile and invite moderation
- `apps/web/server/domain/audit-log.ts`
- `apps/web/server/domain/document-review.ts` and `badges.ts`
- `apps/web/server/seller-access-review.ts`
- `apps/web/server/authz.ts`
- `apps/web/server/messaging/service.ts`

## Invariants

- Admin pages are internal only.
- Admin role is server-controlled.
- Buyer badge cards show private account name/email only through the admin-authorized buyer query. Document approval precedes badge grant; missing or incompatible approved evidence disables the grant with a link to Documents. Grant/revoke actions show inline feedback and refresh affected buyer/admin views. Derived cash-buyer signals have no independent revoke control.
- Sensitive admin actions should write audit logs.
- Authenticated admins may review their own seller access, evidence, and badges and may moderate their own account. Self-review uses the same server authorization, evidence rules, rate limits, and audit trail as reviewing another account; it never grants the admin role.
- Seller-directory review returns expected validation and rate-limit failures inline. Reviews lock the target user and recheck the current access before writing. Repeating the current status is a no-op that preserves the original review and creates no extra audit or notification. The users page disables redundant approval and approval of suspended accounts.
- Suspension and reinstatement are confirm-first controls on `/admin/users` with an optional audit-only reason and the 30/hour `admin-moderation` budget. Both lock the user row first (then buyer profile, seller access, properties, the same order as invite creation) and are no-ops when the account is already in the target state.
  - Suspension also leaves an admin-`HIDDEN` buyer profile hidden rather than overwriting it, and queues a `BAN_USER` Auth operation with a per-change idempotency key (`ban-user:<user>:<operation>`), so suspending again after a reinstatement bans again.
  - Reinstatement (`reinstate_user`) sets the user `ACTIVE`, returns a `SUSPENDED` buyer profile as a `DRAFT` to republish (or `HIDDEN` when the last hide/unhide decision was a hide), moves `SUSPENDED` seller access to `PENDING` for a new review, clears the suspension's property flags and restores archived properties to their evidence state (`READY_FOR_INVITES` only with current approval and attestation), keeps withdrawn invites and read-only conversations closed, notifies the user (`account_reinstated`), and queues an `UNBAN_USER` Auth operation.
  - `queueAuthOperation` settles unclaimed operations of the opposite type as superseded. The worker claims one account's operations in creation order, rechecks the account status before each Supabase call (`ban_duration` `876000h` to ban, `none` to unban), and completes a stale operation without calling Supabase.
- Admins can reject a seller-directory request (pending, missing, or suspended access) with a required reason of up to 500 characters. The seller's `seller_access_reviewed` notice shows the reason, and the audit row keeps it with the previous and new status. Approved access is withdrawn by suspending it, not by rejection. Repeating a rejection is a no-op.
- Seller-directory approval and property ownership approval are separate gates. The users page links to document review and explains that each property needs current approved ownership evidence before invites can be sent.
- `/admin/documents` has separate synthetic journey controls only while the existing CEO preview flags are enabled and the server session is an admin. The closed cohort is `liber-demo-seller-20260925-journey@example.com` and `liber-demo-buyer-20260925-journey@example.com`; there is no general verification bypass. Approval requires active approved seller access, an unflagged/unarchived property, and the seller's current normal authority attestation. It writes `property_synthetic_test_approval`, never a fabricated verification document or `PropertyVerificationDecision`. Revoke writes `property_synthetic_test_revocation` and restores the real current evidence state. Repeated decisions are harmless. These controls return validation and save failures inline.
- True-production readiness blocks any approved property whose current identity's latest test-review audit is an approval. Revoked markers and obsolete property versions do not count as active overrides.
- `/admin/buyer-profiles` hides and unhides profiles under the profile row lock, with an optional audit-only reason and the 30/hour `admin-moderation` budget. Hide records the replaced visibility (`hide_buyer_profile` metadata `previousVisibility`); repeating it is a no-op. Unhide (`unhide_buyer_profile`) restores `ACTIVE` only when the latest hide recorded `ACTIVE` and the stored profile still passes `publicationGap`; otherwise it returns the profile to the buyer as a `DRAFT` they can republish. It refuses suspended accounts (reinstate first) and notifies the buyer (`buyer_profile_unhidden`).
- `/admin/invites` withdraws an open invite through the same locked transition as a seller withdrawal. It requires a reason that stays in the `admin_withdraw_invite` audit row (with the previous status and both parties), notifies the buyer and the seller (`invite_withdrawn`), and shares the 30/hour `admin-moderation` budget. Closed invites have no control.
- Conversation content access is report-driven. Report reads, status changes,
  resolution, and redaction are audited; admins do not receive a general inbox
  or unrestricted conversation browser.
- Customer navigation must not expose admin analytics or admin-only surfaces.
- `/preview-tools` is not itself the admin review UI. In the explicitly enabled
  CEO preview, every active signed-in account is auto-granted `ADMIN` (and
  sellers are auto-approved for directory access) on session load so `/admin`
  and seller search stay reachable during demos. `/preview-tools` remains a
  status/fallback page for those same current-user-only elevations. It must not
  reimplement admin review queues or act on other users.

## Agent notes

Admin UX can be utilitarian. Correctness, auditability, and privacy matter more than polish.

## Self test pre-approval

`server/test-preapproval.ts` and `/admin/badges/test-actions.ts` provide a distinct demo-only self marker. The server derives the target from the signed-in admin, locks the User then own BuyerProfile, rechecks active ADMIN/BUYER roles, requires explicit test confirmation on grant, and limits changes to 30/hour. Grants/revocations are audited and repeated decisions are no-ops. Grants last 24 hours. This tool never writes BuyerBadge or VerificationDocument and cannot target another buyer. No migration or new environment setting is required; it uses the existing CEO preview gate.
