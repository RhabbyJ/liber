# Section: Testing and Smoke Checks

## Purpose

Owns unit tests, route smoke tests, visual smoke tests, security smoke tests, and readiness checks.

## Main files

- `apps/web/**/*.test.ts`
- `apps/web/server/service-area-db.e2e.test.ts`
- `scripts/test-geography-migration-fresh.mjs`
- `scripts/test-geography-migration-upgrade.mjs`
- `scripts/route-smoke.mjs`
- `scripts/security-smoke.mjs`
- `scripts/forbidden-auth-bypass-smoke.mjs`
- `scripts/visual-smoke.mjs`
- `scripts/readiness-check.mjs`
- `package.json`

## Invariants

- No auth-bypass strings should be reintroduced.
- Protected routes should redirect/reject unauthenticated users.
- Visual smoke is for public/non-auth pages unless test auth is explicitly available.
- Do not weaken tests to make a bad change pass.
- Demo/test buyer data may be used for smoke and CEO demo verification only when clearly seeded and removable.
- Tests and smoke scripts must not depend on fake data being present in true production.
- Before the canonical geography cutover, run both guarded migration commands against a sentinel-marked disposable database: `npm run db:test-geography:upgrade`, then reset the disposable target with `npm run db:test-geography:fresh`. The scripts verify both the sentinel and configured shared URLs. Preserve their counts/quarantine output and delete the disposable branch afterward.
- Before activating a broader market, run the guarded database E2E with `SERVICE_AREA_E2E_DATABASE_URL`, `SERVICE_AREA_E2E_ALLOW_WRITES=true`, and the matching `GEOGRAPHY_MIGRATION_TEST_SENTINEL`; it covers stale city/ZIP conflicts, DB-only areas, inactive markets, relationship changes, bounds, RLS, seller filtering, and public/seller pins.
- Before deploying identity migration `00016`, run `npm run db:test-identity`
  against a sentinel-marked disposable database. It verifies UUID immutability,
  the validated Auth FK, all 11 ownership FK update restrictions, email
  collision recovery, Auth deletion restriction, buyer/seller/ADMIN ownership,
  and clean same-email re-registration after an explicit purge.
- The identity harness must use branch-specific direct credentials. Connector
  proof does not substitute for its two-connection Auth-write/migration lock
  assertion.
- After auth, nav, or protected-route changes, run a focused browser auth pass covering signed-out CTAs, buyer signup/login/logout, buyer-to-seller intent, seller signup/access gating, both-role signup when supported, and mobile nav/logout.
- Browser auth QA failures or inconclusive results should include a screenshot or compact state dump with URL, relevant DOM attributes, visible text excerpt, and console errors.

## Agent notes

Report exactly what ran and what did not. Do not claim a smoke check passed if the local browser/server was unavailable.
