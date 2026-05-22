# Liber

Liber is a reverse real-estate marketplace: buyers publish searchable demand profiles, and sellers search for serious buyers who match their property.

The repo is being built from `Implementation.md`. Start there before assigning work to agents.

## Current Build Target

The first vertical slice is:

```txt
Buyer creates searchable profile
-> Seller searches buyers
-> Seller views buyer
-> Seller adds property
-> Seller sends invite
-> Buyer receives notification/email
```

Escrow, real money movement, lender APIs, and subscriptions are intentionally deferred.

## Commands

```bash
npm install
npm run typecheck
npm test
npm run lint
npm run build
npm run db:validate
npm run readiness:env
npm run smoke:routes
npm run smoke:no-auth-bypass
npm run smoke:visual
```

Use `npm.cmd` on Windows if PowerShell blocks the npm wrapper.

For local app testing from the web app package:

```bash
cd apps/web
npm run dev -- --port 3000
```

`npm run smoke:routes` starts a temporary dev server on an available local port, checks public auth pages, and verifies unauthenticated buyer/seller/admin routes redirect to login.

`npm run smoke:no-auth-bypass` scans active source and docs for forbidden auth-bypass strings.

`npm run smoke:visual` starts a temporary dev server on an available local port and uses a local Firefox/Chrome/Edge executable to capture public desktop and mobile screenshots into `.artifacts/visual-smoke`.

Run the smoke commands one at a time; Next.js blocks multiple dev servers from the same app directory.

`npm run readiness:env` checks local backend configuration without printing secret values. `npm run readiness:production` also requires production-only settings such as Mapbox, Resend, and `CRON_SECRET`; production business decisions are tracked in `docs/product/production-decisions.md`.

Seller search renders a local fallback map without Mapbox. Set `NEXT_PUBLIC_MAPBOX_TOKEN` to enable Mapbox Static Images rendering.

If Supabase Auth or Storage calls fail locally with `UNABLE_TO_VERIFY_LEAF_SIGNATURE`, fix Node's local CA trust with `NODE_EXTRA_CA_CERTS`. Do not disable TLS verification in application code.

Transactional invite email uses Resend only when both `RESEND_API_KEY` and `RESEND_FROM_EMAIL` are configured. Leave them blank for mock/non-sending development.

Local buyer/seller/admin testing requires real Supabase Auth test users. Create accounts through `/signup` or the Supabase dashboard, then assign roles through onboarding or a controlled admin/database operation.

Marketplace expiry maintenance is exposed at `POST /api/maintenance/expire` and requires `Authorization: Bearer $CRON_SECRET`. It marks expired badges and stale sent/viewed invites as expired.
