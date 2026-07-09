# Canonical Geography Cutover Runbook

This runbook governs migrations `20260709000013`, `20260709000014`, and
`20260709000015`. It is a release gate for the canonical service-area cutover;
it does not authorize LA County expansion.

## Verified migration history

On 2026-07-09, the configured shared Liber Supabase project was inspected
read-only.

- Prisma recorded successful migrations through `20260708000011`.
- `20260708000012` was not in `_prisma_migrations`, but its enum values, column,
  and index were present through a separately recorded Supabase migration. The
  checked-in `00012` SQL is idempotent and must still be allowed to run so Prisma
  records it.
- `00013`, `00014`, and `00015` were absent from both Prisma migration history
  and the catalog. They may be corrected in place before first deployment.
- This proves status only for the configured shared project. Before deploying
  to any other database, run the history query below. If `00014` or `00015` is
  already recorded there, do not edit or replay it; add a new corrective
  migration.

The same read-only snapshot contained 7 buyer profiles, all `ACTIVE`. Their
legacy city values were Sherman Oaks (5), Studio City (1), and Tarzana (1),
with no legacy ZIP or neighborhood value. Under the finalized state-scoped,
type-specific rules, all 7 are expected to become
`UNRESOLVED_LEGACY_LOCATION` and `DRAFT`; none may receive an inferred
selection. Re-run this inventory at deployment time and treat any difference
as a new review, not as approval to reuse these expected counts.

```sql
SELECT migration_name, started_at, finished_at, rolled_back_at
FROM public._prisma_migrations
WHERE migration_name IN (
  '20260709000013_add_markets_and_buyer_service_area_slugs',
  '20260709000014_add_search_rollup_relation_type',
  '20260709000015_canonical_service_area_cutover'
)
ORDER BY started_at;
```

## Safety model

`00013` stages the market-scoped model, `00014` adds the enum value in its own
migration, and `00015` performs the UUID cutover inside one transaction.
Before taking any legacy snapshot, `00015` blocks profile and selection writes
in the application lock order; it rechecks the active-buyer invariant before
commit. Market jurisdiction is immutable, and reviewed rollup graph mutations
serialize per market before cycle validation.
`00015` never creates a confirmed buyer selection from legacy text. It keeps an
existing single `SELECTED` row, deletes inferred rows, records every inferred,
ambiguous, conflicting, or unresolved legacy profile in
`service_area_migration_quarantine`, and drafts active profiles without a
confirmed active selection.

Legacy candidates require all of the following:

- the best available match tier in ZIP, neighborhood, city order;
- an exact normalized state match between the buyer snapshot and service area;
- a service area in an active US market;
- one candidate at that tier to be classified `MIGRATED_REVIEW_REQUIRED`.

No candidate is promoted automatically. The affected buyer must review the
location and explicitly save a canonical selection; that save resolves the quarantine
row while recording the selected service-area UUID, actor UUID, and
`BUYER_CONFIRMED` source in the resolution audit object.

## Preconditions

1. Use a disposable Supabase branch for both test paths. Never reset a shared
   environment.
2. Confirm point-in-time recovery or take a verified backup before the shared
   deployment.
3. Stop buyer profile writes and service-area imports for the deployment
   window.
4. Save the preflight query results as a release artifact.
5. Confirm Preview and Production do not point at the same database before
   treating Preview as a staging proof. As of the 2026-07-09 audit, they did.

## Preflight inventory

Run against the target immediately before deployment.

