# Section: Email and Maintenance

## Purpose

Owns transactional email queueing, invite email delivery, expiry jobs, and maintenance endpoints.

## Main files

- `apps/web/server/email.ts`
- `apps/web/server/email-outbox.ts`
- `apps/web/server/auth-operations.ts`
- `apps/web/server/maintenance.ts`
- `apps/web/app/api/maintenance/expire/route.ts`
- `vercel.json`

## Invariants

- `email.ts` senders perform no authorization, so the module imports
  `server-only` and must never be a `"use server"` module (every export would
  become a callable Server Action endpoint) or be imported by client code.
  Only server workers such as `email-outbox.ts` and tour dispatch call them.
- Invite creation should not depend on inline email success.
- Messaging never emails message content. At most one unread-message job is
  queued per unread batch after 10 minutes and is cancelled on read, mute,
  block, suspension, or lifecycle closure.
- The worker revalidates recipient activity, membership, unread state, mute,
  block, buyer/seller role eligibility, approved seller access, and conversation
  eligibility immediately before unread-message send. The buyer role check
  joins the buyer account independently of which participant receives the email.
- LOI email contains no proposed terms. Delivery revalidates the accepted
  invite, active conversation, current revision, participants, seller access,
  property identity, block state, exact two-user cohort, and the immutable event
  encoded in the idempotency key. Event type/actor/status/recipient must match,
  so a claimed stale submission job cannot be sent after a terminal action on
  the same revision. Submission and counter notices also require an unexpired
  current response deadline, even before expiry maintenance runs; an already
  committed terminal-event notice remains deliverable after that old deadline.
  The key uses the immutable LOI event plus recipient.
- A cancelled unread job does not coalesce a later unread batch; a new message
  after read or unmute can queue fresh delivery.
- Email jobs should retry safely and not duplicate invites.
- Outbox workers must claim jobs atomically with a lease so concurrent workers cannot send the same message.
- Email and Auth workers claim one job immediately before processing it, leaving
  waiting jobs available to other workers. Before provider submission it renews
  only an owned, unexpired lease; final transitions also require the same worker,
  attempt number, and unexpired lease. Counters include only committed transitions.
  A bounded claim sweep marks expired final-attempt jobs `FAILED` and clears
  their leases (five attempts for email, eight for Auth bans). Provider
  idempotency and repeatable Auth bans handle uncertain in-flight outcomes.
- Maintenance endpoints require `CRON_SECRET` bearer auth.
- Local development may use mock/non-sending email.
- When production scheduling is enabled, email and Auth workers run independently every minute, claim with leases/`SKIP LOCKED`, and publish heartbeats used by readiness checks.
- The September 27 release restores Vercel schedules after verifying the team's active Pro plan. This checkout retains the bounded per-minute expiry contract below; verify fresh worker heartbeats after deployment before relying on automation.
- Public launch is blocked until outbox/Auth workers and bounded expiry jobs run every minute, with `CRON_SECRET` authentication, worker-heartbeat verification and backlog alerts. Expiry handles at most 25 records per category in a 15-second transaction; `expiration.hasMore` requests a subsequent invocation. Do not drain an unlimited backlog inside one request. Access checks enforce expiry even before maintenance persists the transition.
- Production email delivery also requires server-only `SITE_URL` to be the
  canonical HTTPS origin, with no credentials, path, query, or fragment. The
  protected readiness workflow validates the same value used by email links.
- Production `CRON_SECRET` must contain at least 32 characters. Maintenance
  routes compare its hash in constant time; readiness rejects shorter values.
- Invite email rows reference their invite. Workers revalidate current property identity and account/workflow eligibility immediately before sending; invalid work becomes `CANCELLED`.
- Outbox lease state uses `lockedAt`, `leaseUntil`, and `workerId`. Invite jobs
  use `inviteId`; unread-message jobs use `messageConversationId` plus
  `messageRecipientUserId`. The retired generic `recipientUserId` and UUID
  lease columns are incompatible and must not be restored.
- Upload cleanup marks a session `CLEANED` only after Storage deletion succeeds, so completed cleanup is not selected again.
- Expiry maintenance persists overdue LOIs as `EXPIRED`. Its eligibility sweep
  persists other active ineligible LOIs as `READ_ONLY`, deletes private drafts,
  appends an audit event, and cancels pending LOI email without changing already
  terminal outcomes.

## Agent notes

In-app notifications are the source of truth; email is delivery support.

`email-outbox.sql.test.ts` executes the worker's actual eligibility queries in
an isolated in-memory PostgreSQL fixture. It covers both unread recipients,
role loss, exact-deadline LOI cancellation, terminal-event delivery, slow-worker
overlap, stale lease fencing, and exhausted-lease cleanup. It does not replace
full-schema, RLS, provider, or multi-connection lock-contention release tests.

`auth-operations.sql.test.ts` executes real claim/update SQL against an isolated
PostgreSQL fixture with the external Auth API mocked. It covers successful bans,
slow-worker overlap, stale/expired claim fencing, exhausted eighth-attempt
recovery, and bounded retries; it shares the same release-test limitations.

Tour notifications use the leased `EmailOutbox` as `TOUR_UPDATE`, with explicit
schedule ID, revision, recipient and event columns, an empty payload and no
persisted email address. Proposal, confirmation and cancellation notify the
other participant. Confirmation schedules a reminder for both participants one
hour before the tour (ten minutes before when confirmation is later), plus a
follow-up two hours after the planned end. Past reminders are suppressed and
follow-ups expire seven days after the end. Reschedule/cancel cancels all older
pending or claimed jobs; idempotency includes schedule, revision, event and
recipient. Email includes only generic copy and the authenticated conversation
link, never the address, time, identities, message text or LOI terms.

Tour dispatch rechecks active membership, approved access, accepted invite,
property identity, cohort, mute/block state, event/revision and worker lease.
Synthetic property overrides do not email. The final provider send holds the
same pair -> invite -> conversation locks as tour changes for at most 30
seconds, allowing the provider's two bounded ten-second attempts. Provider
idempotency covers retries if an external send succeeds before a local commit
fails. A completed external send cannot be rolled back. Tour UI promises email
reminders only when the recipient is eligible, the provider is configured and
the worker heartbeat is less than five minutes old. Otherwise it states that
the tour is saved in Liber and email is unavailable.

Set server-only `LIBER_TOUR_REMINDERS_ENABLED=true` only after the recurring
per-minute outbox scheduler has been verified. This flag defaults off and gates
tour email dispatch and the UI availability claim, so a manual worker run alone
cannot make unavailable reminder automation appear enabled. Proposal, scheduling
and in-app tour updates work while it is off.

The existing protected outbox endpoint processes these jobs; no separate tour
scheduler is needed. The per-minute worker requirement still applies. A one-off
manual worker invocation does not establish continuing scheduled delivery.
