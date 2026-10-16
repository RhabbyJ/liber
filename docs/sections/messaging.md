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
- `packages/db/prisma/migrations/20260717023000_grant_authenticated_app_private_usage/migration.sql`
- `packages/db/prisma/current-baseline/migrations/20260717023000_grant_authenticated_app_private_usage/migration.sql`
- `packages/db/prisma/migrations/20260717033000_harden_app_private_function_defaults/migration.sql`
- `packages/db/prisma/current-baseline/migrations/20260717033000_harden_app_private_function_defaults/migration.sql`
- `scripts/realtime-branch-proof-subscriber.mjs`

`server/messaging/service.ts` is the public API that routes, pages and other
server modules import; it re-exports cohesive modules. `access.ts` holds the
session guards and the eligibility SQL every operation rechecks; `locks.ts` the
pair -> `Invite` -> `Conversation` -> sender lock helpers; `message-rows.ts` the
qualified Message projection; `conversation-reads.ts` inbox, thread and history
reads; `send.ts` sends and quotas; `read-state.ts` read markers;
`blocks-and-mutes.ts` mutes, permanent blocks and invite pair checks;
`reports.ts` reports and the admin queue; `tour-gate.ts` tour eligibility; and
`unread-email.ts` the content-free unread outbox jobs. New SQL belongs in the
module that owns its data, not back in the facade.

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
  Runtime Prisma advisory-lock queries project PostgreSQL's `void` result to a
  boolean scalar; returning `void` directly is not supported by the Pg adapter.
- The first successfully inserted buyer reply atomically changes the invite to
  `ACCEPTED`, records `respondedAt`, and activates the conversation. A duplicate
  or conflicting insert that writes no message cannot activate it. Accepted
  invites remain messageable. Declined, expired, withdrawn,
  identity-invalidated, ineligible, and blocked conversations reject sends but
  preserve authorized history.
- Message queries that reuse the qualified message projection must pass one
  composed `Prisma.sql` value to the Pg adapter. The insert also aliases the
  target table before `RETURNING`; direct tagged interpolation can otherwise
  return one anonymous column and roll back the send during audit creation.
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
  keyset limit so disabled counterparties cannot create skipped pages. A
  summary for either party includes only the counterparty limited name/code and allowlisted initials color preference; full names and UUIDs remain internal.
- Canonical conversation reads do not count retired seller follow-ups; send
  eligibility depends on the effective conversation state and participant role.
  Send-side quota enforcement remains transactional.
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
  identifier-only event. The application supplies only
  `{ conversationId, messageId, type }`; Supabase adds the wire event `id`.
  PostgreSQL and canonical server reads remain the source of truth. Failure of
  the optional Realtime send logs only SQLSTATE and cannot roll back the
  canonical message or moderation update; focus/reconnect and bounded
  polling recover missed hints. Healthy Realtime polls every 30–36 seconds;
  disconnected threads and inboxes every 5–6 seconds, with failure backoff to
  60 seconds. Requests never overlap and pause while hidden/offline. LOI polling
  runs separately every 30–36 seconds and on conversation lifecycle changes.
  Inbox polling also refreshes its canonical
  first page so ordering and unread counts do not remain stale.
- `anon`, `authenticated`, and `service_role` have no raw table privileges on
  conversations, participants, messages, blocks, or reports. All browser reads
  and writes use authenticated Liber server paths.
- Private-policy evaluation grants `authenticated` `USAGE`, but never `CREATE`,
  on `app_private` and no privileges on its relations. Its `EXECUTE` allowlist
  is exactly `can_join_conversation_topic(text)`, `can_join_loi_topic(text)`,
  `can_read_property_image(text, uuid)`, and
  `can_upload_session_object(text, text, uuid)`. `PUBLIC`, `anon`, and
  `service_role` have no schema access, all other functions remain closed, and
  the private schema is unavailable through the Data API. PostgreSQL's global
  and `app_private`-scoped default function privileges expose no non-owner
  `EXECUTE` grant, so future helpers are opt-in.
- The migration fails closed if another permissive public/authenticated
  Realtime SELECT policy or any browser Realtime INSERT policy could combine
  with the conversation policy. Existing policies require explicit review.
- Identity-invalidated threads use their stored property snapshot and never the
  property's new identity or current-version images.
- Unread email is content-free, debounced for 10 minutes, coalesced by unread
  batch, and revalidated/cancelled through the leased outbox. Enqueue through
  Prisma so the required client-generated `EmailOutbox.id` is always present,
  and select only that ID from the create operation.
- Participant report creation has one narrow POST route. Admin queue reads and
  resolutions stay in authenticated server pages/actions; there is no parallel
  public admin-report API surface.
- Production is feature-flagged and cohort-scoped. Retention deletion remains
  disabled until counsel publishes the rule. A production cohort containing
  `*` is invalid and must fail closed; wildcard cohorts are development/test
  convenience, or an explicitly named Vercel Preview, only. Vercel production
  refuses wildcard cohorts even with stale CEO-preview flags.

