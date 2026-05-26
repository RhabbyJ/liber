# Sprint 1 Progress

Last updated: 2026-05-26

- [x] P0-1/P0-2 buyer directory and buyer profile access now require durable `SellerAccess.status = APPROVED`, admin access, or buyer ownership for the profile page.
- [x] P0-3/P0-4 storage hardening migration added immutable verification-document storage policies and a private security-definer property ownership helper for property images.
- [x] P0-5/P0-6 API and buyer-directory throttling added for geocode, property enrichment, login, buyer search, buyer profile view, uploads, and invite sends; audit events added for search/profile/invite/document uploads.
- [x] P0-7 invite email now uses an `EmailOutbox` row created inside the invite transaction and processed by maintenance.
- [x] P0-8 notifications now require any authenticated user, and a seller notifications route exists.
- [x] P0-9 sensitive badge grants now require approved document evidence and store badge evidence/grant metadata.
- [x] P0-10 security headers and buyer-profile `noindex/noarchive` protections added.
- [x] P0-11 upload paths no longer trust original filenames; verification documents store hash, size, MIME, bucket/path, original filename, uploader, and review fields.
- [x] P0-12 smoke/unit coverage updates and final verification completed.

Verification:

- `npm run db:validate` passed.
- `npm run db:generate` passed.
- `npm run typecheck` passed.
- `npm run test -w @liber/validators -- src/index.test.ts` passed.
- `npm run test -w @liber/web -- server/rate-limit.test.ts server/email.test.ts server/domain.test.ts` passed.
- `npm run smoke:security` passed.
- `npm test` passed.
- `npm run smoke:no-auth-bypass` passed.
- `npm run build` passed.
- `npm run smoke:routes` passed.

---

You are acting as a senior security engineer and Next.js/Supabase architect for Liber.

Context:
Liber is a real estate buyer-directory marketplace. Sellers can search verified buyer profiles and send private listing invites. Buyers create searchable profiles with criteria, badges, verification documents, and invite notifications.

Current stack:

- Next.js App Router
- TypeScript
- Supabase Auth
- Supabase Postgres
- Supabase Storage
- Prisma
- Zod
- PostGIS
- Transactional email adapter

Important product boundary:
DO NOT implement escrow, payments, earnest-money custody, subscriptions, lender integrations, or new marketplace features. This task is only Sprint 1 security/product-hardening.

Your job:
Audit and patch the current codebase for the Sprint 1 vulnerabilities below. Make minimal, production-quality changes. Prefer secure defaults. Add tests/smoke tests where possible. Do not break the existing core loop:
buyer profile -> seller search -> seller private property -> seller sends invite -> buyer gets invite/notification.

Primary goals:

1. Protect buyer data.
2. Prevent unverified/random users from browsing buyer profiles.
3. Make verification documents immutable.
4. Rate-limit and auth-protect abuse-prone routes.
5. Improve document/badge integrity.
6. Fix invite email reliability.
7. Add security headers and route protection.
8. Add smoke tests proving the security posture.

Reference docs:

- Supabase RLS is the security boundary for browser/API data access, and Storage uses Postgres RLS policies:
  https://supabase.com/docs/guides/database/postgres/row-level-security
  https://supabase.com/docs/guides/storage/security/access-control
- Supabase notes that RLS policies can use security-definer functions, and such functions do not need to be exposed to PostgREST if explicitly schema-qualified:
  https://supabase.com/docs/guides/troubleshooting/do-i-need-to-expose-security-definer-functions-in-row-level-security-policies-iI0uOw
- Next.js Server Actions compare request origin and host for CSRF protection, and allowedOrigins should only include trusted origins:
  https://nextjs.org/docs/app/api-reference/config/next-config-js/serverActions

Known vulnerable/risky areas found in review:

- apps/web/server/contracts.ts
- apps/web/server/auth-actions.ts
- apps/web/server/form-actions.ts
- apps/web/app/buyers/[buyerProfileId]/page.tsx
- apps/web/app/api/property/enrich/route.ts
- apps/web/app/api/geo/geocode/route.ts
- packages/db/prisma/migrations/20260519000000_initial/migration.sql
- packages/db/prisma/migrations/20260521000005_audit_hardening/migration.sql
- Supabase Storage policies for verification-documents and property-images
- Notification logic
- Badge/admin review logic
- Invite email send path

