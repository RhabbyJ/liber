# Local Development

Liber local testing uses real Supabase Auth. There is no local auth bypass, fake cookie, or protected-route shortcut.

## Required Environment

Set the Supabase and database values in `.env` and ensure the web app can read them:

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`
- `NEXT_PUBLIC_SITE_URL` set to `http://localhost:3000`
- `SUPABASE_SERVICE_ROLE_KEY`
- `DATABASE_URL`
- `DIRECT_URL`

Optional local-only helper:

- `LIBER_AUTO_CONFIRM_SIGNUPS=true` can confirm new Supabase Auth signups during local development. Do not use it in production.

## Supabase Auth Redirects

In Supabase Dashboard -> Authentication -> URL Configuration, set:

- Site URL: `http://localhost:3000`
- Additional Redirect URL: `http://localhost:3000/auth/callback`

When email confirmation is enabled, `/signup` sends users to `/signup/verify`. The confirmation email must return to `/auth/callback` so the app can exchange the Supabase code for a real cookie session.

## Test Users

Create test users through `/signup` or the Supabase dashboard. Buyer and seller roles are assigned through `/onboarding/role`; admin must be granted through a controlled server/database operation.

Protected pages require a valid Supabase session:

- `/buyer/*` requires `BUYER`
- `/seller/*` requires `SELLER`
- `/admin/*` requires `ADMIN`

## Local Checks

Use:

```bash
npm run typecheck
npm test
npm run build
npm run smoke:routes
npm run smoke:no-auth-bypass
```

`npm run smoke:routes` verifies unauthenticated protected routes redirect to `/login`.
