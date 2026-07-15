# Current Database Baseline Runbook

## Decision

Existing Liber databases continue to use the immutable migration history in
`packages/db/prisma/migrations` through the normal `prisma.config.ts`. A
brand-new Supabase database uses the separately locked current baseline in
`packages/db/prisma/current-baseline/migrations` through
`prisma.baseline.config.ts`.

This split is required because current Supabase projects own the PostGIS
`public.spatial_ref_sys` table as `supabase_admin`. Historical migration
`20260521000005_audit_hardening` asks the `postgres` migration session to alter
that platform-owned table and cannot replay. Do not edit that applied migration,
change the table owner, or hot-move PostGIS. The current baseline omits only its
two obsolete `spatial_ref_sys` access-control statements; the later guarded
geography hardening migration retains the supported platform warning and every
Liber-owned security boundary.

## Locked artifact

`20260714190000_current_supported_baseline` is a generated snapshot through
`20260714150654_add_guided_messaging_v1`. Its header records every source
migration checksum, and the generator pins a digest of the complete source
ledger. A change to any source at or before the cutoff fails closed.

Migrations after the cutoff remain separate forward migration files in both
paths. Run:

```powershell
npm run db:baseline:generate
npm run db:baseline:check
```

The generator copies post-cutoff migrations byte-for-byte into the baseline
path. Never modify or replace the locked baseline after any persistent database
has recorded it. Never run `prisma.baseline.config.ts` against an existing Liber
schema; the SQL also rejects a target with canonical Liber tables.

## Disposable release proof

Use two newly provisioned, sentinel-marked Supabase databases on the same
Postgres major and extension versions as production. Keep all production and
shared-project URLs in the harness deny list.

1. Prepare the upgrade target at the immediate pre-release historical ledger.
2. Run `npm run db:test-messaging:upgrade`; it proves behavior and rolls the
   messaging DDL and fixtures back.
3. Apply the normal forward path persistently to that disposable upgrade
   target with `npx prisma migrate deploy --config prisma.config.ts`.
4. Run `npm run db:test-messaging:fresh` against the second target. It resets
   only the sentinel-marked disposable database through
   `prisma.baseline.config.ts`, verifies the baseline ledger, and runs the same
   messaging authorization/concurrency proof.
5. Run `npm run db:test-baseline-equivalence` with the two database URLs,
   separate 16+ character sentinels, `BASELINE_COMPARE_ALLOW_READS=true`, and
   the shared-target deny URLs. It compares normalized Liber relations,
   columns, constraints, indexes, triggers, functions, policies, enums, schema
   ACLs, required extensions, and Storage bucket definitions.
6. Record the catalog fingerprint and delete both disposable targets.

The historical replay still fails at `00005`; the supported-baseline proof does
not rewrite that fact. The release gate is satisfied only when both the normal
existing-database upgrade and the supported fresh path pass at the exact app
commit.

## Production path

Production is an existing Liber database. Use only `prisma.config.ts` and the
normal migration history. Reconcile names, successful status, and checksums
before and after deployment. Guided Messaging V1 requires a maintenance cutover:
stop invite writes and drain old serverless instances, apply the database
migration, deploy the exact approved application SHA, smoke-test invite creation
and messaging with the feature cohort disabled, then reopen traffic.

There is no destructive messaging down migration. If the transaction fails,
allow PostgreSQL to roll it back and investigate. If it commits and application
verification fails, keep traffic and messaging writes stopped and ship a
reviewed forward correction.
