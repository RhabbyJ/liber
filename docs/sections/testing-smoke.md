# Section: Testing and Smoke Checks

## Purpose

Owns unit tests, route smoke tests, visual smoke tests, security smoke tests, and readiness checks.

## Main files

- `apps/web/**/*.test.ts`
- `apps/web/server/service-area-db.e2e.test.ts`
- `scripts/test-geography-migration-fresh.mjs`
- `scripts/test-geography-migration-upgrade.mjs`
- `scripts/test-identity-migration.mjs`
- `scripts/database-target.mjs`
- `scripts/route-smoke.mjs`
- `scripts/security-smoke.mjs`
- `scripts/forbidden-auth-bypass-smoke.mjs`
- `scripts/visual-smoke.mjs`
- `scripts/readiness-check.mjs`
- `scripts/migration-readiness.mjs`
- `package.json`

## Invariants

- No auth-bypass strings should be reintroduced.
- Protected routes should redirect/reject unauthenticated users.
- Visual smoke is for public/non-auth pages unless test auth is explicitly available.
- Do not weaken tests to make a bad change pass.
- Demo/test buyer data may be used for smoke and CEO demo verification only when clearly seeded and removable.
- Tests and smoke scripts must not depend on fake data being present in true production.
- Before the canonical geography cutover, run both guarded migration commands against a sentinel-marked disposable database: `npm run db:test-geography:upgrade`, then reset the disposable target with `npm run db:test-geography:fresh`. The scripts verify both the sentinel and configured shared URLs. Preserve their counts/quarantine output and delete the disposable branch afterward.
- Destructive database harnesses must reject both exact shared URLs and direct/pooler URLs that identify the same Supabase project.
- Before activating a broader market, run the guarded database E2E with `SERVICE_AREA_E2E_DATABASE_URL`, `SERVICE_AREA_E2E_ALLOW_WRITES=true`, and the matching `GEOGRAPHY_MIGRATION_TEST_SENTINEL`; it covers stale city/ZIP conflicts, DB-only areas, inactive markets, relationship changes, bounds, RLS, seller filtering, and public/seller pins.
- Before deploying identity migration `00016`, run `npm run db:test-identity`
  against a sentinel-marked disposable database. It verifies UUID immutability,
  the validated Auth FK, all 11 ownership FK update restrictions, email
  collision recovery, Auth deletion restriction, buyer/seller/ADMIN ownership,
  and clean same-email re-registration after an explicit purge.
- The identity harness must use branch-specific direct credentials. Connector
  proof does not substitute for its two-connection Auth-write/migration lock
  assertion.
- LA dataset validation is read-only by default. Disposable staging still requires `SERVICE_AREA_IMPORT_DATABASE_URL`, explicit write opt-in, and a sentinel distinct from every shared target. The production v2 release additionally requires an exact dataset confirmation and exact Supabase project ref. Rehearse schema, stage, double-stage, activation, double-activation, and rollback inside an outer rolled-back transaction before any persistent write.
- LA County map acceptance covers complete County pan/zoom and clamp, View all reset, absence of ambient borders, searched-area boundary rendering/clearing, preview-card-to-pin hover/focus highlighting, rapid selected-area switching, mobile cooperative scrolling, and absence of internal service-area UUIDs in public responses.
- Before geometry activation, test an exact versioned URL before and after swapping the current pointer, plus duplicate aliases and same-named areas in separate markets against the real indexed SQL.
- After auth, nav, or protected-route changes, run a focused browser auth pass covering signed-out CTAs, buyer signup/login/logout, buyer-to-seller intent, seller signup/access gating, both-role signup when supported, and mobile nav/logout.
- Homepage preview acceptance must cover a four-card guest maximum, a scoped
  sign-in return to the homepage, all eligible signed-in previews except the
  viewer's own profile, identical forbidden-field/privacy assertions for both
  audiences, and distinct map pins when more than four previews share an area.
- Browser auth QA failures or inconclusive results should include a screenshot or compact state dump with URL, relevant DOM attributes, visible text excerpt, and console errors.
- Public and seller DTO tests must snapshot serialized responses and recursively reject forbidden identity, coordinate, criteria-ID, service-area-ID, badge, document, and Storage fields.
- Release CI must execute real ESLint, exact fresh and representative upgrade migrations, typecheck, tests, production build, RLS/Storage security tests, readiness validation, and realistic seller-search query plans.
- Production readiness must reject a missing or shorter-than-32-character `AUTH_RATE_LIMIT_PEPPER`; production Auth rate limiting fails closed without it.
- Production readiness enumerates every local Prisma migration directory and requires a successful, non-rolled-back database record for each one. Missing, failed, and rolled-back local migrations fail the gate; database-only migration names are reported separately.
- Add concurrency tests for buyer save cardinality, distributed rate limits, outbox claim leases, and invite/property state transitions.
- CI runs deterministic Prisma generation/validation, real ESLint, typecheck, unit tests, production build, and security smoke checks. Manual disposable-database jobs run exact fresh/upgrade, identity, RLS/geography, and seller-search plan gates using guarded branch credentials.
- The non-database CI job uses syntactically valid local dummy database URLs only for Prisma configuration parsing. The manually initiated `release-database-gate` remains required before deployment and is the only job that receives protected disposable/shared database credentials.

## Agent notes

Report exactly what ran and what did not. Do not claim a smoke check passed if the local browser/server was unavailable.
