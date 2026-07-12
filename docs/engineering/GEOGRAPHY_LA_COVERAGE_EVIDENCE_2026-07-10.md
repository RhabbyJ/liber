# LA County Geography Proposal Evidence — July 10, 2026

> Historical proposal evidence. Superseded by the v2 release and `GEOGRAPHY_LA_COUNTY_RELEASE_RUNBOOK.md`; do not use this file as the current rollout state.

## Scope and status

This evidence covers the unnumbered, non-activating LA County proposal only. No shared database was touched, no migration number was assigned, and no LA service area was activated.

## Dataset identity

- Dataset: `la-county-06037-2026-07-09-v1`
- Boundary: Los Angeles County GEOID `06037`
- Areas: 661 total; 88 cities, 269 statistical communities, 304 ZCTAs
- Reviewed relationships: 149 official CSA `LCITY` `DISPLAY_PARENT` rows and
  149 official `SEARCH_ROLLUP` rows
- Inferred ZCTA relationships: 0
- Manifest SHA-256: `3d7831d55006bfe1ac6a4fdb6707a0813d1db0eb44176b925adabf5e9249b018`
- Relationships SHA-256: `eaedefdf32f2f3eb4363ecb610e65a1dd3ab77e242ac4ef88296aefbd4dab72b`

The repository checksum ledger and manifest contain the remaining compressed/content bundle hashes and source URLs. The importer recomputes all of them rather than trusting the manifest.

## Local evidence

Completed in the isolated geography worktree:

- read-only dataset validation: 661 inactive areas, 149 official display parents,
  and 149 official search rollups;
- final focused geography/API tests: 27/27;
- full repository tests: 3 database-target tests, 82 web tests with 1 guarded DB test skipped, and 13 validator tests;
- workspace typecheck: passed after installing worktree-local dependencies;
- Prisma schema formatting and validation: passed before the final market-scoped
  stable-source-identity constraint adjustment;
- production build: passed, 33 static pages and the versioned geometry route included;
- route smoke, security smoke, and forbidden-auth-bypass smoke: passed;
- JavaScript importer/builder syntax checks: passed;
- `git diff --check`: passed with Windows line-ending warnings only.

After that final constraint adjustment, the focused geography suite remained 27/27
and the workspace typecheck passed. The final Prisma format/validate/generate retry
was blocked by the local TLS inspection certificate while fetching the Prisma engine.
Generation and schema validation had succeeded earlier in the worktree, but CI must
run all three commands from a clean dependency install against the final schema.

Database proof remains intentionally open until the proposal is assigned a migration number and applied to a sentinel-marked disposable branch.

Open required evidence:

- exact fresh migration chain;
- representative upgrade chain;
- disposable proposal apply and idempotent double-stage;
- live-state pre/post counts;
- exact historical geometry pointer-swap test;
- same-name/collision database tests;
- realistic lookup query plans;
- Supabase security/performance advisors;
- production build and smoke suite after integration.
