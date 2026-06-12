# Section: Auth and Access

## Purpose

Owns sign-up, login, role selection, session loading, protected-route redirects, approved seller access, and admin-only gates.

## Main files

- `apps/web/server/session.ts`
- `apps/web/server/authz.ts`
- `apps/web/server/access.ts`
- `apps/web/server/auth-actions.ts`
- `apps/web/proxy.ts`
- `apps/web/app/login/page.tsx`
- `apps/web/app/signup/page.tsx`
- `apps/web/app/onboarding/role/page.tsx`

## Invariants

- Roles are not enough for seller-directory access; `SellerAccess.status = APPROVED` is required.
- Admin cannot be self-assigned through customer UI.
- Suspended users must not continue into protected workflows.
- Authorization must be server-side.
- Signup role selection may bootstrap only BUYER/SELLER roles after Supabase verifies the user; admin remains server-controlled.

## Agent notes

Do not add fixture-login, demo-login, local bypass, or client-trusted role logic.