- Presentation (October 14, 2026 messenger redesign): `/messages` and `/messages/[id]` share a desktop-messenger shell (`app/messages/chat.css`). The inbox list stays on the left (380px, 320px below 1100px) beside either a placeholder or the open thread; phones show one pane at a time with a back chevron. The thread page also loads the first inbox page (failure leaves an empty sidebar, never a broken thread) and passes the authorized inbox avatar variant to the header. The thread has an avatar header, a pinned listing bar (cover photo, title, location) with the LOI strip and tour bar under it, grouped bubbles (incoming white, outgoing soft green with ink text, tail on the last bubble of a five-minute group, time inside the bubble), the invite as a shared-listing card, centered system lines, and a pill composer whose `+` opens the quick-reply tray (shown inline when quick replies are the only way to reply). Details is a right drawer (a third column at 1280px and up). The site footer is hidden on all messages pages. Data loading, polling, Realtime and actions are unchanged.

## Agent notes

The responsive messenger uses day separators (Today, Yesterday, then "Mon, Oct 13")
and grouped incoming/outgoing bubbles. The
single check indicates an acknowledged send only, never read/presence. Details
contains property context, LOI status, mute/block controls, and the full safety
notice; the composer keeps a brief property-only reminder visible. Inbox search
and All/Unread/Active filters operate on loaded authorized summaries, with a
load-more explanation when older pages exist. Scoped presentation lives in
`app/messages/chat.css` (layout, bubbles, composer) and `app/messages/messages.css`
(tour, dialogs, reports) and must preserve canonical recovery, draft retention,
moderation invalidation, and history pagination. Thread regions use explicit grid
rows so a hidden alert region never moves the composer into the stretch row.

The composer textarea is disabled while a free-text send is in flight, which
drops its focus. When that send succeeds or fails, `restoreComposerFocus`
returns focus to the textarea unless the user focused another enabled control
meanwhile; quick-reply sends leave focus alone. Browsers such as iOS Safari may
still need a tap to reopen the on-screen keyboard after programmatic focus.

The eligible Start LOI / Open LOI action is always visible as a slim strip pinned
under the listing bar, outside collapsed Details.
Its dedicated presentation lives in `components/messaging/chat-loi-action.*`.
It preserves the existing sidecar eligibility and routes into the same
non-binding workspace; it never submits terms directly from chat.

Buyer invite cards call `server/buyer/invite-response.ts` through the authenticated
server action. The owned invite determines the conversation; client conversation
IDs cannot redirect a reply. Question/tour responses rely on the messaging
transaction for first-reply acceptance. Questions are normalized and limited to
500 characters. Decline remains independent of messaging availability. LOI
availability is checked before acceptance; creation failures are explicit and
accepted invites can retry. The card preserves question text on expected errors.

Do not turn this section into general chat, contact discovery, offer workflow,
or a direct Supabase table-writing path. Live Supabase Realtime/RLS and
two-connection block/send evidence are release gates, not assumptions.

The cohort-gated LOI workspace may be linked from an accepted conversation, but
LOI drafts, financial terms, revisions, and decisions never live in message
bodies and free text cannot mutate negotiation state. Chat and LOI retain
separate routes, models, authorization, events, Realtime topics, and retention
rules. The optional sidecar derives deadline expiry and current eligibility
with the same effective-status rule as the workspace; it must not expose a stale
stored “waiting” status.

Successful send responses require an own-message kind, non-empty canonical
body, and valid timestamp before the draft is cleared. They are merged
immediately while overlapping canonical refreshes are coalesced through one
trailing refresh. The LOI card is an optional fail-closed sidecar loaded from
`GET /api/conversations/:conversationId/loi` on its own timeout; neither the
server page nor canonical conversation request awaits it. The sidecar exposes
only allowlisted link/status fields, skips LOI-table access for disabled or
invalid configuration, and cannot make authorized messaging unavailable.

## Tour scheduling (September 2026 meeting)

An accepted, active conversation has one persisted `TourSchedule`. Either
participant can propose a UTC time with an IANA display timezone and a 30, 60,
90 or 120 minute duration. Only the other participant can confirm it. Either
participant may cancel a future tour or propose a replacement; a replacement
always needs fresh confirmation. Proposals must be 15 minutes to 180 days ahead.
Tour state uses revision comparison and a client action ID for safe retries.
Schedule mutations use the same pair -> invite -> conversation lock order and
current eligibility checks as messages, including blocks, role loss, property
identity changes, and the exact enabled cohort. Read-only conversations retain
authorized tour history and cannot schedule or receive reminders.

`server/messaging/tours.ts` owns the lifecycle, content-free outbox jobs and
audits. Dispatch rechecks eligibility, the schedule revision and the worker's
outbox lease in a short transaction under the pair -> invite -> conversation
locks, commits, and only then calls the provider with the job's idempotency
key, so no lock or pooled connection is held across HTTP. A reschedule, cancel
or block that commits before that decision suppresses the email; one that
commits after it cannot recall it. Provider failures leave the job to the
outbox retry with the same key. `components/messaging/tour-scheduler.tsx` is an independent chat sidecar;
its request timeout or failure cannot prevent ordinary chat. System messages
record proposals, confirmation and cancellation, so the inbox also shows tour
updates when email is unavailable. The UI shows a follow-up prompt after the
confirmed end time, without asserting that the tour actually happened.