Tasks:

────────────────────────────────────────
P0-1: Gate buyer public profiles
────────────────────────────────────────

Problem:
getPublicBuyerProfile() currently exposes buyer profile details by direct URL. /buyers/[buyerProfileId] renders sensitive buyer details such as name, photo, location, bio, budget, down payment, badges, and invite CTA. This should not be public.

Required fix:

- Require authenticated seller access before rendering full buyer profiles.
- Do not let any random logged-in user self-select seller and browse profiles.
- Add noindex/noarchive metadata or headers to buyer profile pages.
- If unauthenticated or unauthorized:
  - redirect to login, or
  - show a safe unauthorized state.
- Full buyer profile should only be viewable by:
  - approved seller users,
  - admins,
  - the buyer who owns the profile, if appropriate.
- Search cards and public previews should avoid exposing full personal/financial data unless seller access is approved.

Implementation guidance:

- Introduce a helper such as requireApprovedSellerAccess() or canViewBuyerDirectory(userId).
- This helper should check a durable permission/status, not just UserRole.SELLER.
- If no SellerAccess table/status exists, create one or equivalent minimal schema:
  SellerAccess:
  id
  userId unique
  status: PENDING | APPROVED | REJECTED | SUSPENDED
  createdAt
  updatedAt
  reviewedByUserId nullable
  reviewedAt nullable
- Existing sellers should not automatically get APPROVED unless this is a local/dev seed only.
- Admins may approve/revoke seller access.
- Buyer search and buyer profile view must call this helper.

Acceptance tests:

- Anonymous user cannot view /buyers/:id.
- Authenticated buyer-only user cannot view /buyers/:id.
- User who merely selected SELLER role but is not approved cannot search buyer directory or view buyer profile.
- Approved seller can search and view.
- Admin can view.

────────────────────────────────────────
P0-2: Stop self-service seller directory access
────────────────────────────────────────

Problem:
chooseRole() allows an authenticated user to add SELLER role to themselves. searchBuyers() only checks SELLER role. This lets a random user browse the directory.

Required fix:

- Keep role selection if needed for onboarding UX, but role alone must not grant buyer-directory access.
- Directory/search/profile/invite access must require SellerAccess.status = APPROVED or equivalent.
- Add UI copy for pending seller access if needed.
- Add server-side enforcement. Do not rely only on UI hiding.

Acceptance tests:

- Self-selected SELLER with pending access cannot call searchBuyers().
- Self-selected SELLER with pending access cannot send invites.
- Approved seller can search/send invite.

────────────────────────────────────────
P0-3: Make verification documents immutable
────────────────────────────────────────

Problem:
Supabase Storage policies currently allow document owners to update/delete files in the verification-documents bucket. This undermines verification integrity because a user can upload a valid document, get approved, then mutate/delete the file.

Required fix:

- Remove owner UPDATE and DELETE policies for verification-documents.
- Only allow authenticated owner INSERT/upload under their own path.
- Only allow owner SELECT/read for their own docs if required.
- Only admin/service-role may delete, and deletions must be audited.
- Ideally: no user update/delete on verification docs ever.
- Add DB fields on verification document rows:
  fileSha256
  fileSizeBytes
  mimeType
  storageBucket
  storagePath
  originalFilename
  uploadedByUserId
  uploadedAt
  reviewedByUserId nullable
  reviewedAt nullable
  reviewStatus
  reviewNotes nullable
- Compute sha256 at upload time server-side if upload flows are server-mediated.
- If direct browser-to-storage upload exists, add a server-side finalization step that reads/verifies object metadata and computes/stores hash where feasible.
- Badge approvals should reference immutable evidence/document IDs where possible.

Important:
Supabase Storage policies are part of the real security boundary because Storage uses RLS policies.

Acceptance tests/smoke:

- Owner can upload verification document.
- Owner cannot update/overwrite an existing verification document object.
- Owner cannot delete verification document object.
- Admin/service can read/review.
- Badge/review record still points to immutable storage path/hash.
- Attempted overwrite/delete fails through Supabase client.

