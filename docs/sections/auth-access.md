# Section: Auth and Access

## Purpose

Owns sign-up, login, role selection, session loading, protected-route redirects, approved seller access, and admin-only gates.

## Main files

- `apps/web/server/session.ts`
- `apps/web/server/authz.ts`
- `apps/web/server/access.ts`
- `apps/web/server/auth-actions.ts`
- `apps/web/server/auth-identity.ts`
- `apps/web/server/auth-rate-limit.ts`
- `apps/web/server/shared-rate-limit.ts`
- `apps/web/lib/auth-identity.ts`
- `apps/web/server/request-origin.ts`
- `apps/web/proxy.ts`
- `apps/web/app/api/auth/login/route.ts`
- `apps/web/app/auth/callback/route.ts`
- `apps/web/app/login/page.tsx`
- `apps/web/app/profile/page.tsx`
- `apps/web/app/signup/page.tsx`

## Invariants

- Roles are not enough for full seller-directory access; `SellerAccess.status = APPROVED` is required for search, buyer-profile reads, and invites.
- Active sellers with `PENDING` or `REJECTED` access may see only the signed-in privacy-safe preview DTO on `/seller/search`. Missing-review state uses the same fail-limited projection; `SUSPENDED` access receives no seller-route preview. This never relaxes the approved search/profile/invite gates.
- Verified callbacks and successful password logins idempotently ensure a SELLER has an access row. A new row starts `PENDING`; an existing review status is preserved, and neither path can approve access.
- Admin cannot be self-assigned through customer UI.
- Suspended users must not continue into protected workflows.
- Suspension updates application user/profile/seller/property/invite state atomically, enqueues a retryable Supabase Auth ban, and relies on current-status Storage policies to block still-valid JWTs immediately.
- Authorization must be server-side.
- Only the validated active server session may switch the homepage from the
  four-record guest teaser to all eligible privacy-safe previews. The query
  excludes that session UUID's own buyer profile, but authentication alone
  still grants no seller-directory or full-profile access.
- Signup name is private account identity; do not treat it as seller/public buyer profile display.
- Signup role selection may initialize only BUYER/SELLER roles from the validated server form after Supabase creates the Auth UUID and before the email-verification redirect; admin remains server-controlled.
- Signup asks for buyer, seller, or both exactly once. The verified callback reads the persisted database roles and never displays a second role-selection page.
- Role-prefilled buyer/seller signup entry still opens on Step 1 with the role visibly selected. Explicit server-error recovery steps may reopen the relevant later pane.
- Signed-in users should continue only when they already have the role needed for the requested path; a role mismatch returns them to their existing default workspace.
- Auth routes must not use `/login`, `/signup`, `/signup/*`, `/auth/callback`, or the removed legacy `/onboarding/role` path as post-login destinations; resolve stale auth-flow `next` values to the user's role-aware default.
- Auth POST redirects and same-origin checks must use `request-origin.ts` to keep the incoming request host/protocol and avoid local `127.0.0.1`/`localhost` CSP and cookie mismatches.
- Password login has one write path: `POST /api/auth/login`. Do not reintroduce a duplicate login server action with separate identity checks.
- Server-side signup errors should return to the relevant wizard pane instead of restarting the user at the role/name step. Do not put the private signup account name in URLs; same-browser draft recovery is acceptable for error recovery.
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
- Supabase failures are classified from structured status/code values. For an
  opaque database-trigger failure, the server performs a normalized application
  email lookup after signup fails; it never parses vendor error-message text to
  decide whether identity recovery is required.
- User suspension atomically suspends the User, seller access, buyer visibility,
  unsent recipient-bound outbox jobs, and Auth sessions before the Admin API ban
  is confirmed and audited.
- These runtime paths depend on the unnumbered Auth/security SQL reserved for
  `00017`; they are not deployable to a database that stops at `00016`.

## Agent notes

Do not add fixture-login, demo-login, local bypass, or client-trusted role logic.