Migration `20260927201152_add_tour_scheduling` is additive and must precede the
application deployment, including the email worker. It exists byte-identically
in the historical and supported-baseline roots. `TourSchedule` has RLS enabled,
no browser or service-role grants, and participant-bound foreign keys. Apply it
only through the documented migration path after disposable upgrade/fresh proof.

`node scripts/test-tour-database.mjs deploy` verifies the marked target's current
pre-tour migration checksums, applies the forward migration with `prisma migrate
deploy` using the target's historical or supported-baseline lineage, and runs
the real PostgreSQL service suite. `behavior` reruns behavior without deploying.
The harness never resets a database or creates its sentinel. Required variables:
`TOUR_DATABASE_TEST_URL`, `TOUR_DATABASE_TEST_SENTINEL` (16+ characters),
`TOUR_DATABASE_TEST_ALLOW_WRITES=true`, plus `DIRECT_URL` and `DATABASE_URL` as
shared-target deny URLs. Provision a separate current disposable database first,
then create `public.tour_database_test_sentinel(token text primary key)` and
insert the chosen token there. The harness rejects the known production project,
matching shared hosts/project references, missing sentinels and schema drift.
Proof includes real lifecycle writes, participant FKs, RLS/role denial,
content-free outbox checks, concurrent confirm/cancel and cancellation-before-
dispatch races. Session identity and external email are controlled test seams;
all database behavior is real. Fixture data remains only on the disposable
target; retire the target after evidence review.

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
join. Run `scripts/realtime-branch-proof-subscriber.mjs` on an isolated
disposable Supabase branch with two real Auth accounts. Both conversation
participants must subscribe and receive the same identifier-only wire payload,
including the Supabase-generated `id`; an unrelated topic and an anonymous join
must fail. Companion requests with both authenticated sessions must show that
each participant is denied raw Data API reads and that the `app_private` profile
remains unexposed. Run the two-connection database test and live Realtime test
with the production cohort still disabled; never put staging credentials or
tokens in logs.

The 2026-07-17 disposable-branch run completed that two-account Realtime and
Data API regression and persisted the buyer/seller messaging lifecycle through
application-equivalent SQL. It did not exercise the authenticated Next.js HTTP
or browser journey. The exact buyer quick reply followed by a seller response
through those application boundaries remains required release evidence.

There is intentionally no destructive down migration. Keep the production
feature flag off until the still-open protected database, readiness, and
authenticated HTTP/browser gates are recorded. Before migrating any retained
environment that is not current, record a pre-migration backup. For a failed
uncommitted migration, let PostgreSQL roll back the transaction and investigate
before retrying. For a committed problem, turn the flag off, stop messaging API
and outbox writes, preserve message/report evidence, and deploy a reviewed
forward fix. Restore a pre-migration backup only as an incident-level last
resort while all writes are stopped and only after evidence created after the
backup has been preserved under the retention/legal process; otherwise a
restore would silently discard conversations and reports.

The schema and invite-trigger contract are not safe across an app/database
rolling overlap: the new app requires the new schema, while the migrated trigger
requires guided metadata that an old app does not write. Use a reviewed
maintenance cutover. Stop invite writes and drain old serverless instances,
apply the migration, deploy the exact approved SHA, run invite/message smoke
checks with messaging still disabled, and only then reopen traffic. The feature
flag alone does not protect legacy invite creation; do not use an ordinary
app-first or database-first rolling deployment for this migration.


## Limited name identity

Buyer, seller, and combined-role signup collect a full name (first and last required; up to 160 characters). Public identity is first name + last initial + a stable 12-character uppercase hexadecimal account code, for example Julie P. #7C4E2A91B6D0. The code is a truncated SHA-256 digest of the immutable random Auth UUID with a Liber namespace; it is not authentication proof or a database uniqueness constraint. Codes do not reveal the UUID and have no current-account collisions in the release read-only check. Both new and existing accounts use this limited identity in profiles, public previews, approved seller search, invites, and both sides of messaging. Legacy invalid/nameless accounts show Member plus code. Full surnames and contact information stay private except existing authorized LOI party disclosures. Raw account names and UUIDs remain server-side; only the limited label enters public DTOs. Signup shows an initials preview; the final code is assigned from the created account identity. DiceBear Initials (CC0) renders locally with @dicebear/core 10.7.0 and @dicebear/styles 10.6.0; no name is sent to an external avatar service. Existing avatarVariant tokens remain a backward-compatible color preference, with eight muted colors in the picker. Public labels/codes cannot be edited or shuffled by clients. No schema, role, authorization, RLS, document, or frozen LOI calculation changes.
