# Section: LOI Negotiation

## Purpose and source of truth

Owns the cohort-gated, non-binding LOI term-alignment workspace linked to an
accepted invite.

`docs/engineering/LIBER_LOI_V1.md` is the sole LOI completion, audit, release,
deployment, and rollback artifact. Read it before changing LOI behavior. Do not
recreate dated LOI audits or a separate implementation blueprint; update that
one final document and the applicable repository-wide product/architecture
source of truth.

## Main files

- `packages/validators/src/loi.ts`
- `apps/web/server/loi/**`
- `apps/web/app/api/loi/**`
- `apps/web/app/negotiations/**`
- `apps/web/components/loi/**`
- `packages/db/prisma/migrations/20260716030741_add_loi_negotiations/**`
- `packages/db/prisma/migrations/20260716120000_harden_loi_event_semantics/**`
- `packages/db/prisma/migrations/20260717023000_grant_authenticated_app_private_usage/migration.sql`
- `packages/db/prisma/current-baseline/migrations/20260717023000_grant_authenticated_app_private_usage/migration.sql`
- `packages/db/prisma/migrations/20260717033000_harden_app_private_function_defaults/migration.sql`
- `packages/db/prisma/current-baseline/migrations/20260717033000_harden_app_private_function_defaults/migration.sql`
- `scripts/test-loi-migration.mjs`
- `scripts/test-loi-database.mjs`
- `scripts/test-loi-behavior.mjs`
- `scripts/realtime-branch-proof-subscriber.mjs`

## Do not break

- Immutable participant/property bindings, owner-private drafts, alternating
  immutable revisions, exact-version actions, and non-binding language.
- Server authorization, fixed lock order, request fingerprints, deadline and
  eligibility rechecks, RLS/no-raw-CRUD, and content-free Realtime/email.
- The four immutable migration checksums in the LOI/release chain and the
  protected disposable proof gates. The two cross-cutting private-ACL
  migrations are byte-identical in both roots. The authenticated policy-helper
  access migration has SHA-256
  `1b1f6afbc6a233eea9e10e5c24a5a7998a1cbdbbe4805dcc7c4b0b79a82bcc84`.
  It grants `authenticated` schema `USAGE` without `CREATE` or relation access
  and `EXECUTE` only on `can_join_conversation_topic(text)`,
  `can_join_loi_topic(text)`, `can_read_property_image(text, uuid)`, and
  `can_upload_session_object(text, text, uuid)`. `PUBLIC`, `anon`, and
  `service_role` remain closed and `app_private` remains outside the Data API.
  The follow-up default-ACL migration has SHA-256
  `d1495a84e4f547da535ace05211fe4956624696995da777b83f8cec34cf3615f`
  and closes global plus `app_private`-scoped non-owner PostgreSQL default
  function `EXECUTE` grants.
  Never edit the base migration or claim an unrun protected job passed.
