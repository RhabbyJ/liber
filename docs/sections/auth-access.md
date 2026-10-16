# Section: Auth and Access

## Purpose

Owns sign-up, login, role selection, session loading, protected-route redirects, approved seller access, and admin-only gates.

## Main files

- `apps/web/server/session.ts`
- `apps/web/server/authz.ts`
- `apps/web/server/access.ts`
- `apps/web/server/auth-actions.ts`
- `apps/web/server/auth-operations.ts`
- `apps/web/server/ceo-preview.ts`
- `apps/web/server/auth-identity.ts`
- `apps/web/server/auth-rate-limit.ts`
- `apps/web/server/shared-rate-limit.ts`
- `apps/web/lib/auth-identity.ts`
- `apps/web/server/request-origin.ts`
- `apps/web/proxy.ts`
- `apps/web/app/api/auth/login/route.ts`
- `apps/web/app/auth/callback/route.ts`
- `apps/web/app/login/page.tsx`
- `apps/web/app/login/login-view.tsx`
- `apps/web/components/auth-shell.tsx`
- `apps/web/components/login-form.tsx`
- `apps/web/components/signup-form.tsx`
- `apps/web/app/profile/page.tsx`
- `apps/web/app/preview-tools/**`
- `apps/web/app/signup/page.tsx`
- `apps/web/app/signup/signup-view.tsx`
- `apps/web/app/messages/**`

## Invariants

- Roles are not enough for full seller-directory access; `SellerAccess.status = APPROVED` is required for search, buyer-profile reads, and invites.
- Sellers without approved access (pending, rejected, missing or suspended) see only the signed-in privacy-safe preview DTO on the shared map at `/`, like any signed-in account. This never relaxes the approved search/profile/invite gates.
- Verified callbacks and successful password logins idempotently ensure a SELLER has an access row. A new row starts `PENDING`; an existing review status is preserved, and neither path can approve access.
- Admin cannot be self-assigned through ordinary customer signup or profile UI.
- The only self-service exceptions are the server-gated CEO-preview elevations.
  They require exact `ceo-preview` target and enablement values. While enabled,
  every active signed-in session auto-receives `ADMIN`, and sellers
  auto-receive non-suspended `APPROVED` directory access via
  `ensureCeoPreviewDemoPrivileges` on session load. `/preview-tools` remains a
  current-user-only manual fallback that writes the same distinct audit events.
  True-production readiness rejects these markers. Neither path mutates another
  user or restores `SUSPENDED` seller access.
- Suspended users must not continue into protected workflows.
- `/messages` and every conversation API require an active authenticated
  application user. Participant membership is checked server-side on every
  canonical operation; a role alone never grants conversation access.
- Suspension updates application user/profile/seller/property/invite state atomically, enqueues a retryable Supabase Auth ban, and relies on current-status Storage policies to block still-valid JWTs immediately.
- The Auth worker claims one ban at a time and renews its owned, unexpired lease
  before calling Supabase. Completion/failure requires the same worker, attempt,
  and unexpired lease; stale responses cannot replace a newer claim. Expired
  eighth-attempt claims become terminal `FAILED` records for operator review.
  Repeating the ban remains safe when an external response is uncertain.
- Authorization must be server-side.
- Only the validated active server session may switch the homepage from the
  four-record guest teaser to all eligible privacy-safe previews. The query
  excludes that session UUID's own buyer profile, but authentication alone
  still grants no seller-directory or full-profile access.
- Signup full name stays database-controlled; public display includes first name, last initial, and stable account code only.
- Signup role selection may initialize only BUYER/SELLER roles from the validated server form after Supabase creates the Auth UUID and before the email-verification redirect; admin remains server-controlled.
- Signup asks for buyer, seller, or both exactly once. The verified callback reads the persisted database roles and never displays a second role-selection page.
- Signup is one form on the shared split auth page: an inline buyer/seller/both
  choice (one radio group, outcome microcopy for the selected role), then the
  private name, email, and password fields. Role-prefilled entry opens with the
  role selected; server-error recovery focuses the field or notice the status
  names.
- Log in asks for the email first and reveals the password field on the
  client. Revealing it never asks the server whether an account exists; both
  steps post the same native form, and an email-only post (no JavaScript)
  returns with the password step open.
- Signed-in users should continue only when they already have the role needed for the requested path; a role mismatch returns them to their existing default workspace.
- Auth routes must not use `/login`, `/signup`, `/signup/*`, `/auth/callback`, or the removed legacy `/onboarding/role` path as post-login destinations; resolve stale auth-flow `next` values to the user's role-aware default.
- Auth POST redirects and same-origin checks must use `request-origin.ts` to keep the incoming request host/protocol and avoid local `127.0.0.1`/`localhost` CSP and cookie mismatches. Mutations accept an exact matching `Origin`, or `Sec-Fetch-Site: same-origin` only when `Origin` is absent; missing both signals fails closed.
- Password login has one write path: `POST /api/auth/login`. Do not reintroduce a duplicate login server action with separate identity checks. The log-in form is a native POST to that route; it never calls Supabase from the browser.
- Server-side signup errors return to the signup form with the role and email restored instead of restarting the user. Do not put the private signup account name in URLs; same-browser draft recovery is acceptable for error recovery.
- Logout is a POST-only auth action. Desktop and mobile logout controls must submit successfully under the CSP `form-action` policy, clear Supabase cookies, and land on `/login?status=signed-out`.
- The owner-only `/profile` page is available to every active authenticated role and shows only that session user's private account identity plus workspace links. The header avatar menu links there and keeps logout POST-only.
- Buyer-only users opening seller routes such as `/seller/search` or `/seller/properties` return to their buyer workspace; they must never reach seller access gating or approved seller search without a persisted SELLER role.
- `/buyers/:buyerProfileId` is an authenticated cross-role profile route. Route entry may allow buyers, sellers, or admins, but final profile visibility must stay server-side in `getAuthorizedBuyerProfile`.
- Duplicate-email signup attempts must send the user to login, not back into the password wizard loop.
- Unauthenticated signup must not preflight the application `User` table by email before Supabase applies its Auth controls. Explicit collision recovery comes from the Auth/database identity boundary.
- `User.id` is the immutable Auth UUID. Email comparison may detect a collision
  but must never select, relink, update, or transfer an application identity.
