# Auth Identity Ownership Evidence - 2026-07-09

This artifact records read-only shared-database audit results and disposable
proof for `20260709000016_harden_auth_identity_ownership`. It does not authorize
deployment to the shared database.

## Exact artifacts

- `00016` SHA-256:
  `9E7F102BF79B97DD377F7EC4EE2844940525006EBBE18E781D0264C8E3A84288`.
- Prisma schema SHA-256:
  `61D1CBD17A41110B2E93E31924654F324206A6170F48F6D01EF7BB228E223BB5`.

Recompute both hashes after any edit. A difference invalidates the exact
migration proof.

## Shared Liber audit

The shared project was queried read-only.

On 2026-07-10, the Supabase migration catalog was checked again. Its newest
record remains the property subtype/ownership-evidence migration; `00013` through
`00016` are absent. This confirms `00016` can still receive explicit transaction
boundaries without rewriting shared migration history.

- `00007` has a successful migration record.
- `00009` has one rolled-back attempt and one successful migration record.
- `00010` has a successful migration record.
- The installed signup function contains `ON CONFLICT (email) DO UPDATE` and
  `id = EXCLUDED.id`.
- 19 application Users and 19 Auth users currently match by UUID and normalized
  email.
- Zero application UUIDs are absent from Auth.
- Zero current same-email/different-UUID pairs exist.
- Zero buyer profiles, seller approvals, seller properties, invites,
  verification documents, or actor audit events predate their current Auth UUID
  by more than 60 seconds.
- Zero verification-document UUID path prefixes differ from current `userId`.
- One historical user-target audit ID has no current User.
- `auth.audit_log_entries` is empty, and the last 24 hours of Auth/Postgres logs
  contain no signup-database-error or rebinding signal.

These results found no current or temporal evidence of a rebind. They cannot
prove that no historical UUID changed: the vulnerable cascades rewrote foreign
keys in place, and retained Auth audit evidence is empty. Backups, PITR, or
longer-retention logs are required for a definitive historical reconstruction.

## Disposable target

- Branch ID: `f774c665-d06b-4f61-ba3e-a68acbfdb5db`.
- Project ref: `qgwoklquytmybwtiflrm`.
- Parent ref: `qfjcrhkjlczvzakxives`.
- Synthetic identities used only `example.invalid` addresses.

Supabase automatic branch migration reported `MIGRATIONS_FAILED` and left an
empty application schema, consistent with the separately reproduced historical
fresh-chain problem; branch-action logs did not expose the failing statement.
This occurred before identity migration `00016`. The proof schema was built
through exact `00012`, omitting only the two obsolete `spatial_ref_sys`
statements from historical `00005`, then seeded with the vulnerable deployed
function and representative ownership rows.

The prior `00016` payload applied successfully to that representative upgrade.
The current artifact changes no DDL ordering or semantics but adds explicit
`BEGIN`/`COMMIT`, so its new checksum must be rerun on the sentinel-marked
disposable upgrade target before merge. The earlier run is not exact-artifact
proof for the transaction-wrapped file.

## Catalog assertions

- Installed signup function contains no `id = EXCLUDED.id`.
- Installed signup function contains `LIBER_IDENTITY_RECOVERY_REQUIRED`.
- User UUID immutability trigger exists.
- `User.id -> auth.users.id` is validated with update/delete restriction.
- All 11 foreign keys that reference `User` use `ON UPDATE RESTRICT`.
- The normalized application email index is unique.
- anon, authenticated, and service roles cannot directly execute the signup
  trigger function.

## Ownership and lifecycle assertions

The old UUID owned BUYER, SELLER, and ADMIN roles, approved seller access, a
buyer profile, seller property, verification document, notification, and admin
audit event.

- Direct `User.id` mutation failed with SQLSTATE `23514` and
  `LIBER_USER_ID_IMMUTABLE`.
- Raw Auth deletion failed with SQLSTATE `23503` on
  `User_id_auth_users_fkey`.
- Buyer ownership, approved seller access, property ownership, document
  ownership, and ADMIN role remained on the old UUID.
- After temporarily simulating a pre-fix orphan on the disposable branch, a new
  Auth UUID using the old email failed with
  `LIBER_IDENTITY_RECOVERY_REQUIRED`.
- After an explicit destructive purge, same-email re-registration created a new
  UUID with empty roles and zero inherited buyer profiles, seller access,
  properties, or documents.
- The audit event remained with a null actor after the completed purge.

The connector proof did not expose the branch-specific database password, so it
could not run the local harness's two-connection lock-timing assertion. The
checked-in harness and static test assert Auth-first lock order; staging must run
the concurrent assertion with disposable direct credentials before merge.

## Advisor review

No identity migration function, constraint, or index produced a new advisor
finding. The disposable test sentinel itself was intentionally public and was
deleted with the branch. Other findings were historical baseline items or
unused-index information on an empty/test database, including:

- [RLS enabled with no policy](https://supabase.com/docs/guides/database/database-linter?lint=0008_rls_enabled_no_policy)
  on fail-closed application tables,
- [PostGIS in public](https://supabase.com/docs/guides/database/database-linter?lint=0014_extension_in_public),
- public PostGIS SECURITY DEFINER RPC exposure,
- and leaked-password protection disabled.

These remain later security/release gates; they were not caused by `00016`.

## Local verification

- Full workspace tests after the cleanup review: database-target guards 3/3,
  web 75 passed with one guarded database E2E skipped, and validators 13/13.
- Focused identity suite: 12/12 passed, including locked role persistence and
  suspended/missing/collision/ADMIN-denial cases.
- Full workspace typecheck passed.
- Prisma schema validation and client generation passed with no generated-file
  diff.
- Default Turbopack production build passed.
- Route, security-header/protected-route, and forbidden-auth-bypass smoke checks
  passed against the production build. Route smoke includes the explicit
  identity-recovery message.
- Local readiness passed with production warnings for missing cron/email
  configuration; optional error reporting was also not configured locally.
- `npm run lint` exits successfully but no workspace defines a real lint script;
  this is not an ESLint pass and remains a release-gate task.
- Identity migration harness passed Node syntax validation. Its connector-based
  database assertions passed; the direct two-connection run remains a staging
  gate as described above.

## Resource lifecycle and remaining gates

- Disposable branch deleted after proof and confirmed absent from the branch
  list.
- Shared Liber data and schema were not changed.
- Exact historical fresh migration remains blocked at deployed `00005` on
  current Supabase.
- Full two-connection harness, staging Auth API flows, session revocation, and
  direct Storage denial remain required before shared deployment.

## Cleanup review addendum

The post-proof lean-code review removed an unused duplicate password-login
server action and the unauthenticated application-email preflight. The guarded
identity harness now rejects direct and pooler URLs for the same Supabase
project, its three database-target tests pass, and the runbook explicitly
requires operators to create the disposable sentinel before an empty-branch
run. The direct two-connection staging run remains open; this addendum does not
represent it as passed.

## Transaction-boundary addendum - 2026-07-10

The shared migration catalog still did not contain `00016`, so the migration was
wrapped in explicit `BEGIN`/`COMMIT`. The checksum above is the LF-normalized
checked-in artifact. This makes the runbook's all-or-nothing rollback guarantee
an explicit property of the SQL rather than an assumption about migration-runner
behavior. The Prisma checksum now also includes the unnumbered follow-up's
additive EmailOutbox recipient/lease fields and indexes. The exact wrapped
migration plus current schema/proposal still requires the guarded disposable
fresh/upgrade run; no shared database write was made.