```sql
SELECT "visibilityStatus", count(*)
FROM public."BuyerProfile"
GROUP BY "visibilityStatus"
ORDER BY "visibilityStatus";

SELECT
  count(*) AS profiles,
  count(*) FILTER (WHERE "desiredState" IS NULL) AS missing_state,
  count(*) FILTER (WHERE "desiredPostalCode" IS NOT NULL) AS with_zip,
  count(*) FILTER (WHERE "desiredNeighborhood" IS NOT NULL) AS with_neighborhood,
  count(*) FILTER (WHERE "desiredCity" IS NOT NULL) AS with_city
FROM public."BuyerProfile";

SELECT coalesce(nullif(upper(trim("desiredState")), ''), '<MISSING>') AS legacy_state,
       count(*)
FROM public."BuyerProfile"
GROUP BY 1
ORDER BY 1;

SELECT count(*) AS invalid_state_contract
FROM public."BuyerProfile"
WHERE "desiredState" IS NOT NULL
  AND trim("desiredState") !~ '^[A-Za-z]{2}$';

SELECT id, "visibilityStatus", "desiredLocationText", "desiredPostalCode",
       "desiredNeighborhood", "desiredCity", "desiredState"
FROM public."BuyerProfile"
ORDER BY id;
```

If `buyer_desired_service_areas` already exists, also capture every row and
stop if its shape or sources differ from the expected pre-cutover model. In an
upgrade rehearsal, capture these totals after `00013` and before `00015`:

```sql
SELECT source, count(*)
FROM public.buyer_desired_service_areas
GROUP BY source
ORDER BY source;

SELECT count(*) AS selection_rows,
       count(DISTINCT buyer_profile_id) AS buyers_with_rows
FROM public.buyer_desired_service_areas;
```

The legacy backfill contract is US plus a two-letter state code. Missing or
nonconforming values may not receive a candidate.

## Required database tests

### Current proof status (2026-07-09)

The representative upgrade has been executed on disposable Supabase branch
`ebe650a3-a671-4c43-bcc9-05f56d4a03ef` (project ref
`ovloylwspjmqbvazwzmh`). Migrations `00013`, `00014`, and `00015` were applied
from the checked-in SQL over a schema prepared through `00012`, with 11
representative buyer profiles seeded before `00015`.

- Before `00015`: 11 profiles, 9 `ACTIVE`, 5 buyer-area rows, 3 `SELECTED`,
  and 2 inferred rows.
- After `00015`: 11 profiles, 1 `ACTIVE`, 1 buyer-area row, 1 `SELECTED`, no
  inferred rows, and 10 open quarantine rows.
- The one valid existing selection remained. Every other fixture was drafted.
  The ten quarantine rows were reviewed individually: two ambiguous/conflicting
  cases, three review-required single candidates, and five unresolved cases.
- `Glendale, AZ` and state-less `Glendale` produced no California candidate.
  The active-buyer invariant and cross-state candidate queries returned zero
  rows.
- Public role checks exposed only active markets, active areas in active
  markets, and reviewed relationships. Canonical ID changes, market moves,
  cross-market relationships, rollup cycles, active-selection removal,
  quarantine mutation, and invalid cross-state areas were rejected.
- Two-connection races passed for both market and service-area deactivation:
  deactivation after activation drafts the buyer; activation after
  deactivation fails with `23514`; and deactivation concurrent with an
  in-flight buyer write fails fast with retryable `55P03` instead of deadlocking
  or leaving stale `ACTIVE` state.
- `00015` waited for an already in-flight buyer write before taking its legacy
  snapshots. Concurrent reciprocal reviewed rollups serialized on their market;
  the first committed and the second failed with `23514`.
- An empty through-`00014` schema accepted exact `00015` with zero profiles,
  selections, or quarantine rows. The validator suite passed all 13 tests.

This is not yet a complete fresh-database proof. Replaying the exact historical
chain on a newly provisioned Supabase database stops in `00005` because that
migration alters `public.spatial_ref_sys`, which is owned by `supabase_admin`
on current Supabase projects while the migration session is `postgres`. The
error is `must be owner of table spatial_ref_sys`. For the representative
upgrade only, the disposable branch was prepared with those two obsolete
`spatial_ref_sys` access-control statements omitted; all other pre-cutover
statements and all geography migration SQL were applied unchanged.

