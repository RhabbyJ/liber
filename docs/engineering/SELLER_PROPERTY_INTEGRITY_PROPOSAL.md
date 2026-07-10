# Seller Property Integrity Proposal

This proposal binds seller ownership review to the exact private property state and makes invite validity authoritative at request and database time. It does not add a public seller profile, public property listing, or seller-facing public DTO.

## Proposed database change

- Forward SQL: `packages/db/prisma/proposals/seller-property-integrity.forward.sql`
- Rollback SQL: `packages/db/prisma/proposals/seller-property-integrity.rollback.sql`
- Prisma projection: `packages/db/prisma/schema.prisma`

The SQL remains intentionally unnumbered. Promote it to a numbered migration only after review, duplicate remediation, and disposable-branch proof.

## Ownership invariant

The ownership identity is `(SellerProperty.id, SellerProperty.ownershipVersion)`. The V1 owner UUID is immutable. Either address line, city, state, ZIP, latitude, or longitude changing increments the version and sets ownership status to `PENDING`. Both required typed evidence kinds must be approved for the current version and exact `ownerUserId` before the database permits `APPROVED`.

Prior-version evidence rows and files are retained. Because pre-cutover property identity was not versioned, every legacy ownership evidence decision—typed or generic—is reopened to `PENDING` and left permanently unbound from a version. Former decisions and review metadata are copied to `AdminAuditLog` before live review fields are cleared. Null-version evidence is audit-only: an admin may classify or reject it, but neither the application nor the database may bind or approve it. Current approval requires fresh evidence uploaded against the current property version.

## Invite invariant

`expiresAt` becomes required, must be later than `sentAt`, and legacy nulls are backfilled from `sentAt + 30 days`. Application reads render stale `SENT`/`VIEWED` rows as expired immediately, response updates compare against the database clock, and reuse expires a stale duplicate before insert.

The database trigger takes a seller-scoped transaction advisory lock, repeats seller access, exact property ownership, active buyer, self-invite, expiry, and rate-limit checks, then relies on a partial unique index to permit only one `SENT`/`VIEWED` invite per seller, buyer profile, and property. The proposal aborts if pre-existing non-expired duplicate groups remain; it does not silently choose a winner.

## Verification gate

Create a disposable Supabase branch at the current schema and add:

```sql
create table public.seller_property_integrity_test_sentinel (token text primary key);
insert into public.seller_property_integrity_test_sentinel values ('replace-with-16-plus-character-token');
revoke all on table public.seller_property_integrity_test_sentinel
  from public, anon, authenticated, service_role;
```

Then set the branch-specific direct URL and matching sentinel:

```txt
SELLER_PROPERTY_INTEGRITY_TEST_DATABASE_URL=
SELLER_PROPERTY_INTEGRITY_TEST_SENTINEL=
SELLER_PROPERTY_INTEGRITY_TEST_ALLOW_WRITES=true
```

Run `npm run db:test-seller-property-integrity`. The harness refuses configured shared database targets and must prove ownership edits, owner immutability, wrong-version/wrong-owner evidence rejection, quarantine of typed and generic legacy decisions, permanent audit-only enforcement for null-version evidence, one-winner document review, database-clock expiry, exact owner/self-invite checks, and concurrent duplicate inserts. This proof remains open until the guarded command succeeds on the integrated schema.

## Rollback boundary

Rollback removes the version, expiry, and partial-uniqueness constraints, so it is safe only before accepting new version-bound evidence or invites. It restores quarantined legacy decisions from audit snapshots, but cannot preserve post-cutover evidence meaning and does not revive invites already marked `EXPIRED`. It also removes the database owner-immutability boundary. Prefer a forward correction after any post-cutover write and keep all audit rows.
