# Canonical Geography Cutover Evidence — 2026-07-09

This artifact records disposable-database proof for migrations `00013`–`00015`.
It does not authorize shared deployment or Los Angeles County expansion. The
full fresh-install gate remains open for the historical `00005` issue described
below.

## Targets and artifacts

- Configured shared project: inspected read-only; `00013`, `00014`, and `00015`
  were absent from Prisma history and the catalog.
- Disposable branch ID: `ebe650a3-a671-4c43-bcc9-05f56d4a03ef`.
- Disposable project ref: `ovloylwspjmqbvazwzmh`.
- Parent project ref: `qfjcrhkjlczvzakxives`.
- `00013` SHA-256: `BF1620124939451637A1E5092B4DA0884CB03C556925984D2D992D1C0EE9B296`.
- `00014` SHA-256: `77C7951DEDF997456559A548E747C0AF08EE141CA3EAEED49C67705D08151804`.
- `00015` SHA-256: `066B524EE7A12BE3FF040D4AC8B5B84D086CABA9E07E53DA136864CB31DF099B`.
- Prisma schema SHA-256: `7F71509717CE839A6F70C72F82D39863CAAAF727A65C2FA09852C8F8E8DB25D5`.

Recompute these hashes after any edit. Any difference invalidates the recorded
exact-artifact proof and requires another clean replay.

## Representative upgrade

The disposable database was prepared through `00012`, then exact checked-in
`00013` and `00014` were applied. Eleven synthetic profiles were seeded before
applying exact checked-in `00015`.

| Measure | Before `00015` | After `00015` |
| --- | ---: | ---: |
| Buyer profiles | 11 | 11 |
| `ACTIVE` profiles | 9 | 1 |
| Buyer-area rows | 5 | 1 |
| `SELECTED` rows | 3 | 1 |
| `DERIVED`/`MIGRATED` rows | 2 | 0 |
| Open quarantine rows | 0 | 10 |

The sole retained selection was the pre-existing single `SELECTED` row for ZIP
`91325` in market `los-angeles`. No inferred candidate was promoted. The final
active-profile invariant and cross-state candidate queries returned zero rows.

### Quarantine review

Disposable UUIDs are intentionally represented by stable `market/slug` values.
All resolution fields were null.

| Fixture profile | Legacy signal | Reason | Reviewed candidates | Outcome |
| --- | --- | --- | --- | --- |
| `geo-upgrade-ambiguous-ca` | Glendale, CA | `AMBIGUOUS_LEGACY_LOCATION` | `los-angeles/glendale`; `secondary-ca/glendale-secondary` | Draft; no selection |
| `geo-upgrade-coordinates-only` | coordinates only | `UNRESOLVED_LEGACY_LOCATION` | none | Draft; no selection |
| `geo-upgrade-glendale-az` | Glendale, AZ | `UNRESOLVED_LEGACY_LOCATION` | none | Draft; no California candidate |
| `geo-upgrade-glendale-missing-state` | Glendale, state missing | `UNRESOLVED_LEGACY_LOCATION` | none | Draft; no candidate |
| `geo-upgrade-selected-multiple` | two existing selections | `MULTIPLE_SELECTED_AREAS` | `los-angeles/91324`; `los-angeles/91325` | Both removed; draft |
| `geo-upgrade-stale-inferred` | Burbank, CA plus stale inferred rows | `MIGRATED_REVIEW_REQUIRED` | `los-angeles/burbank` | Inferred rows removed; draft |
| `geo-upgrade-state-only` | CA state only | `UNRESOLVED_LEGACY_LOCATION` | none | Draft; no selection |
| `geo-upgrade-unique-city` | Burbank, CA | `MIGRATED_REVIEW_REQUIRED` | `los-angeles/burbank` | Draft pending confirmation |
| `geo-upgrade-unsupported` | Sacramento, CA | `UNRESOLVED_LEGACY_LOCATION` | none | Draft; no selection |
| `geo-upgrade-zip-priority` | ZIP 91325 plus conflicting Burbank city | `MIGRATED_REVIEW_REQUIRED` | `los-angeles/91325` | ZIP tier won; draft pending confirmation |

