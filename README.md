# Liber

Liber is a private real-estate buyer directory. Buyers publish verified demand profiles. Sellers search qualified buyer demand and send manual property invites.

## Agent entrypoint

Start here:

1. `AGENTS.md` — repo-wide agent rules.
2. `docs/README.md` — docs source-of-truth map.
3. `docs/product/V1_DEFINITION.md` — strict product scope.
4. `docs/engineering/BACKEND_ARCHITECTURE.md` — backend architecture and security boundaries.
5. `docs/sections/*.md` — short context docs for each code area.

Old planning docs are not source of truth unless linked from `docs/README.md`.

## Core commands

```bash
npm install
npm run typecheck
npm test
npm run lint
npm run build
npm run db:validate
npm run readiness:env
npm run smoke:routes
npm run smoke:security
npm run smoke:no-auth-bypass
npm run smoke:visual
```

Run smoke commands one at a time because they may start a temporary Next.js dev server.

## Local development

```bash
npm run dev
# or
cd apps/web
npm run dev -- --port 3000
```

Local buyer/seller/admin testing requires real Supabase Auth test users. Do not add auth bypasses or fixture-based login.

## Production boundary

Escrow, money movement, lender integrations, subscriptions, automated offer/counteroffer execution, and public buyer profile exposure are not v1 production behavior unless `docs/product/V1_DEFINITION.md` is explicitly changed by the product owner.
