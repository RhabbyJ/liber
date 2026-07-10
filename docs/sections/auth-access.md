# Section: Auth and Access

## Purpose

Owns sign-up, login, role selection, session loading, protected-route redirects, approved seller access, and admin-only gates.

## Main files

- `apps/web/server/session.ts`
- `apps/web/server/authz.ts`
- `apps/web/server/access.ts`
- `apps/web/server/auth-actions.ts`
- `apps/web/server/auth-identity.ts`
- `apps/web/lib/auth-identity.ts`
- `apps/web/server/request-origin.ts`
- `apps/web/proxy.ts`
- `apps/web/app/api/auth/login/route.ts`
- `apps/web/app/auth/callback/route.ts`
- `apps/web/app/login/page.tsx`
- `apps/web/app/signup/page.tsx`
- `apps/web/app/onboarding/role/page.tsx`

## Invariants

- Roles are not enough for seller-directory access; `SellerAccess.status = APPROVED` is required.
- Admin cannot be self-assigned through customer UI.
- Suspended users must not continue into protected workflows.
- Authorization must be server-side.
- Signup name is private account identity; do not treat it as seller/public buyer profile display.
- Signup role selection may bootstrap only BUYER/SELLER roles after Supabase verifies the user; admin remains server-controlled.
- Signed-in users should redirect only when they already have the role needed for the requested path; buyer-only users following seller-intent login/signup links should go through role onboarding to add seller access.
- Auth routes must not use `/login`, `/signup`, `/signup/*`, `/auth/callback`, or `/onboarding/role` as post-login destinations; resolve stale auth-flow `next` values to the user's role-aware default or onboarding path.
- Auth POST redirects and same-origin checks must use `request-origin.ts` to keep the incoming request host/protocol and avoid local `127.0.0.1`/`localhost` CSP and cookie mismatches.
- Password login has one write path: `POST /api/auth/login`. Do not reintroduce a duplicate login server action with separate identity checks.
- Server-side signup errors should return to the relevant wizard pane instead of restarting the user at the role/name step. Do not put the private signup account name in URLs; same-browser draft recovery is acceptable for error recovery.
- Logout is a POST-only auth action. Desktop and mobile logout controls must submit successfully under the CSP `form-action` policy, clear Supabase cookies, and land on `/login?status=signed-out`.
- Buyer-only users opening seller routes such as `/seller/search` or `/seller/properties` must resolve to seller onboarding/access gating, not a buyer-profile redirect, loading hang, or approved seller search bypass.
- `/buyers/:buyerProfileId` is an authenticated cross-role profile route. Route entry may allow buyers, sellers, or admins, but final profile visibility must stay server-side in `getPublicBuyerProfile`.
- Existing buyers or sellers following opposite-role signup intent should add the missing role to the current account through role onboarding. Duplicate-email signup attempts must send the user to login, not back into the password wizard loop.
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

## Agent notes

Do not add fixture-login, demo-login, local bypass, or client-trusted role logic.
