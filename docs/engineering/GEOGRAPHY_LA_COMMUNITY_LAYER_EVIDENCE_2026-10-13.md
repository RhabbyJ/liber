# LA County Community Layer Evidence — October 13, 2026

## Why

A buyer searched "Granada Hills" and got nothing. Granada Hills (`urn:lacounty:csa:130`) is one of the 269 reviewed County statistical communities staged by the v2 release, but production activation kept 266 of them inactive by design (only Encino, Northridge, and Tarzana were live). Search filters to active areas, so those communities were invisible. The old search also matched only from the start of a reviewed term, had no typo tolerance, and sorted alphabetically.

## Release identity

- Layer: `la-county-06037-2026-10-13-communities-v1` on dataset `la-county-06037-2026-07-12-v2`
- Migration: `20261013120000_activate_la_county_communities`
- Migration SHA-256: `b8a5a632183733534f290923de3c5b2730cbe03283148da6ebf338879bca9cbd`
- Manifest / relationships / display hashes: unchanged v2 pins (`2e78ac34…`, `5136dfa8…`, `55813f46…`)
- Reviewed aliases: 13 (`downtown la`, `dtla`, `k town`, `ktown`, `mount washington`, `noho`, `silver lake`, `venice beach`, `west la`, `east la`, `l a`, `la`, `weho`)

## Local disposable rehearsal (not production proof)

Run on a disposable local PostgreSQL 16.15 / PostGIS 3.4.2 / GEOS 3.12.1 copy of the local database with the v2 dataset staged and activated. Local GEOS produces display hash `5c92458d…` instead of the reviewed `55813f46…`, so the harness patched that one literal inside the disposable database's functions only. The repository migration keeps the reviewed hash. **The exact-hash rehearsal (`npm run db:rehearse-la-communities`) must still run on a production-equivalent Supabase target before production activation.**

Observed with the checked-in rehearsal logic (outer transaction, rolled back):

- Wrong layer version and wrong checksum rejected; a pre-owned layer row rejected before activation.
- Activation: 88 cities, 304 ZCTAs, 269 communities, 266 newly activated, 13 aliases; second activation idempotent.
- Search after activation: `granada hills` resolves exactly to `granada-hills`; `granda hils` suggests it first; `hills` includes it; `noho` resolves to `north-hollywood`; `downtown` returns two exact matches (ambiguous); `arcadia` resolves to the city only; `91344` resolves to the ZCTA.
- Los Angeles city rollup covers all 139 Los Angeles communities, including Granada Hills.
- County rollback blocked while the layer is live.
- Alias provenance drift, an additive layer-owned alias, and a deactivated community each block layer rollback.
- An `ACTIVE` buyer moved to Granada Hills blocks layer rollback before mutation.
- Rollback restores three active communities and zero layer aliases; Granada Hills disappears from search again; re-activation is rejected.
- The outer rollback restored the exact baseline counts.

## Search quality and performance (local, after activation)

Before (County release only): `granada hills`, `granada`, `hills`, `noho`, `dtla`, `downtown`, `hollywood`, `silver lake` returned no suggestions.

After: each returns the expected areas; typos such as `pasedena`, `torrence`, `malibo`, `bevrly hills`, `santa monca`, `westwod`, `long bech`, and `lake view terrace` return the intended place first; nonsense such as `qwerty` returns nothing.

Over 200 calls each: prefix ≈ 3.3 ms, later-word ≈ 3.8 ms, typo ≈ 7 ms, ZIP ≈ 3.3 ms per call. `EXPLAIN (ANALYZE)` of the deployed function body still uses `service_area_search_terms_market_term_prefix_idx` with both lexical bounds under the default planner.

## Fresh database path

All nine current-baseline migrations, including this one, applied cleanly to a new empty local database with `prisma migrate deploy --config prisma.baseline.config.ts`. `prisma migrate reset` (used by `npm run db:test-geography:fresh`) was not run: Prisma blocks it for AI agents without explicit user consent. On that database the updated plan-proof E2E passes. Two other geography E2E assertions and the architecture E2E cleanup fail identically on a database built without this migration (PostgreSQL 16 lacks the PostgreSQL 17 `MAINTAIN` privilege, a trigger-order message assertion, and a messaging foreign key during cleanup), so they are pre-existing environment gaps, not regressions.

## Remaining gates

- Exact-hash Supabase rehearsal, then the production sequence in `GEOGRAPHY_LA_COUNTY_RELEASE_RUNBOOK.md`.
- Re-run Supabase security and performance advisors after the migration (new `pg_trgm` extension in `extensions`).
- ZIP-to-community relationships remain unreviewed: a seller searching `91344` does not match a buyer who chose Granada Hills.
