# Section: Database and Prisma

## Purpose

Owns Prisma schema, migrations, generated client, indexes, enums, and database-level safety rules.

## Main files

- `packages/db/prisma/schema.prisma`
- `packages/db/prisma/migrations/**`
- `packages/db/prisma/migrations/20260717023000_grant_authenticated_app_private_usage/migration.sql`
- `packages/db/prisma/current-baseline/migrations/20260717023000_grant_authenticated_app_private_usage/migration.sql`
- `packages/db/prisma/migrations/20260717033000_harden_app_private_function_defaults/migration.sql`
- `packages/db/prisma/current-baseline/migrations/20260717033000_harden_app_private_function_defaults/migration.sql`
- `packages/db/src/**`
- `prisma.config.ts`
- `apps/web/public/geo/service-areas/**`

## Invariants

- Schema changes require migrations.
- Existing databases use `prisma.config.ts` and the immutable historical
  migration root. Brand-new current Supabase databases use
  `prisma.baseline.config.ts` and the locked current-baseline root; pointing the
  fresh-only path at an existing Liber schema must fail closed.
- The current baseline is locked through Guided Messaging V1. Later migrations
  remain separate forward files in both roots and must be byte-identical; run
  `npm run db:baseline:generate` and `npm run db:baseline:check` after adding one.
- `.gitattributes` pins both forward roots to LF so byte-identity checks are
  stable across Windows and Linux. The older
  `20260708000012_add_property_subtypes_and_ownership_evidence` file remains an
  explicit CRLF exception because that is the checksum production recorded;
  the locked baseline normalizes pre-cutoff line endings.
- Migration `20260716030741_add_loi_negotiations` adds one negotiation per
  accepted invite, owner-private versioned drafts, immutable alternating
  revisions, idempotent events, content-free outbox references, RLS/no-browser-
  CRUD boundaries, and identifier-only private Realtime authorization.
- Forward migration `20260716120000_harden_loi_event_semantics` makes event actor
  retention explicit, replaces the closed-state mapping, and validates event
  actor/role/current-revision shape against authoritative participants. Never
  fold it back into or otherwise edit the base LOI migration.
- Forward migration
  `20260717023000_grant_authenticated_app_private_usage` restores authenticated
  private-policy evaluation without opening `app_private`. `authenticated` has
  schema `USAGE` but not `CREATE`, no relation privileges, and `EXECUTE` on
  exactly the four current policy dependencies:
  `can_join_conversation_topic(text)`, `can_join_loi_topic(text)`,
  `can_read_property_image(text, uuid)`, and
  `can_upload_session_object(text, text, uuid)`. `PUBLIC`, `anon`, and
  `service_role` retain no schema access; all other direct function execution
  remains closed, and `app_private` is not exposed through the Data API. The
  byte-identical file in each migration root has SHA-256
  `1b1f6afbc6a233eea9e10e5c24a5a7998a1cbdbbe4805dcc7c4b0b79a82bcc84`.
- Forward migration
  `20260717033000_harden_app_private_function_defaults` removes non-owner
  PostgreSQL default function `EXECUTE` grants both globally and specifically
  within `app_private`. Future `postgres`-owned private functions therefore
  remain owner-only unless a reviewed migration opts them in. Its byte-identical
  copies have SHA-256
  `d1495a84e4f547da535ace05211fe4956624696995da777b83f8cec34cf3615f`.
- LOI relational columns own authorization and lifecycle. Versioned strict JSON
  owns proposed term snapshots only. Submitted revisions and events are
  append-only. Each revision stores a calculation-version-matched summary;
  historical display decodes that stored summary instead of recalculating it.
- Migration `20260715215000_reconcile_email_outbox_lease` removes the retired
  unnumbered outbox recipient/UUID-lease artifacts from drifted targets and
  validates the canonical worker-lease and delivery-reference constraints.
- User IDs must remain Supabase Auth UUID-compatible.
- `User.id` is immutable and validated against the `auth.users` primary key.
  Auth deletion and all ownership-key updates are restricted until the explicit
  account-retention workflow completes.
- Auth signup inserts a fresh empty-role User by UUID. A normalized email
  collision raises recovery-required and never updates a primary key.