Do not rewrite already-deployed `00005`. The release gate remains closed until
either a supported execution role can run the exact historical chain, or a
reviewed consolidated Prisma baseline becomes the approved fresh-install path
and is proven schema-equivalent. A consolidated baseline does not make the
historical `00005` replay pass; preserve that distinction in release evidence.
Record the decision as a separate migration/CI correction, then rerun the
approved fresh path below. The disposable branch was deleted at
`2026-07-09T23:47:58Z`; the historical fresh-install gate is the remaining
database-proof blocker.

Before either destructive harness, create a sentinel only on the disposable
database and use a unique 16-or-more-character token:

```sql
CREATE TABLE public.geography_migration_test_sentinel (
  token text PRIMARY KEY,
  created_at timestamptz NOT NULL DEFAULT now()
);
REVOKE ALL ON public.geography_migration_test_sentinel
FROM PUBLIC, anon, authenticated, service_role;
INSERT INTO public.geography_migration_test_sentinel(token)
VALUES ('<unique disposable token>');
```

Never create this sentinel on a shared database. Both harnesses verify its
value over the supplied connection before writing, so aliases for the same
database (direct, session-pooler, or transaction-pooler URLs) cannot bypass the
guard. A fresh reset drops the table; recreate it before rerunning that path.

On one disposable branch, run the representative upgrade first. Preserve its
evidence, then use the guarded fresh command to reset that branch and prove the
entire chain. The order matters because the fresh reset destroys upgrade
fixtures.

### Fresh database

On a disposable branch with no Liber application schema, run every checked-in
migration from `00000` through `00015`, then run:

```powershell
$env:GEOGRAPHY_MIGRATION_TEST_DATABASE_URL = "<disposable direct database URL>"
$env:GEOGRAPHY_MIGRATION_TEST_ALLOW_RESET = "true"
$env:GEOGRAPHY_MIGRATION_TEST_SENTINEL = "<unique disposable token>"
npm run db:test-geography:fresh
npm run db:validate
npm run typecheck
npm test
```

Pass conditions:

- every migration is recorded exactly once and none is failed or rolled back;
- the Prisma schema validates and generated client matches it;
- public geography reads expose only active markets, active areas in active
  markets, and reviewed relationships;
- canonical IDs and market membership cannot be updated;
- cross-market relationships and reviewed rollup cycles are rejected;
- concurrent reciprocal reviewed rollups serialize and one write is rejected;
- an active buyer cannot commit without exactly one active primary `SELECTED`
  area;
- deactivating a market or area drafts affected active buyers and does not
  republish them on reactivation;
- concurrent activation/deactivation follows the lock contract above; callers
  retry `55P03` deactivation conflicts but do not retry `23514` activation
  failures without selecting active geography;
- quarantine evidence is immutable and resolution is one-way.

### Representative upgrade

Start from the schema through `00012`, apply `00013` and `00014`, then seed and
record these cases before applying `00015`:

```powershell
$env:GEOGRAPHY_MIGRATION_TEST_ALLOW_WRITES = "true"
$env:GEOGRAPHY_MIGRATION_TEST_DATABASE_URL = "<disposable direct database URL>"
$env:GEOGRAPHY_MIGRATION_TEST_SENTINEL = "<unique disposable token>"
# Only for a disposable branch intentionally prepared through migration 00004:
$env:GEOGRAPHY_MIGRATION_TEST_PREPARE_FROM_00004 = "true"
npm run db:test-geography:upgrade
```

1. one valid existing `SELECTED` area;
2. multiple existing `SELECTED` areas;
3. exact ZIP plus a lower-priority conflicting city;
4. one exact CA city candidate;
5. same city label in two markets at the best tier;
6. `Glendale, AZ` while only `Glendale, CA` is supported;
7. `Glendale` with no state;
8. an unsupported legacy location;
9. stale `DERIVED` and `MIGRATED` rows;
10. active and draft profiles across the cases above.

The test passes only when:

- the existing single selection remains selected;
- multiple selections are removed, quarantined, and the profile is drafted;
- ZIP wins over lower-priority neighborhood/city candidates;
- one inferred candidate is quarantined as `MIGRATED_REVIEW_REQUIRED` and is
  not selected;