- Auth callbacks must not create a fallback User. A missing UUID row or an email
  owned by another UUID fails closed, signs out, and enters explicit recovery.
- Login/session authorization requires an ACTIVE User with the same Auth UUID
  and normalized email; roles come only from that linked database row.
- Raw Auth deletion is restricted while the application User exists. Until the
  full session/Storage/retention lifecycle ships, deletion requests remain a
  suspended tombstone and same-email signup does not inherit or relink data.
- A verified callback calls the resolve-only `establishVerifiedAuthSession`
  and never reads `user_metadata.role`; the validated signup form has already
  initialized self-selectable BUYER/SELLER roles. Login uses
  `resolveAuthIdentity` and never initializes roles.
- `User.name` is authoritative private account data. Auth updates synchronize
  email only; later `user_metadata.name` edits never overwrite it.
- Login, signup, confirmation resend, and collision-recovery signals consume
  shared database-backed IP and normalized-email budgets. Every deployed Vercel
  runtime, including Preview, must provide its own 32+ character
  `AUTH_RATE_LIMIT_PEPPER`; production-mode runtimes fail closed when it is
  unavailable.
- Readiness rejects secret/service-role Supabase keys in the browser variable
  and publishable/anon keys in the server-only variable. Legacy JWT keys must
  carry the expected `anon` or `service_role` claim.
- Production Auth callbacks and email links share server-only `SITE_URL`; the
  browser URL variable is never a production fallback. Readiness requires a
  canonical HTTPS origin without credentials, path, query, or fragment.
- Supabase failures are classified from structured status/code values. For an
  opaque database-trigger failure, the server performs a normalized application
  email lookup after signup fails; it never parses vendor error-message text to
  decide whether identity recovery is required.
- User suspension atomically updates application eligibility and queues the
  external Auth ban; canonical server and Storage eligibility checks deny the
  suspended application identity. Immediate Supabase session/refresh revocation
  must be proven on the current queued-ban implementation, not inferred from
  the retired `suspend_identity` helper.
- The shared Auth limiter is codified by forward migration
  `20261016033000_codify_shared_rate_limiter`. Email-only Auth update
  synchronization still exists only in the unnumbered Auth/security SQL
  reserved for `00017`; a database built from migrations alone keeps the older
  all-column `on_auth_user_updated` trigger that copies `user_metadata.name`.

## Agent notes

Preview elevation and wildcard cohorts require local development/test or an
explicit Vercel Preview with the CEO target. Vercel production always refuses
them, even when stale preview flags remain. Existing database role grants must
still be reviewed and removed before launch.

Login bodies are streamed with a 16 KiB cap. Signup limits are name 160, email
254, password 1024 and next-path 2048 characters. Logout also enforces the shared
same-origin policy. IP quota keys trust forwarded addresses only on Vercel;
other hosts require a deliberate trusted-proxy adapter.

Do not add fixture-login, demo-login, local bypass, or client-trusted role logic.


## Limited name identity

Buyer, seller, and combined-role signup collect a full name (first and last required; up to 160 characters). Each word must start with a letter and may contain letters, at most four combining marks per letter, apostrophes, periods, and hyphens; a trailing Jr./Sr./II/III/IV is skipped when choosing the last initial. Initials use locale-independent uppercasing and whole grapheme clusters so server and client avatars match. Public identity is first name + last initial + a stable 12-character uppercase hexadecimal account code, for example Julie P. #7C4E2A91B6D0. The code is a truncated SHA-256 digest of the immutable random Auth UUID with a Liber namespace; it is not authentication proof or a database uniqueness constraint. Codes do not reveal the UUID and have no current-account collisions in the release read-only check. Both new and existing accounts use this limited identity in profiles, public previews, approved seller search, invites, and both sides of messaging. Legacy invalid/nameless accounts show Member plus code. Full surnames and contact information stay private except existing authorized LOI party disclosures. Raw account names and UUIDs remain server-side; only the limited label enters public DTOs. Signup shows an initials preview; the final code is assigned from the created account identity. DiceBear Initials (CC0) renders locally with @dicebear/core 10.7.0 and @dicebear/styles 10.6.0; no name is sent to an external avatar service. Existing avatarVariant tokens remain a backward-compatible color preference, with eight muted colors in the picker. Public labels/codes cannot be edited or shuffled by clients. No schema, role, authorization, RLS, document, or frozen LOI calculation changes.
