# Migration Version Plan — 2026-07-10

> Historical planning record. The LA geography proposal slots below were superseded by assigned migration `20260712090000_expand_la_county_geography`; current deployment state and operations live in `GEOGRAPHY_LA_COUNTY_RELEASE_RUNBOOK.md`.

This document reserves the post-identity migration order for the LA launch
integration. A reservation is not deployment authorization. Proposal SQL stays
unnumbered until its named proof gates pass and a reviewer records the exact
file checksum.

## Observed migration state

- A read-only check of the shared Supabase migration catalog on 2026-07-10
  found the Liber sequence recorded through `20260708000012`.
- `20260709000013` through `20260709000016` were absent from that shared
  catalog. They remain assigned files and must not be rewritten after their
  proof/checksum lock.
- Canonical geography fresh replay is still blocked at historical migration
  `20260521000005` by `spatial_ref_sys` ownership. Existing shared databases use
  forward upgrades. A new database must use a separately reviewed and proven
  current baseline; do not edit the applied historical migration to make replay
  pass.
- The integration runtime is schema-ahead. It must not be deployed to a target
  that stops at `00016`, because it calls functions and uses columns proposed
  below.

## Reserved order

| Reserved slot | Scope | Source today | Promotion condition |
| --- | --- | --- | --- |
| `00017` | Auth/security follow-up: Auth trigger correction, suspension/session revocation, ACTIVE-user Storage policies, leased recipient-bound outbox, generic shared limiter | `docs/engineering/AUTH_SECURITY_FOLLOWUP_FORWARD.sql` | Fresh disposable apply, exact catalog assertions, two-connection limiter/outbox proof, full Auth Admin + Storage lifecycle harness, pre/post counts, rollback review |
| `00018` | One criteria row per buyer and atomic buyer publication enforcement | `packages/db/prisma/proposals/buyer-profile-atomicity.sql` | Fresh apply after `00017`, rollback and two-connection publication/cardinality harness, legacy duplicate preflight review |
| `00019` | Seller property identity/version, ownership evidence binding, owner immutability, invite expiry/uniqueness | `packages/db/prisma/proposals/seller-property-integrity.forward.sql` | Fresh apply after `00018`, all legacy evidence and duplicate/expiry preflights reviewed, seller integrity harness passed |
| `00020` | Seller-search supporting indexes | `docs/engineering/SELLER_SEARCH_SQL_PROPOSAL.sql` | Representative LA-volume `EXPLAIN (ANALYZE, BUFFERS)`, index/advisor review, lock/rollback plan; run `CREATE INDEX CONCURRENTLY` outside a transaction |
| `00021` | Inactive LA County geography staging | isolated branch `codex/geography-la-coverage` at `0ae12d7` | Geography PR1 fresh/upgrade proof closed; proposal transaction/assertion/idempotency/rollback defects fixed; dataset checksums and every relationship reviewed; DB-first compatibility plan approved |
| `00022` | Explicit LA County activation and approved geometry pointer cutover | not authored | Separate human go/no-go after inactive staging counts, geometry bounds, same-name markets, UI races, plans/advisors, and rollback rehearsal pass |

The final timestamped folder names must preserve this order. If an unrelated
migration lands first, shift the reserved slots forward together and update
this document; never reuse a number already applied anywhere shared.

## Proof and rollout rules

1. Record `SHOW server_version_num`, enabled extensions, and the Supabase Data
   API exposed schemas on every disposable/staging evidence record. The target
   Postgres major must match the shared project before approval; no value is
   assumed in this plan.
2. Run `npm run db:test-geography:upgrade` and
   `npm run db:test-geography:fresh` on sentinel-marked disposable databases.
   The fresh path must use the final checked-in migration chain and Prisma
   ledger; direct SQL upgrade harnesses do not substitute for a staged
   `prisma migrate deploy` checksum/ledger rehearsal.
3. Run `npm run db:test-identity`,
   `npm run db:test-auth-security:staging`,
   `npm run db:test-buyer-profile-atomicity`, and
   `npm run db:test-seller-property-integrity` with branch-specific credentials
   and their guarded sentinels. Never reuse parent/shared credentials.
4. Before and after each migration, capture affected table counts, constraint
   violations, quarantined rows, migration-ledger rows, and policy/function
   catalog results. A human must disposition every quarantine row.
5. `00017`–`00019` are transaction-scoped proposals. `00020` is intentionally
   non-transactional because PostgreSQL concurrent index creation cannot run in
   a transaction block. `00021` must gain an explicit transaction and aborting
   acceptance assertions before promotion. `00022` is a distinct activation
   boundary.
6. Keep app tables deny-by-default through RLS. Verify the Data API does not
   expose private schemas such as `app_private` or geography administration
   helpers.

## Rollback boundaries

- `00013`–`00016`: follow their existing geography/identity runbooks. Never
  rewrite or hand-reverse an applied migration.
- `00017`: deploy a compatibility runtime first. The rollback intentionally
  retains security boundaries and lease-aware outbox state; every shared-limiter
  caller must be disabled before its function/table can be removed.
- `00018` and `00019`: use their paired rollback proposals only on a disposable
  rehearsal or through an explicitly reviewed forward correction after shared
  deployment. Preserve audit evidence.
- `00020`: drop only the exact new indexes, concurrently where supported, after
  confirming no dependent plan/regression.
- `00021`: inactive staging must restore any pre-existing inactive rows it
  changed, not merely delete newly inserted rows. That executable rollback does
  not exist yet.
- `00022`: activation rollback must be authored and rehearsed with the final
  activation migration; it may deactivate approved coverage but must not erase
  provenance or review evidence.