## Database assertions

- Canonical market/service-area IDs, service-area market membership, market
  jurisdiction, and buyer-selection identity rejected mutation.
- ZIP rows without a five-digit postal code and service areas whose state did
  not match their market were rejected.
- Same slug in two markets remained isolated by market UUID.
- Cross-market relationships and sequential reviewed rollup cycles were
  rejected.
- Concurrent reciprocal reviewed rollups serialized on their market: the first
  committed, while the second waited and then failed with `23514`.
- Activation without one active primary selection and removal of the sole
  active selection were rejected.
- Quarantine ID/evidence mutation, incomplete resolution, and post-resolution
  mutation were rejected.
- `anon` and `authenticated` each saw 2 active markets, 16 active areas, one
  reviewed test relationship, and zero unreviewed test relationships.
- `anon` and `authenticated` had no quarantine privileges. `service_role` had
  only `SELECT`, `INSERT`, and `UPDATE`; direct `DELETE` and `TRUNCATE` were
  absent. A service-role resolution update and read both succeeded.
- Market and service-area activation/deactivation races passed in both orders.
  Losing activation returned `23514`; deactivation conflicting with an
  in-flight buyer write returned retryable `55P03` without deadlock.
- Exact `00015` waited for an in-flight pre-cutover buyer write before snapshot
  work, then produced the expected counts. A final empty through-`00014` replay
  accepted exact `00015` with no test functions or fixture data present.

## Supabase advisor result

- No new geography table was reported with disabled RLS or an unintended public
  SECURITY DEFINER function. Quarantine's `RLS enabled, no policy` information
  finding is intentional because browser roles have no table privileges and
  `service_role` bypasses RLS with a restricted grant.
- The security advisor still reports the historical baseline issues:
  [`public.spatial_ref_sys` has RLS disabled](https://supabase.com/docs/guides/database/database-linter?lint=0013_rls_disabled_in_public),
  [PostGIS is installed in `public`](https://supabase.com/docs/guides/database/database-linter?lint=0014_extension_in_public),
  and public PostGIS `st_estimatedextent` SECURITY DEFINER overloads are
  executable. These belong to the fresh-baseline/security gate, not geography
  `00015`.
- Performance findings were unused-index information on an empty disposable
  database and are not workload evidence for removing indexes.

## Local verification

- Validator suite: 13/13 passed.
- Exact staged PR1 unit suite: web 65 passed with the guarded DB E2E skipped;
  validators 13/13 passed.
- Exact staged PR1 workspace typecheck and Prisma validation passed. The
  production build passed from the tracked working tree after confirming it
  matched the staged index; four untracked PR2-only files were not build inputs.
- Geography static migration test passed.
- Migration harnesses passed Node syntax checks.
- Route smoke, security smoke, and forbidden-auth-bypass smoke passed against
  the production build. Local readiness passed with documented warnings for
  production cron and email configuration.
- `npm run lint` exits successfully but runs no workspace linter because no
  workspace currently defines a `lint` script. This is not a real ESLint pass
  and remains a later release-gate task.
- Repository `git diff --check` passed (line-ending warnings only).

## Open fresh-install gate

An exact `00000`–`00015` replay on a newly provisioned current Supabase project
stops in already-deployed historical migration `00005` with `must be owner of
table spatial_ref_sys`. Current Supabase owns that PostGIS catalog table as
`supabase_admin`, while the migration session is `postgres`. The representative
upgrade used a disposable-only baseline compatibility shim that omitted the two
obsolete `spatial_ref_sys` access-control statements; it did not rewrite the
checked-in or deployed `00005`.

Do not mark the cutover proven or deploy it to a shared database until the final
migration/version decision establishes and proves either a supported execution
role for the exact historical chain or an approved schema-equivalent
consolidated fresh baseline.

## Resource lifecycle

- Final empty-schema replay and clean-schema advisor checks completed.
- Disposable branch deleted at `2026-07-09T16:47:58-07:00`
  (`2026-07-09T23:47:58Z`), then confirmed absent from the project branch list.
- Reviewer: Codex technical audit; human review still required before shared
  deployment.
