# LA County Geography Proposal Runbook

## Status

This is an **unnumbered, non-activating proposal** based on the canonical geography cutover. It is not authorized for the shared Supabase project. The canonical fresh/upgrade migration gate must be closed before the CTO assigns a migration number.

The launch boundary is Los Angeles County, California, Census county GEOID `06037`. The versioned dataset is `la-county-06037-2026-07-09-v1`.

## Reviewed dataset

The repository artifact contains:

- 304 county-clipped 2020 Census ZCTAs;
- 88 incorporated cities derived from the official County CSA `LCITY` membership;
- 269 County statistical communities, represented as approximate Liber service areas;
- 149 official city-to-community `DISPLAY_PARENT` relationships and 149
  `SEARCH_ROLLUP` relationships from CSA `LCITY` membership;
- no inferred ZCTA display parent or ZCTA search rollup.

Every area stages inactive. `CHECKSUMS.sha256` covers the three compressed source bundles, `manifest.json`, and `relationships.json`. Validation checks the ledger bytes, compressed and decompressed bundle hashes and sizes, source feature IDs, per-area source-geometry hashes, source registry metadata, record counts, and official relationship evidence. No ZCTA display or search relationship is inferred.

The County CSA source is a statistical/reporting geography. It is not advertised as an exact neighborhood or USPS ZIP boundary. The manifest records both the source landing page and exact retrieval endpoint.

## Proposal behavior

The SQL proposal creates private immutable dataset, market-boundary, and service-area-geometry versions plus indexed reviewed search terms. Dataset staging:

- inserts the county boundary version without changing `markets.current_boundary_id`, center, or bbox;
- inserts new service-area rows inactive;
- leaves every existing active service-area row unchanged;
- inserts immutable geometry versions without changing `current_geometry_id`;
- records the exact manifest and relationship hashes in an immutable dataset ledger;
- does not change live search terms or `service_area_relationships`;
- rejects stable-ID/slug collisions inside the market. Stable source identity is
  market-scoped so a county-clipped ZCTA may also exist in a future adjacent market.

The runtime geometry endpoint serves an exact retained hash for versioned immutable URLs. Client URLs take that hash from the approved geometry pointer, never the legacy checksum column. Unversioned requests use only the current pointer.

## Local validation

Validation is read-only by default:

```bash
npm run db:import-service-areas -- data/geography/los-angeles-county/la-county-06037-2026-07-09-v1/manifest.json --validate-only
```

The write path is only for a sentinel-marked disposable database. It requires:

```text
SERVICE_AREA_IMPORT_DATABASE_URL=<disposable target only>
SERVICE_AREA_IMPORT_ALLOW_WRITES=true
SERVICE_AREA_IMPORT_SENTINEL=<16+ character token>
```

The target must contain `public.geography_migration_test_sentinel` with the matching token. The importer rejects targets matching `DIRECT_URL`, `DATABASE_URL`, or `SERVICE_AREA_IMPORT_SHARED_DATABASE_URLS`. There is no activation flag.

## CTO integration gates

Before assigning a migration number:

1. Prove the canonical migration chain on a completely fresh database and representative Liber upgrade data.
2. Rebase the Prisma and SQL proposal onto the final integration schema and resolve migration ordering.
3. Apply the exact proposal to a sentinel-marked disposable Supabase branch.
4. Stage the dataset twice and prove the second import is idempotent.
5. Verify pre/post counts, unchanged active rows, unchanged market bounds/current pointer, unchanged live relationships, and unchanged buyer matching.
6. Exercise exact historical geometry URLs before and after a test pointer swap.
7. Run the indexed lookup against duplicate aliases and same-named areas in two markets; capture `EXPLAIN (ANALYZE, BUFFERS)` at realistic volume.
8. Run Prisma validation, typecheck, tests, production build, route/security smokes, database E2E, and Supabase advisors.
9. Record every command and result in the dated evidence document.

## Separate activation change

Staging does not authorize LA beta. A later reviewed activation migration must atomically:

- confirm the staged dataset hashes and approved area allowlist;
- replace, rather than append, dataset-owned reviewed search terms and live relationships;
- set approved current geometry and market-boundary pointers;
- derive market center/bounds from the approved county boundary;
- verify every target bbox lies inside the market boundary;
- activate only the approved areas;
- preserve buyer publication invariants and draft affected profiles on deactivation;
- emit pre/post counts and a reversible pointer/activation snapshot.

## Rollback

Before activation, application rollback is safe because no live pointer, bound, relationship, search term, or active row changes during staging. Leave immutable staged evidence inert and remove the application code that reads new pointers.

If the schema itself must be removed before activation, use a separate reviewed rollback migration that first proves:

- no `current_boundary_id` or `current_geometry_id` references proposal versions;
- no staged area is active or referenced by buyers;
- no later dataset depends on the version tables.

Only then may that rollback disable the immutability triggers, remove the selected dataset ledger/geometry/boundary rows and unreferenced inactive areas, drop proposal functions/tables/columns, and restore the prior lookup implementation. Never reinstall static production fallback behavior, infer relationships, or rewrite migrations that reached a shared database.

After activation, rollback must restore the captured prior pointers, bounds, terms, relationships, activation flags, and buyer visibility in one transaction. Immutable evidence rows remain for audit.
