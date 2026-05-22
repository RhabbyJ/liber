# Deployment

Liber production must use Supabase Auth only. Do not deploy auth bypass routes, fake sessions, or cookie-based shortcuts.

## Required Secrets

Configure these as platform secrets, not client-side values:

- `DATABASE_URL`
- `DIRECT_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `CRON_SECRET`
- `RESEND_API_KEY`
- `RESEND_FROM_EMAIL`

Client-safe values:

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`
- `NEXT_PUBLIC_SITE_URL`
- `NEXT_PUBLIC_MAPBOX_TOKEN`

## Auth And Roles

Users sign up and log in through Supabase Auth. Buyer and seller roles are selected through onboarding and mirrored into server-controlled user records. Admin roles must be assigned only through a controlled operational process.

`LIBER_AUTO_CONFIRM_SIGNUPS` must be unset or false in production.

Set Supabase Dashboard -> Authentication -> URL Configuration so production emails return to the app:

- Site URL: `https://your-production-domain`
- Additional Redirect URL: `https://your-production-domain/auth/callback`

The signup flow depends on this callback route to exchange email-confirmation codes for a real Supabase session before redirecting users into buyer, seller, or onboarding pages.

## Pre-Launch Checks

Run:

```bash
npm run readiness:production
npm run typecheck
npm test
npm run build
npm run smoke:no-auth-bypass
```

Production remains blocked until CEO/product decisions in `docs/product/production-decisions.md` are resolved.