────────────────────────────────────────
P0-4: Fix property image storage policy fragility
────────────────────────────────────────

Problem:
property-images storage policies query SellerProperty directly. If SellerProperty has RLS enabled and no matching browser policies, cross-table checks may fail or behave unexpectedly.

Required fix:

- Create a security-definer function in a private schema, e.g. app_private.owns_property(property_id uuid/text), that checks whether auth.uid() owns the seller property.
- Use that function inside Storage RLS policies instead of directly querying SellerProperty.
- Schema-qualify the function inside policies.
- Harden the function search_path.
- Revoke public execution if appropriate while preserving policy usage.
- Add smoke tests for owner/non-owner upload/read/delete behavior.

Acceptance tests:

- Property owner can upload images for their property.
- Non-owner cannot upload to another property path.
- Owner can manage allowed property images if the product requires it.
- Verification document immutability remains separate and stricter.

────────────────────────────────────────
P0-5: Auth-protect and rate-limit public API routes
────────────────────────────────────────

Problem:
These routes are public/unauthenticated and can burn third-party API quota or leak data:

- /api/property/enrich
- /api/geo/geocode

Required fix:

- /api/property/enrich:
  - require authenticated approved seller access.
  - rate-limit per user and per IP.
  - validate request body with Zod.
  - return safe error messages.
  - do not expose provider errors/secrets.
- /api/geo/geocode:
  - require auth unless it is absolutely needed on a public landing/onboarding screen.
  - if public access remains, add strict IP rate limits and input length constraints.
  - rate-limit per user/IP.
  - validate input.
- Add a reusable rate limit utility if one already does not exist.
- Rate limits should cover:
  - login/signup/resend if present
  - searchBuyers
  - buyer profile view
  - sendInvite
  - uploads
  - geocode
  - property enrich

Acceptance tests:

- Anonymous request to property enrichment is rejected.
- Unapproved seller request is rejected.
- Approved seller request works.
- Repeated requests hit rate limit.
- Invalid input is rejected with 400, not 500.

────────────────────────────────────────
P0-6: Add buyer search/profile-view anti-scraping controls
────────────────────────────────────────

Problem:
Even with approved seller access, buyer search/profile pages can be scraped.

Required fix:

- Add per-user and per-IP rate limits to buyer search and buyer profile view.
- Add audit logging for:
  - buyer search
  - buyer profile view
  - invite sent
  - document upload
  - admin badge grant/revoke
  - seller access approval/revoke
- Add suspicious activity fields or events if easy:
  - high profile view velocity
  - high search velocity
  - repeated blocked access attempts

Acceptance tests:

- Normal approved seller can search.
- Excessive search/profile requests are blocked.
- Audit log receives events.

────────────────────────────────────────
P0-7: Fix invite email reliability with outbox pattern
────────────────────────────────────────

Problem:
sendInvite() creates DB invite/notifications inside a transaction, then sends email afterward. If email fails, the invite exists but the action throws. Retrying may hit duplicate active invite constraint.

Required fix:

- Implement an EmailOutbox table or equivalent:
  EmailOutbox:
  id
  type
  to
  subject/templateName
  payload json
  status: PENDING | SENDING | SENT | FAILED
  attempts
  lastError nullable
  nextAttemptAt nullable
  createdAt
  updatedAt
  sentAt nullable
- Inside the invite transaction:
  - create invite
  - create notifications
  - enqueue email outbox row
- Do not send email inline as part of the user-facing action.
- Add a worker/cron/server function to process pending email jobs.
- Retry with max attempts and backoff.
- UI result should treat invite creation as success even if email is pending.
- Keep buyer in-app notification as the source of truth.

Acceptance tests:

- sendInvite creates invite + notification + outbox row atomically.
- If email provider fails, invite remains valid and outbox row is FAILED/PENDING retry.
- Re-running processor retries pending failed emails.
- Duplicate invite is not created from email failure.

────────────────────────────────────────
P0-8: Fix seller notifications
────────────────────────────────────────

