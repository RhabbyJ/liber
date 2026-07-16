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
- `scripts/test-loi-migration.mjs`
- `scripts/test-loi-database.mjs`
- `scripts/test-loi-behavior.mjs`

## Do not break

- Immutable participant/property bindings, owner-private drafts, alternating
  immutable revisions, exact-version actions, and non-binding language.
- Server authorization, fixed lock order, request fingerprints, deadline and
  eligibility rechecks, RLS/no-raw-CRUD, and content-free Realtime/email.
- The two immutable migration checksums and the protected disposable proof
  gates. Never edit the base migration or claim an unrun protected job passed.
