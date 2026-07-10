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
- `PropertySubtype` values are `HOME` (displayed as House), `CONDO`, `TOWNHOUSE`, `MANUFACTURED`, and `LAND`.
- `VerificationDocument.ownershipEvidenceKind` is nullable for legacy/non-ownership documents and typed for new seller ownership evidence.
- Property ownership identity is `(SellerProperty.id, ownershipVersion)`, and `ownerUserId` is immutable in V1. Database triggers own version increments/reset behavior and evidence binding; application checks are defense in depth.
- Active invite uniqueness is the partial key `(sellerId, buyerProfileId, propertyId)` for `SENT`/`VIEWED`, with required `expiresAt` and seller-scoped serialization before inserts.
- Market and service-area records use immutable UUID primary keys. Service-area slugs are unique within `market_id`, not globally.
- Active service-area metadata is public only when its parent market is active. RLS must preserve that rule.
- Buyer and relationship joins reference service-area UUIDs. Buyers store one primary selection; no copied `DERIVED` rows are allowed.
- Only reviewed `SEARCH_ROLLUP` relationships affect matching, recursively at query time. Reviewed rollup graph writes serialize per market before cycle validation. Spatial/display relationship types do not affect buyer matches.
- Buyer profile/selection writes may commit `ACTIVE` only with one primary `SELECTED` area in an active market. Inferred, ambiguous, multiple-selection, and unresolved legacy profiles belong in `service_area_migration_quarantine` and draft status. Deactivating a market or area automatically drafts affected active profiles.
- `BuyerCriteria.buyerProfileId` is unique in v1, and Prisma models the parent relation as singular/optional. Publication also requires exactly one criteria row through deferred database enforcement; application-side find-then-create logic is not a concurrency guarantee.
- Buyer publication transactions lock the exact immutable Auth UUID `User.id` before reading or writing the owned profile, selection, derived location, criteria, or visibility.
- Resolving a geography quarantine row preserves the legacy/candidate snapshot and records the selected area, actor, source, and resolution time. Resolution does not delete the row; profile-deletion retention is defined separately with the identity lifecycle.
- Market state/country, canonical UUIDs, and service-area market membership are immutable. The canonical cutover locks buyer profiles and selections before snapshot/backfill work and revalidates every `ACTIVE` profile before commit.
- Service-area TS metadata, DB seed rows, and GeoJSON properties/bboxes must stay aligned; add or update validation when touching any of them.
- Bulk geography import remains disabled until Geography PR2 provides reviewed provenance, deploy-independent geometry, relationship import, inactive staging, and atomic market-bounds recomputation.
- Demo seed data is allowed only for local development and CEO demo / private preview environments, never true public production.
- Demo seed scripts must be explicit, guarded by an opt-in env flag, deterministic enough to clean up, and use obvious non-real users/data.

## Agent notes

After schema changes, run `npm run db:validate` and regenerate Prisma client when needed.

Seller-property integrity is currently supplied as unnumbered forward/rollback SQL under `packages/db/prisma/proposals/`. It is not database-proven. Do not promote it into migration history until the disposable harness passes, every legacy ownership decision/quarantine record is reviewed, and active invite duplicates or invalid expiry rows are resolved.

`User.avatarVariant` is an allowlisted generated animal-avatar token for buyer profile display; it should stay nullable so existing accounts fall back to deterministic generated avatars. It is not an image URL or storage path.

`BuyerProfile.displayName` stores a generated neutral public alias, not a buyer-entered name. Application code must normalize old/stale values through the alias allowlist and fall back to a deterministic alias from the buyer id.

When adding seed scripts, include a cleanup path and avoid inserting private document records, real contact information, or fake production trust claims.

The buyer criteria uniqueness/activation SQL is kept as an unnumbered proposal under `packages/db/prisma/proposals/` for CTO migration-order integration. Its paired rollback restores the prior non-unique ownership index.
