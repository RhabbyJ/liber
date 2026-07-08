# Section: Database and Prisma

## Purpose

Owns Prisma schema, migrations, generated client, indexes, enums, and database-level safety rules.

## Main files

- `packages/db/prisma/schema.prisma`
- `packages/db/prisma/migrations/**`
- `packages/db/src/**`
- `prisma.config.ts`

## Invariants

- Schema changes require migrations.
- User IDs must remain Supabase Auth UUID-compatible.
- RLS/storage policies are security boundaries.
- Do not weaken constraints to bypass application bugs.
- Keep indexes aligned with search and ownership checks.
- Demo seed data is allowed only for local development and CEO demo / private preview environments, never true public production.
- Demo seed scripts must be explicit, guarded by an opt-in env flag, deterministic enough to clean up, and use obvious non-real users/data.

## Agent notes

After schema changes, run `npm run db:validate` and regenerate Prisma client when needed.

`User.avatarVariant` is an allowlisted generated animal-avatar token for buyer profile display; it should stay nullable so existing accounts fall back to deterministic generated avatars. It is not an image URL or storage path.

`BuyerProfile.displayName` stores a generated neutral public alias, not a buyer-entered name. Application code must normalize old/stale values through the alias allowlist and fall back to a deterministic alias from the buyer id.

When adding seed scripts, include a cleanup path and avoid inserting private document records, real contact information, or fake production trust claims.