- multiple best-tier candidates are quarantined as
  `AMBIGUOUS_LEGACY_LOCATION`;
- AZ and missing-state Glendale records have no CA candidate ID and are
  `UNRESOLVED_LEGACY_LOCATION`;
- stale inferred rows are gone;
- every active profile has exactly one valid selection;
- total profile count is unchanged;
- every quarantine row is reviewed individually against its legacy snapshot.

## Post-deploy checks

```sql
SELECT "visibilityStatus", count(*)
FROM public."BuyerProfile"
GROUP BY "visibilityStatus"
ORDER BY "visibilityStatus";

SELECT reason, count(*)
FROM public.service_area_migration_quarantine
WHERE resolved_at IS NULL
GROUP BY reason
ORDER BY reason;

SELECT source, count(*)
FROM public.buyer_desired_service_areas
GROUP BY source
ORDER BY source;

SELECT count(*) AS selection_rows,
       count(DISTINCT buyer_profile_id) AS buyers_with_rows
FROM public.buyer_desired_service_areas;

SELECT q.buyer_profile_id, q.reason, q.candidate_service_area_ids,
       q.legacy_location, q.resolution, q.resolved_at
FROM public.service_area_migration_quarantine q
ORDER BY q.created_at, q.buyer_profile_id;

SELECT bp.id
FROM public."BuyerProfile" bp
WHERE bp."visibilityStatus" = 'ACTIVE'
  AND 1 <> (
    SELECT count(*)
    FROM public.buyer_desired_service_areas bsa
    JOIN public.service_areas sa ON sa.id = bsa.service_area_id
    JOIN public.markets m ON m.id = sa.market_id
    WHERE bsa.buyer_profile_id = bp.id
      AND bsa.source = 'SELECTED'
      AND bsa.is_primary = true
      AND sa.active = true
      AND m.active = true
  );

SELECT q.buyer_profile_id, q.candidate_service_area_ids, q.legacy_location
FROM public.service_area_migration_quarantine q
WHERE upper(coalesce(q.legacy_location->>'desiredState', '')) = 'AZ'
  AND EXISTS (
    SELECT 1
    FROM jsonb_array_elements_text(q.candidate_service_area_ids) candidate(id)
    JOIN public.service_areas sa ON sa.id = candidate.id::uuid
    WHERE upper(sa.state) <> 'AZ'
  );
```

The final invariant and cross-state queries must return zero rows. Total buyer
profile count must be unchanged. Post-cutover selection count must equal the
number of buyers that had exactly one pre-cutover `SELECTED` row; all
`DERIVED`/`MIGRATED` rows and all rows for multiple-selection buyers must be
gone. Reconcile those deltas, active-to-draft counts, and every quarantine row
before lifting the write freeze.

## Rollback

- If `00015` fails before `COMMIT`, PostgreSQL rolls back the entire cutover.
  The additive `00013` staging schema and `00014` enum value remain committed
  and are compatible with the old application. Keep the write freeze, verify
  that none of `00015` committed, and retain the failed Prisma ledger row and
  logs as evidence.
- On a shared database, do not delete a failed ledger row. After correcting an
  unapplied `00015`, have two reviewers verify the rollback, then run
  `npx prisma migrate resolve --rolled-back 20260709000015_canonical_service_area_cutover`
  before redeploying. If any `00015` effect committed, stop and ship a new
  forward corrective migration instead of resolving/replaying it.
- After `00015` commits, do not attempt a hand-written down migration. It drops
  legacy slug columns and converts keys. Restore the verified pre-cutover
  backup/PITR snapshot as a coordinated environment rollback, or keep the
  database offline and ship a reviewed forward correction.
- Never restore only application tables around Supabase Auth or Storage. The
  database, Auth-linked application state, and deployment must move together.

## Evidence log

Record the disposable branch ID, migration history, pre/post aggregate output,
every quarantine row, command results, reviewer, and deletion time in the
release artifact. The cutover is not proven until both database paths pass and
the disposable resources are deleted.
