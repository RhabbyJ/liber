# Section: Auth and Access

## Purpose

Owns sign-up, login, role selection, session loading, protected-route redirects, approved seller access, and admin-only gates.

## Main files

- `apps/web/server/session.ts`
- `apps/web/server/authz.ts`
- `apps/web/server/access.ts`
- `apps/web/server/auth-actions.ts`
- `apps/web/server/request-origin.ts`
- `apps/web/proxy.ts`
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
- Server-side signup errors should return to the relevant wizard pane instead of restarting the user at the role/name step. Do not put the private signup account name in URLs; same-browser draft recovery is acceptable for error recovery.
- Logout is a POST-only auth action. Desktop and mobile logout controls must submit successfully under the CSP `form-action` policy, clear Supabase cookies, and land on `/login?status=signed-out`.
- Buyer-only users opening seller routes such as `/seller/search` or `/seller/properties` must resolve to seller onboarding/access gating, not a buyer-profile redirect, loading hang, or approved seller search bypass.

## Agent notes

Do not add fixture-login, demo-login, local bypass, or client-trusted role logic.
