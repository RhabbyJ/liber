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

Applied migration `20260711071555_complete_architecture_boundaries` and the
current server operations implement the workflow below. They do not enable
customer self-service deletion.

### Authoritative initialization

1. The Auth insert trigger creates the UUID/email row with empty roles and a
   blank private name. It does not trust signup metadata as authorization.
2. After Auth returns the newly created UUID, the signup action locks that exact
   application identity and initializes only BUYER/SELLER from its validated
   server-side form before redirecting to email verification. The account
   remains inaccessible until Supabase issues a verified session.
3. A verified email callback resolves the canonical UUID/email pair without
   accepting requested roles; it never reads `user_metadata.role` and routes
   from the roles already persisted in `public."User"`.
4. Password login resolves the canonical identity but never initializes roles.
5. `public."User".name` is authoritative thereafter. Signup initialization may
   set the private name, but it never treats Auth metadata as authority.
   The Auth update trigger
   fires only for a changed email and never copies `raw_user_meta_data`.

### Collision recovery

An identity collision never changes a UUID or ownership row.

1. Rate-limit the recovery signal by shared IP and normalized-email budgets.
2. Record `account_recovery_started` against the original application UUID.
3. Verify control of the original Auth identity and support evidence outside
   user-editable metadata. Never ask for passwords or recovery tokens.
4. If the original Auth identity is recoverable, restore access to that UUID;
   do not create, merge, or transfer a second application identity.
5. Record `account_recovery_denied` with a non-sensitive reason when denied.
6. Record `account_recovery_completed` only after the original UUID can log in
   and the canonical resolver succeeds.

### Audited tombstone

The ADMIN-only suspension action commits one application transaction that:

1. sets User, SellerAccess, and BuyerProfile to SUSPENDED,
2. archives the seller's properties and withdraws active invites,
3. creates an idempotent `BAN_USER` AuthOperation,
4. and writes the `suspend_user` audit event.

The maintenance worker leases the AuthOperation and calls
`auth.admin.updateUserById` with a 100-year `ban_duration`. A failed Auth call
is retryable and never rolls back the safer application suspension. Existing
access JWTs can remain cryptographically valid until expiry, so application
session checks and authenticated Storage policies independently require an
ACTIVE User.

Keep the original User UUID and Auth identity in place after tombstone. Do not
delete the Auth row from the dashboard or Admin API.

### Pending outbox behavior

- Invite jobs bind to `inviteId`; message jobs bind to both conversation and
  recipient UUID. Delivery resolves the current authorized recipient and email
  instead of trusting the queued `to` value.
- `claimEmailJobs` claims bounded work with one `FOR UPDATE SKIP LOCKED` update.
  Each claim receives an expiring worker lease, and completion or failure must
  still match that worker.
- Suspension cancels unsafe queued work through the current database and server
  checks. Workers re-check active identity and invite/conversation eligibility
  after claiming. Never retarget old work to a new UUID after email reuse.
- A message already accepted by the provider cannot be recalled. Record its
  provider status in retention review and do not describe it as cancelled.

### Completed purge and email reuse

No production purge command exists. Until retention, Storage cleanup, audit
preservation, and Auth deletion are approved and implemented as one guarded
workflow, keep the suspended UUID and forbid email reuse. Do not assemble a
manual purge from historical proposal SQL.

## Deployment sequence

1. Keep public signup controlled during the migration window.
2. Run the pre-deployment audit and save aggregate results.
3. Verify the checked-in SHA-256 from the evidence document.
4. Apply pending migrations in order. Do not skip or rewrite an applied file.
5. Validate the Auth FK and all eleven `User` child FK actions in `pg_constraint`.
6. Verify the installed function no longer contains `id = EXCLUDED.id`.
7. Verify anon, authenticated, and service roles cannot execute the trigger
   functions directly.
8. Run the current architecture database E2E with disposable branch credentials.
9. Test signup, callback, login, buyer ownership, seller access, and admin denial
   in staging.
10. Reopen signup only after the checks pass.

## Guarded current-schema test

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

Create this table manually on the disposable branch before running the current
architecture and Auth/Storage harnesses. They never create their own proof of
disposability and reject shared database targets.

```text
SERVICE_AREA_E2E_DATABASE_URL=<disposable direct URL>
SERVICE_AREA_E2E_ALLOW_WRITES=true
AUTH_SECURITY_STAGING_SENTINEL=<16+ character token>
npm run test -w @liber/web -- server/architecture-db.e2e.test.ts
```

For full Auth Admin/Storage lifecycle proof:

```text
AUTH_SECURITY_STAGING_DATABASE_URL=<disposable direct URL>
AUTH_SECURITY_STAGING_SUPABASE_URL=<same disposable API URL>
AUTH_SECURITY_STAGING_PUBLISHABLE_KEY=<branch publishable key>
AUTH_SECURITY_STAGING_SERVICE_ROLE_KEY=<branch service-role key>
AUTH_SECURITY_STAGING_ALLOW_WRITES=true
AUTH_SECURITY_STAGING_SENTINEL=<matching 16+ character token>
npm run db:test-auth-security:staging
```

The staging harness also checks that authenticated admins cannot read private
documents directly, ACTIVE owners can write property images, and the same
pre-suspension JWT cannot upload, update, or delete them afterwards. The
historical `profile-photos` bucket remains unused with no owner-write policies;
avatars are generated in-app.
Never reuse parent/shared keys or a parent database password for this proof.

## Rollback

Do not restore the vulnerable `00007`/`00009` function, drop UUID immutability,
or change the Auth FK to cascade as an emergency rollback.

- `00016` contains explicit `BEGIN`/`COMMIT`. If any statement fails, the
  migration transaction rolls back. Keep signup closed, issue `ROLLBACK` if an
  operator client remains in an aborted transaction, review the preflight
  failure, and correct data explicitly.
- If application behavior fails after database deployment, roll back the
  application runtime while leaving database identity hardening installed. The
  older runtime is compatible with an Auth-created User row, although collision
  messaging will be less specific.
- If Auth deletion is operationally required, complete the purge workflow. Do
  not weaken the FK.
- Repair defects with a new forward migration and repeat the disposable proof.

Do not run rollback SQL copied from retired proposals. Repair defects with a
new reviewed forward migration while keeping Auth UUID immutability, active-user
Storage checks, and lease-aware outbox processing installed.