Problem:
sendInvite() and maintenance jobs create seller notifications, but listNotifications() currently requires BUYER. Seller-only users may not be able to see notifications.

Required fix:

- listNotifications() should require authenticated user, not BUYER role only.
- Return notifications for the current user.
- Keep per-user ownership checks.
- Add tests for buyer, seller, and admin users.

Acceptance tests:

- Buyer sees buyer notifications.
- Seller sees seller notifications.
- User cannot see another user’s notifications.

────────────────────────────────────────
P0-9: Tie badges to evidence
────────────────────────────────────────

Problem:
grantBadge() can grant active badges manually without requiring approved evidence/document linkage.

Required fix:

- Badge grants should optionally/ideally require a verification document or review evidence depending on badge type.
- For financial/preapproval/funds/identity badges, require reviewed document evidence.
- Badge row should store:
  evidenceDocumentId nullable/required by badge type
  grantedByUserId
  grantedAt
  expiresAt
  source
- Do not break existing badges if migration is needed; backfill legacy rows with source = LEGACY_ADMIN if necessary.
- Add admin UI/API guardrails so risky badge types cannot be granted without approved document evidence.
- Badge expiry cron should remain working.

Acceptance tests:

- Admin cannot grant preapproval/funds/identity badge without approved evidence.
- Admin can grant badge with approved evidence.
- Expired badges are not displayed as active.
- Badge evidence survives user document immutability rules.

────────────────────────────────────────
P0-10: Add security headers and origin protection
────────────────────────────────────────

Required fix:

- Add global security headers in Next config/middleware:
  - Content-Security-Policy, at least a reasonable starter policy compatible with app assets
  - X-Content-Type-Options: nosniff
  - Referrer-Policy
  - Permissions-Policy
  - frame-ancestors or X-Frame-Options equivalent
- Ensure buyer profile pages are noindex/noarchive.
- Review Next serverActions.allowedOrigins:
  - Do not allow wildcard unsafe origins.
  - Only include trusted production/preview domains if required.
- Add origin/referer checks for state-changing route handlers where appropriate.
- Keep same-origin defaults where possible.

Acceptance tests:

- Key app routes return security headers.
- Buyer profile route returns noindex/noarchive.
- State-changing route rejects bad origin where applicable.

────────────────────────────────────────
P0-11: Harden file uploads
────────────────────────────────────────

Existing:
assertAllowedFile() checks magic bytes and max size.

Required improvements:

- Keep magic-byte checks.
- Normalize filenames; never trust original filename for path.
- Store original filename only as metadata.
- Enforce allowed MIME/type by document category.
- Strip metadata for public profile/property images if feasible.
- Add TODO or integration hook for malware scanning if not implementing now.
- Uploaded verification docs should never be served publicly.
- Signed URLs should be short-lived.

Acceptance tests:

- Fake extension with bad magic bytes is rejected.
- Oversized files rejected.
- Public image path cannot access private verification docs.
- Verification docs only via signed URL/admin/owner access.

────────────────────────────────────────
P0-12: Add security smoke tests
────────────────────────────────────────

Add or update smoke tests/scripts:

- no demo auth strings return
- protected route access matrix
- buyer directory access matrix
- storage policy matrix
- public API route auth/rate limit matrix
- invite email outbox behavior
- notification ownership
- badge evidence requirements

Suggested commands to pass:

- npm run db:validate
- npm run typecheck
- npm test
- npm run build
- npm run smoke:routes
- npm run smoke:no-auth-bypass
- add npm run smoke:security if helpful

If the repo uses pnpm instead of npm, use existing package manager scripts. Do not introduce a second package manager.

Output required from you:

1. Implement the fixes.
2. List every file changed.
3. Explain each security issue fixed in plain English.
4. Include migration notes.
5. Include manual Supabase dashboard steps, if any.
6. Include exact commands run and results.
7. Include any remaining risks or TODOs.

Non-goals:

- Do not implement escrow.
- Do not implement money movement.
- Do not implement subscriptions.
- Do not implement lender APIs.
- Do not redesign the app.
- Do not add major new product features.
- Do not rely on UI hiding for security.
- Do not weaken RLS to make tests pass.
- Do not expose service-role keys to the browser.
