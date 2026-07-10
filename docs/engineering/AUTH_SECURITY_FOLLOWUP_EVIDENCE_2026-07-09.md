# Auth Security Follow-up Evidence - 2026-07-09

This artifact covers the unnumbered Auth/security follow-up proposal. It does
not authorize deployment to the shared Liber project.

## 2026-07-10 CTO repair addendum

The disposable results below are retained as historical evidence for the prior
proposal revision. They do not prove the current repaired SQL. The current
revision replaces message-string collision detection with structured Supabase
status/code handling plus a post-failure application lookup, short-circuits the
IP limiter before email, adds expiry and bounded pruning to the generic limiter,
quarantines every unmatched unsent and pre-lease SENDING outbox row, and replaces
the partial claim with a tokenized expiring lease claimed in one SQL
`FOR UPDATE SKIP LOCKED`/UPDATE path. It also removes direct authenticated-admin
document reads, adds ACTIVE checks to profile-photo writes, and expands the
guarded staging harness to property-image/profile-photo writes. The verified
callback now passes no roles and cannot turn user-editable Auth metadata into
BUYER, SELLER, or ADMIN authorization.

Local focused tests and typecheck cover those runtime/static invariants, but the
repaired forward proposal has not been applied to a new disposable database and
the guarded Auth/Storage staging harness has not run. Both gates remain open.

Current local verification on 2026-07-10:

- Focused Auth/security suite: 29 tests passed across 9 files.
- Full workspace tests: 3 database-target guard tests, 98 web tests passed with
  1 guarded database E2E skipped, and all 13 validator tests passed.
- Full workspace typecheck passed.
- Prisma client generation and schema validation passed using a syntactically
  valid local placeholder URL; neither command contacted a database.
- The production build passed with placeholder build-time environment values.
- Both guarded harness scripts passed Node syntax checks, and `git diff --check`
  passed with line-ending warnings only.
- No current-revision database migration, Auth Admin call, or Storage lifecycle
  proof was run locally.

## Disposable branch

- The branch was named `auth-security-followup-staging`.
- Automatic migration reproduced the documented historical `00005` fresh-chain
  failure before application schema creation.
- The branch was prepared with the existing test-only `00005` compatibility
  omission, exact migrations through `00016`, then the unnumbered forward SQL.
- No migration or application write was sent to the shared parent.
- The disposable branch was deleted after proof and confirmed absent from the
  branch list, stopping its hourly cost.

## Catalog and concurrency proof

The normalized-email index reported expression `lower(btrim(email))`, unique and
valid true, btree, and no predicate. The Auth update trigger reported
`AFTER UPDATE OF email` with an email-change `WHEN` clause. The update function
contains no `raw_user_meta_data` name synchronization.

Two connector connections simultaneously inserted lower/upper case variants of
the same synthetic `example.invalid` email. Exactly one committed. The other
failed with SQLSTATE `23505` and `LIBER_IDENTITY_RECOVERY_REQUIRED`; the
application User count for the normalized email was exactly one.

Two concurrent calls to the shared Auth limiter with a limit of one produced
one allowed response and one denied response with a positive retry interval.
The first execution found and corrected a PL/pgSQL `current_time` name collision;
the final forward SQL was reapplied and the concurrent proof then passed.

## Suspension and direct Storage proof

A real branch Auth signup established sessions and uploaded private PDF fixtures
through the Storage API. The database suspension transaction suspended User and
SellerAccess, cancelled one pending recipient-bound outbox job, revoked Auth
sessions, and wrote the suspension audit event.

Using an access JWT issued before suspension, a fixture that had never been read
before suspension was denied direct Storage upload, download, and list access.
The uncached fixture is required: a previously downloaded object can produce a
Storage cache hit and is not a valid RLS assertion.

## Historical local verification for the prior revision

- Forward SQL applied successfully to the disposable branch.
- Focused Auth/security unit tests: 18 passed across 6 files.
- Prisma schema validation passed.
- Prisma client generation and full workspace typecheck passed.
- Full workspace tests passed: 3 database-target guards, 80 web tests with one
  guarded database E2E skipped, and 13 validator tests.
- Production build, route smoke, security smoke, and forbidden-auth-bypass
  smoke passed. Local readiness passed with pre-existing cron/email warnings.

Supabase security/performance advisors were run after the proposal. They found
no new follow-up function or Storage-policy finding. Results were the historical
fail-closed RLS-without-policy notices, PostGIS/spatial advisor items, leaked
password protection disabled, and unused-index notices on the empty test data.

## Remaining gates

- Apply the repaired 2026-07-10 proposal to a new sentinel-marked disposable
  database. Run its real expired-lease recovery, bounded-prune, constraint,
  catalog, and concurrent-claim assertions. The earlier proposal run is not a
  substitute.
- The now-explicitly transaction-wrapped `00016` has a new checksum and must be
  rerun as part of that exact disposable chain. The shared migration catalog was
  checked read-only on 2026-07-10 and still does not contain `00016`.
- The disposable branch rejected the parent database password and service-role
  key, as expected. Branch-specific direct database and service-role credentials
  were not available through the connector.
- `npm run db:test-identity` therefore could not execute its direct
  two-connection lock-timing path against this branch.
- The full guarded staging harness could not exercise the application Admin API
  ban call, Storage service-role cleanup, Auth Admin deletion, complete
  deletion/re-registration sequence, direct-admin document denial, or suspended
  property-image/profile-photo insert/update/delete denial without those
  credentials.
- Connector proof set the synthetic Auth ban state and proved session
  revocation/Storage denial, but it is not a substitute for the full Admin API
  harness.
- CTO must review and number the proposal. Migrations `00009` and `00016` remain
  unchanged.
