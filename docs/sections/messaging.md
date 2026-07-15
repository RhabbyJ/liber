# Section: Guided Messaging

## Purpose

Owns invite-scoped conversations, guided templates, plain-text messages,
read/mute state, permanent V1 blocking, message reports, private Realtime hints,
and report-driven admin moderation.

## Main files

- `apps/web/app/messages/**`
- `apps/web/app/api/conversations/**`
- `apps/web/app/api/messages/**`
- `apps/web/components/messaging/**`
- `apps/web/server/messaging/**`
- `apps/web/app/admin/reports/page.tsx`
- `packages/validators/src/index.ts`
- `packages/db/prisma/schema.prisma`

## Invariants

- One valid invite creates exactly one conversation, one seller participant,
  one buyer participant, and one immutable initial invite message. The database
  trigger is authoritative; invite creation verifies the complete canonical
  shape and fails the transaction closed if the trigger output has drifted.
  Post-migration inserts must begin in `SENT` with an allowlisted v1 guided-key
  and version; the application remains responsible for composing the canonical
  template body plus optional note.
- Participants come only from the authoritative invite. Client roles and user
  IDs never create membership.
- Every operation rechecks an active server session and participant membership.
  Sending also rechecks blocks, invite state/effective expiry, seller approval,
  buyer eligibility, and the invite's property identity version under the
  canonical pair -> `Invite` -> `Conversation` -> sender-quota lock order.
- The first successfully inserted buyer reply atomically changes the invite to
  `ACCEPTED`, records `respondedAt`, and activates the conversation. A duplicate
  or conflicting insert that writes no message cannot activate it. Accepted
  invites remain messageable. Declined, expired, withdrawn,
  identity-invalidated, ineligible, and blocked conversations reject sends but
  preserve authorized history.
- Guided copy is selected from the server's versioned catalog. Free text is
  normalized plain text with a 2,000-character maximum. Do not render HTML,
  Markdown, clickable links, or message bodies in logs/analytics/email.
- Messaging mutations accept JSON media types only and stream at most 16 KiB
  before schema validation. Inbox and admin-report lists use bounded keyset
  pages of at most 50 rows. Their server-signed cursors are tamper-evident;
  inbox cursors are viewer-bound and neither cursor serializes an Auth UUID.
  Production cursor signing fails closed unless `AUTH_RATE_LIMIT_PEPPER` is at
  least 32 characters.
- Inbox access and summaries are loaded with two set-based queries per page,
  not a per-conversation query loop. Cohort scope is applied in SQL before the
  keyset limit so disabled counterparties cannot create skipped pages.
- Message bodies are immutable. Ordinary redaction changes display state while
  report evidence remains restricted and every admin content access is audited.
  The same removal notice replaces a redacted opening in invite lists. A
  conversation moderation revision makes polling discard older browser-cached
  pages on a moderation change; users can then reload canonical older pages.
  In-flight older-page responses are aborted and may merge only while their
  starting moderation revision still matches. Inbox pages also carry an opaque
  viewer-wide moderation revision, so a redaction outside the first page drops
  every loaded preview and reloads the canonical first page.
- Block and send share the canonical pair -> `Invite` -> `Conversation` order.
  Blocking is permanent in V1, closes both directions, prevents reinvitation,
  and never discloses the blocker to the other participant, including through
  buyer-profile error shapes.
- Realtime uses an exact private `conversation:<uuid>` topic and an
  identifier-only event. PostgreSQL and canonical server reads remain the
  source of truth. Failure of the optional Realtime send logs only SQLSTATE and
  cannot roll back the canonical message or moderation update; focus/reconnect
  and five-second polling recover missed hints. Inbox polling also refreshes its
  canonical first page so ordering and unread counts do not remain stale.
- `anon`, `authenticated`, and `service_role` have no raw table privileges on
  conversations, participants, messages, blocks, or reports. All browser reads
  and writes use authenticated Liber server paths.
- The migration fails closed if another permissive public/authenticated
  Realtime SELECT policy or any browser Realtime INSERT policy could combine
  with the conversation policy. Existing policies require explicit review.
- Identity-invalidated threads use their stored property snapshot and never the
  property's new identity or current-version images.
- Unread email is content-free, debounced for 10 minutes, coalesced by unread
  batch, and revalidated/cancelled through the leased outbox.
- Participant report creation has one narrow POST route. Admin queue reads and
  resolutions stay in authenticated server pages/actions; there is no parallel
  public admin-report API surface.
- Production is feature-flagged and cohort-scoped. Retention deletion remains
  disabled until counsel publishes the rule. A production cohort containing
  `*` is invalid and must fail closed; wildcard cohorts are development/test
  convenience only.

## Agent notes

Do not turn this section into general chat, contact discovery, offer workflow,
or a direct Supabase table-writing path. Live Supabase Realtime/RLS and
two-connection block/send evidence are release gates, not assumptions.

## Migration release and recovery

Run `npm run test:messaging-migration` on every change. Before release, run
`npm run db:test-messaging:upgrade` against an immediate pre-messaging,
sentinel-marked disposable branch, then run
`npm run db:test-messaging:fresh` against a separate sentinel-marked target.
Both database commands require `MESSAGING_MIGRATION_TEST_DATABASE_URL`, a
16-or-more-character `MESSAGING_MIGRATION_TEST_SENTINEL`, and their explicit
write/reset opt-in. They also require both shared-target deny URLs and reject
the configured `DIRECT_URL`/`DATABASE_URL` and
matching Supabase project refs. The upgrade proof backfills representative
sent, accepted-expired, and declined invites, verifies exact membership and
initial messages, then rolls the whole DDL/data rehearsal back. The fresh proof
resets its disposable target, restores the sentinel after success, and uses
separate database connections to prove concurrent invite retry and block-before-
send ordering. It also exercises UUID idempotency, lifecycle rejection,
first-reply acceptance, permanent blocks, report evidence, content-free outbox
constraints, raw-role privilege denial, and the SQL Realtime topic helper.
Role-loss closures acquire one global conversation-id-ordered lock set so
dual-role users cannot create reciprocal lock-order deadlocks.

The SQL topic-helper assertion does not substitute for a real private-channel
join. A staging-only release gate must use participant and outsider Supabase
JWTs against live Realtime, verify identifier-only payloads, and prove reconnect
refetch. Run the two-connection database test and live Realtime test with the
production cohort still disabled; never put staging credentials in logs.

There is intentionally no destructive down migration. Keep the production
feature flag off until both proofs, readiness, and a pre-migration backup are
recorded. For a failed uncommitted migration, let PostgreSQL roll back the
transaction and investigate before retrying. For a committed problem, turn the
flag off, stop messaging API and outbox writes, preserve message/report evidence,
and deploy a reviewed forward fix. Restore the pre-migration backup only as an
incident-level last resort while all writes are stopped and only after evidence
created after the backup has been preserved under the retention/legal process;
otherwise a restore would silently discard conversations and reports.

The schema and invite-trigger contract are not safe across an app/database
rolling overlap: the new app requires the new schema, while the migrated trigger
requires guided metadata that an old app does not write. Use a reviewed
maintenance cutover. Stop invite writes and drain old serverless instances,
apply the migration, deploy the exact approved SHA, run invite/message smoke
checks with messaging still disabled, and only then reopen traffic. The feature
flag alone does not protect legacy invite creation; do not use an ordinary
app-first or database-first rolling deployment for this migration.
