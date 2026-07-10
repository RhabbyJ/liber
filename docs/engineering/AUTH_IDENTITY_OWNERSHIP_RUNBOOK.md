# Auth Identity Ownership Runbook

This runbook governs migration `20260709000016_harden_auth_identity_ownership`.
It is a forward-only correction for the Auth UUID rebinding introduced by
`00007` and repeated by `00009`.

## Security invariant

- `public."User".id` is the immutable Supabase `auth.users.id` primary key.
- Email is synchronized profile data and a collision signal. It is never an
  ownership key.
- A new Auth UUID always starts with an empty application role array.
- A normalized email owned by another application UUID requires explicit
  recovery. No trigger, callback, or server action may move the old UUID.
- Buyer ownership, approved seller access, properties, documents, invites,
  notifications, reviewer attribution, and ADMIN role remain attached to the
  original UUID.

## Why this is a new migration

The shared Liber database has successful application records for
`20260526000007_harden_auth_user_sync`,
`20260707000009_add_avatar_variant`, and
`20260707000010_update_auth_user_avatar_trigger`. The deployed
`app_private.handle_new_user()` still contains:

```sql
ON CONFLICT (email) DO UPDATE
SET id = EXCLUDED.id
```

Never edit or replay those applied files as the fix. `00016` replaces the
deployed function and adds independent database constraints.

## Pre-deployment audit

Run read-only checks first. Return counts for review; do not export emails or
UUIDs into tickets or logs.

1. Confirm the applied history and installed function definition.
2. Count application Users without the same Auth UUID.
3. Count same-UUID normalized email mismatches.
4. Count normalized application email duplicates.
5. Compare `User.createdAt` and ownership-row timestamps with
   `auth.users.created_at` for temporal impossibilities.
6. Count verification-document UUID path prefixes that differ from `userId`.
7. Review user-target audit IDs that no longer have a current User.
8. Inspect retained Auth/Postgres logs, backups, and PITR evidence if available.

Any orphan, mismatch, duplicate, or temporal impossibility blocks migration.
Suspend the suspected identity, buyer visibility, and seller access pending a
human review. Never repair it with another UUID update.

## Migration behavior

`00016`:

1. Locks `auth.users` before `public."User"`, matching signup write order and
   draining in-flight uses of the old trigger.
2. Refuses to run when UUID, normalized email, or orphan preflight checks fail.
3. Adds a case-insensitive unique email index for collision detection.
4. Adds a `BEFORE UPDATE OF id` trigger that raises
   `LIBER_USER_ID_IMMUTABLE`.
5. Replaces Auth insert/update functions with UUID-only behavior. A conflicting
   email raises `LIBER_IDENTITY_RECOVERY_REQUIRED`.
6. Adds and validates `User.id -> auth.users.id` with `ON UPDATE RESTRICT` and
   `ON DELETE RESTRICT`.
7. Changes all eleven foreign keys that reference `User` to
   `ON UPDATE RESTRICT`, preserving their prior delete actions.
8. Revokes direct execution of Auth trigger functions from browser and service
   roles.

The Auth delete restriction is intentional. It prevents a dashboard or API
delete from recreating the stale application row that made email takeover
possible.

## Account lifecycle

Customer-facing hard deletion is not enabled in this release.

### Tombstone / deletion request

Until the dedicated suspension, Storage, outbox, and retention work is merged:

1. Suspend the application User and buyer profile.
2. Suspend seller access.
3. Keep the original User UUID and Auth identity in place.
4. Do not delete the Auth row from the Supabase dashboard or Admin API.
5. Record the request and retention decision outside customer-visible data.

The later security PR must ban/revoke sessions, make Storage policies require an
active application User, and define outbox cancellation before this becomes a
complete self-service tombstone operation.

### Completed purge

A purge is an explicit operator workflow after legal/retention review:

1. Ban/revoke Auth sessions.
2. Cancel or revalidate pending email jobs.
3. Export or retain evidence and audit records according to policy.
4. Delete or reassign owned Storage objects through the Storage API.
5. Delete the application identity and review every cascade.
6. Delete the Auth identity through the Auth Admin API.
7. Record the purge outcome.

Only after both identities and retained ownership are intentionally cleared may
the same email register again. Re-registration creates a new Auth UUID, empty
roles, no buyer profile, no seller approval, no property ownership, and no
document access. Restoration is a separately verified recovery operation, not
an email-triggered transfer.

## Deployment sequence

1. Keep public signup controlled during the migration window.
2. Run the pre-deployment audit and save aggregate results.
3. Verify the checked-in SHA-256 from the evidence document.
4. Apply pending migrations in order. Do not skip or rewrite an applied file.
5. Validate the Auth FK and all eleven `User` child FK actions in `pg_constraint`.
6. Verify the installed function no longer contains `id = EXCLUDED.id`.
7. Verify anon, authenticated, and service roles cannot execute the trigger
   functions directly.
8. Run the guarded identity migration test with disposable branch credentials.
9. Test signup, callback, login, buyer ownership, seller access, and admin denial
   in staging.
10. Reopen signup only after the checks pass.

## Guarded database test

Use only a sentinel-marked disposable database:

```sql
CREATE TABLE public.identity_migration_test_sentinel (
  token text PRIMARY KEY,
  created_at timestamptz NOT NULL DEFAULT now()
);
REVOKE ALL ON public.identity_migration_test_sentinel
  FROM PUBLIC, anon, authenticated, service_role;
INSERT INTO public.identity_migration_test_sentinel(token)
VALUES ('<same 16+ character token used below>');
```

Create this table manually on the newly created disposable branch before
running the harness. The harness never creates its own proof of disposability.
It rejects both exact shared URLs and direct/pooler URLs that identify the same
Supabase project.

```text
IDENTITY_MIGRATION_TEST_DATABASE_URL=<disposable direct URL>
IDENTITY_MIGRATION_TEST_ALLOW_WRITES=true
IDENTITY_MIGRATION_TEST_SENTINEL=<16+ character token>
npm run db:test-identity
```

For an empty test branch, also set
`IDENTITY_MIGRATION_TEST_PREPARE_EMPTY=true`. The harness uses the same
test-only `00005` compatibility shim documented by the geography runbook; it
does not change checked-in or deployed history.

## Rollback

Do not restore the vulnerable `00007`/`00009` function, drop UUID immutability,
or change the Auth FK to cascade as an emergency rollback.

- If `00016` fails while applying, its transaction should roll back. Keep signup
  closed, review the preflight failure, and correct data explicitly.
- If application behavior fails after database deployment, roll back the
  application runtime while leaving database identity hardening installed. The
  older runtime is compatible with an Auth-created User row, although collision
  messaging will be less specific.
- If Auth deletion is operationally required, complete the purge workflow. Do
  not weaken the FK.
- Repair defects with a new forward migration and repeat the disposable proof.

The historical exact-fresh-chain `00005` ownership failure remains a separate
release gate. It must be resolved by the final migration/version strategy, not
by editing deployed history.