- RLS/storage policies are security boundaries.
- Do not weaken constraints to bypass application bugs.
- Keep indexes aligned with search and ownership checks.
- The service-area search-term composite ownership foreign key is covered in `(service_area_id, market_id)` order. Prefix lookup and uniqueness share `service_area_search_terms_market_term_prefix_idx`; do not reintroduce a redundant `INCLUDE` index.
- `PropertySubtype` values are `HOME` (displayed as House), `CONDO`, `TOWNHOUSE`, `MANUFACTURED`, and `LAND`.
- `VerificationDocument.ownershipEvidenceKind` is nullable for legacy/non-ownership documents and typed for new seller ownership evidence.
- `BuyerCriteria.buyerProfileId` is unique; an active buyer has exactly one criteria row and one active primary selected service area.
- Property authority attestations, ownership decisions, documents, images, and invites are tied to `SellerProperty.identityVersion`.
- Migration `20260715071054_retire_legacy_ownership_version` removes retired unnumbered-proposal `ownershipVersion`/`propertyOwnershipVersion` artifacts from drifted existing targets. Do not restore a parallel ownership-version lifecycle; `identityVersion` is authoritative.
- `UploadSession.buyerProfileId` is a real foreign key. Abandoned sessions leave cleanup eligibility only after their object has been removed, then enter terminal `CLEANED` state.
- Guided messaging tables enforce one conversation per invite, exactly two
  invite-derived participants, participant-only human senders, immutable
  message bodies, UUID client idempotency, report evidence, and all FK/query
  indexes at the database boundary.
- New messaging tables are RLS-enabled and have no raw browser CRUD. The only
  browser-facing database policy is private Realtime receive authorization via
  an active-participant helper; browsers receive no Broadcast INSERT policy.
- `property-images` and `verification-documents` are private buckets; signed upload sessions authorize immutable server-selected paths.
- Market and service-area records use immutable UUID primary keys. Service-area slugs and stable source identities are unique within `market_id`, not globally; this permits a boundary-clipped source area in an adjacent future market.
- Active service-area metadata may be public only through the narrow server API when its parent market is active. `anon` and `authenticated` have no direct privileges on the canonical geography tables; RLS remains enabled as defense in depth.
- Buyer and relationship joins reference service-area UUIDs. Buyers store one primary selection; no copied `DERIVED` rows are allowed.
- Only reviewed `SEARCH_ROLLUP` relationships affect matching, recursively at query time. Reviewed rollup graph writes serialize per market before cycle validation. Spatial/display relationship types do not affect buyer matches.
- Buyer profile/selection writes may commit `ACTIVE` only with one primary `SELECTED` area in an active market. Inferred, ambiguous, multiple-selection, and unresolved legacy profiles belong in `service_area_migration_quarantine` and draft status. Deactivating a market or area automatically drafts affected active profiles.
- Resolving a geography quarantine row preserves the legacy/candidate snapshot and records the selected area, actor, source, and resolution time. Resolution does not delete the row; profile-deletion retention is defined separately with the identity lifecycle.
- Market state/country, canonical UUIDs, and service-area market membership are immutable. The canonical cutover locks buyer profiles and selections before snapshot/backfill work and revalidates every `ACTIVE` profile before commit.
- Service-area TS metadata, DB seed rows, and GeoJSON properties/bboxes must stay aligned; add or update validation when touching any of them.
- LA County migration `20260712090000_expand_la_county_geography` owns immutable dataset, County-boundary, display-geometry, and selected-area-geometry versions. These tables are private server data with RLS enabled and no browser-role policies.
- Geography hardening migration `20260713051527_harden_la_geography_security` closes raw browser access to `markets`, `service_areas`, `service_area_relationships`, and `buyer_desired_service_areas`; limits `service_role` on those tables to CRUD; and closes the schema-scoped defaults. Additive migration `20260713054016_close_public_function_defaults` removes PostgreSQL's global `PUBLIC EXECUTE` default so new `postgres`-owned public functions are also opt-in.
- `geography_admin.search_active_service_areas` is a security-invoker server function with no browser/service-role execute grant. Its C-collated lexical range and prefix predicate must continue to use `service_area_search_terms_market_term_prefix_idx` under the default planner.
- Migration `20260713054720_consolidate_service_area_prefix_index` removes the redundant larger prefix index and maps the existing `(market_id, term_normalized, service_area_id)` unique covering index to that plan-contract name.
- LA County staging is inert and idempotent. Activation requires exact raw and canonical bundle hashes, an explicit 88-city/304-ZCTA allowlist, a pre-change ownership snapshot, and aborting postconditions. Rollback restores live metadata/pointers/activation, retains immutable evidence and stable source IDs, and fails before mutation if an active buyer would lose its service area.
- The supported LA release command serializes stage, activation, and rollback with a transaction advisory lock; do not bypass it with concurrent manual function calls.
- Dataset validation must verify the external checksum ledger, bundle bytes/content, exact source features, per-area source hashes, counts, and official relationship evidence.
- Destructive migration rehearsal/import proof is disposable-target-only. The guarded production release command may stage the exact reviewed bundle, but staging must not change active rows, current pointers, market bounds, live terms, or live relationships. Activation is a separate owner-only exact-hash action installed by the same reviewed migration and runs only after stage/deploy reconciliation.
- Demo seed data is allowed only for local development and CEO demo / private preview environments, never true public production.
- Demo seed scripts must be explicit, guarded by an opt-in env flag, deterministic enough to clean up, and use obvious non-real users/data.
- PL/pgSQL timestamp variables must not use SQL special-value names such as `current_time`; the three-argument rate-limiter overload uses `v_now` so writes remain compatible with Prisma `timestamp(3)` columns.
- `npm run demo:buyers -- seed|verify|cleanup` is the only shared CEO-preview buyer-data command. It requires `LIBER_ALLOW_DEMO_SEED=true`, `LIBER_CEO_PREVIEW_TARGET=ceo-preview`, and an absolute `LIBER_CEO_PREVIEW_CREDENTIALS_FILE` path outside the repository; the Supabase API and direct database project refs must match.

