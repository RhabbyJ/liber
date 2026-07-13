# Section: Database and Prisma

## Purpose

Owns Prisma schema, migrations, generated client, indexes, enums, and database-level safety rules.

## Main files

- `packages/db/prisma/schema.prisma`
- `packages/db/prisma/migrations/**`
- `packages/db/src/**`
- `prisma.config.ts`
- `apps/web/public/geo/service-areas/**`

## Invariants

- Schema changes require migrations.
- User IDs must remain Supabase Auth UUID-compatible.
- `User.id` is immutable and validated against the `auth.users` primary key.
  Auth deletion and all ownership-key updates are restricted until the explicit
  account-retention workflow completes.
- Auth signup inserts a fresh empty-role User by UUID. A normalized email
  collision raises recovery-required and never updates a primary key.
- RLS/storage policies are security boundaries.
- Do not weaken constraints to bypass application bugs.
- Keep indexes aligned with search and ownership checks.
- The service-area search-term composite ownership foreign key is covered in `(service_area_id, market_id)` order; its separate market/term prefix index remains migration-owned because Prisma cannot model `INCLUDE`.
- `PropertySubtype` values are `HOME` (displayed as House), `CONDO`, `TOWNHOUSE`, `MANUFACTURED`, and `LAND`.
- `VerificationDocument.ownershipEvidenceKind` is nullable for legacy/non-ownership documents and typed for new seller ownership evidence.
- `BuyerCriteria.buyerProfileId` is unique; an active buyer has exactly one criteria row and one active primary selected service area.
- Property authority attestations, ownership decisions, documents, images, and invites are tied to `SellerProperty.identityVersion`.
- `UploadSession.buyerProfileId` is a real foreign key. Abandoned sessions leave cleanup eligibility only after their object has been removed, then enter terminal `CLEANED` state.
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
- `npm run demo:buyers -- seed|verify|cleanup` is the only shared CEO-preview buyer-data command. It requires `LIBER_ALLOW_DEMO_SEED=true`, `LIBER_CEO_PREVIEW_TARGET=ceo-preview`, and an absolute `LIBER_CEO_PREVIEW_CREDENTIALS_FILE` path outside the repository; the Supabase API and direct database project refs must match.

## Agent notes

After schema changes, run `npm run db:validate` and regenerate Prisma client when needed.

Production migration readiness compares the complete checked-in migration directory set with successful, non-rolled-back `_prisma_migrations` rows. A hardcoded latest migration name is not a valid readiness check; database-only migration names are reported separately.

`User.avatarVariant` is an allowlisted generated animal-avatar token for buyer profile display; it should stay nullable so existing accounts fall back to deterministic generated avatars. It is not an image URL or storage path.

`BuyerProfile.displayName` stores a generated neutral public alias, not a buyer-entered name. Application code must normalize old/stale values through the alias allowlist and fall back to a deterministic alias from the buyer id.

When adding seed scripts, include a cleanup path and avoid inserting private document records, real contact information, or fake production trust claims.
