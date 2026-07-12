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

The unnumbered follow-up proposal in
`AUTH_SECURITY_FOLLOWUP_FORWARD.sql` defines the operator workflow below. It is
not deployed and does not enable customer self-service deletion.

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

`app_private.suspend_identity` locks actor and target in UUID order, requires an
ACTIVE ADMIN actor, and in one transaction:

1. sets User to SUSPENDED with `suspendedAt`,
2. sets SellerAccess and BuyerProfile to SUSPENDED,
3. cancels unsent EmailOutbox rows bound to `recipientUserId`,
4. deletes every `auth.sessions` row for the UUID,
5. and writes `suspend_user` with aggregate counts and `authBan=pending`.

The server then calls `auth.admin.updateUserById` with a 100-year
`ban_duration`. It writes `suspend_user_auth_ban_confirmed` or
`suspend_user_auth_ban_failed`. A failed Auth call is retryable but never rolls
back the safer application suspension. Existing access JWTs remain
cryptographically valid until expiry, so application session checks and every
authenticated Storage policy independently require an ACTIVE User.

Keep the original User UUID and Auth identity in place after tombstone. Do not
delete the Auth row from the dashboard or Admin API.

### Pending outbox behavior

- New jobs store `recipientUserId`; the proposal backfills unsent legacy jobs
  from the exact normalized-email owner. Every unmatched unsent row is cancelled
  with `UNMATCHED_LEGACY_RECIPIENT`. Pre-lease SENDING rows are quarantined for
  provider reconciliation instead of being guessed safe to resend.
- `app_private.claim_email_outbox` claims at most 100 jobs in one
  `FOR UPDATE SKIP LOCKED`/UPDATE statement. Each claim increments attempts and
  receives an expiring UUID lease. A crashed worker's expired lease can be
  reclaimed; completion and failure updates must still match that lease token.
- Suspension sets `cancelledAt`, clears retry time, and terminally marks every
  PENDING/FAILED job for the UUID. Workers exclude cancelled jobs and re-check
  ACTIVE recipient status after claiming, resolve the current application email,
  and send with a stable provider idempotency key. A SENDING job must reach
  SENT/FAILED or be reconciled with the provider before purge continues.
- Purge must confirm no uncancelled unsent row remains for the UUID or normalized
  email. Never retarget an old job to a new UUID after email reuse.
- A message already accepted by the provider cannot be recalled. Record its
  provider status in retention review and do not describe it as cancelled.

### Completed purge and email reuse

A purge is an explicit operator workflow after legal/retention review:

1. Record `account_purge_started` with original UUID, approving operator,
   retention decision, and case reference, without document URLs or secrets.
2. Re-run tombstone. Confirm User/SellerAccess are suspended, Auth ban is
   confirmed, `auth.sessions` is empty, and no uncancelled outbox job remains.
3. Inventory Storage by UUID/path ownership. Retain approved evidence according
   to policy, then delete purgeable objects through the Storage API. Never
   delete only `storage.objects` rows in SQL.
4. Resolve immutable evidence, audit, invite, notification, property, and
   outbox retention. Redact queued recipient/payload data where policy requires.
5. Delete the application User and review every cascade. The target UUID remains
   in string-valued audit targets even if actor foreign keys become null.
6. Delete the Auth user through the server-only Auth Admin API.
7. Record `account_purge_completed` with Storage cleanup, application deletion,
   Auth deletion, retained-record counts, and `emailReuseAllowed=true`.

Email reuse is forbidden before step 7. Afterwards, a case-variant registration
must create a new Auth UUID and User with blank name, empty roles, no buyer
profile, seller approval, property, document, or ADMIN inheritance. Restoration
is separately verified recovery, never an email-triggered transfer.

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

The follow-up harness also applies the unnumbered forward proposal and verifies
the exact normalized index, email-only update trigger, removal of Auth metadata
name synchronization, simultaneous case-variant registration, legacy outbox
quarantine, expired-lease crash recovery, and bounded limiter expiry/pruning.

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

For an empty test branch, also set
`IDENTITY_MIGRATION_TEST_PREPARE_EMPTY=true`. The harness uses the same
test-only `00005` compatibility shim documented by the geography runbook; it
does not change checked-in or deployed history.

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

`AUTH_SECURITY_FOLLOWUP_ROLLBACK.sql` is intentionally security-preserving.
Deploy a compatibility runtime that stops calling the suspension/shared-limiter
functions but retains the lease-aware outbox worker, then run the SQL. If no such
runtime is available, disable the entire maintenance endpoint. The legacy
reader-then-SENDING worker is incompatible with the lease constraints and must
never be re-enabled. The claim function, active leases, additive EmailOutbox
fields/constraints/indexes, cancellation evidence, Auth trigger hardening, and
ACTIVE-user Storage policies remain installed as forward-only boundaries.

The historical exact-fresh-chain `00005` ownership failure remains a separate
release gate. It must be resolved by the final migration/version strategy, not
by editing deployed history.