## Agent notes

After schema changes, run `npm run db:validate` and regenerate Prisma client when needed.

Before approving a schema release, prove both the existing-database upgrade and
the supported fresh baseline on separate sentinel-marked disposable Supabase
targets, then run `npm run db:test-baseline-equivalence`. Never edit an applied
historical migration or the locked baseline to make a replay pass.

The LOI migration must precede the application deployment because messaging
block and maintenance code reference LOI tables even with the feature flag off.
Apply all four authoritative migrations in the LOI/release chain: the base,
semantic hardening, authenticated policy-helper access, and private-function
default hardening migrations. The last two are cross-cutting Realtime/Storage
security changes. Use the guarded
`db:test-loi:upgrade` and `db:test-loi:fresh` commands only on separate
sentinel-marked disposable targets, then run `db:test-loi:behavior` against each
migrated target. Each harness compares the recorded ledger checksums with the
reviewed bytes and rejects configured shared direct/pooler identities. The
upgrade proof stages the base migration through `prisma.loi-stage.config.ts`,
seeds representative valid LOI history, applies all three forward migrations
through the normal migration root, and proves data survival, repaired semantics,
the exact authenticated-only `app_private` ACL contract, and closed global and
schema-specific default function privileges.

Production migration readiness compares the complete checked-in migration directory set with successful, non-rolled-back `_prisma_migrations` rows. A hardcoded latest migration name is not a valid readiness check; database-only migration names are reported separately.

The only retained-lineage exception is the exact comment-only applied artifact
for `20260707000009_add_avatar_variant` under
`packages/db/prisma/retained-lineage/qfjcrhkjlczvzakxives`. Readiness requires
matching Supabase API/direct project refs, pinned canonical and retained
checksums, and identical comment-stripped SQL. Never make the checksum global,
point Prisma at the evidence directory, edit the historical migration, update
the ledger manually, or use `migrate resolve` to silence drift.

`User.avatarVariant` is a required allowlisted generated animal-avatar token for account and buyer profile display. Migration `20260715081708_persist_user_avatar` backfills older accounts and enforces the stored value for new accounts. It is not an image URL or storage path.

`BuyerProfile.displayName` stores a generated neutral public alias, not a buyer-entered name. Application code must normalize old/stale values through the alias allowlist and fall back to a deterministic alias from the buyer id.

When adding seed scripts, include a cleanup path and avoid inserting private document records, real contact information, or fake production trust claims.
