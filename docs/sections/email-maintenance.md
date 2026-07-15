# Section: Email and Maintenance

## Purpose

Owns transactional email queueing, invite email delivery, expiry jobs, and maintenance endpoints.

## Main files

- `apps/web/server/email.ts`
- `apps/web/server/email-outbox.ts`
- `apps/web/server/maintenance.ts`
- `apps/web/app/api/maintenance/expire/route.ts`
- `vercel.json`

## Invariants

- Invite creation should not depend on inline email success.
- Messaging never emails message content. At most one unread-message job is
  queued per unread batch after 10 minutes and is cancelled on read, mute,
  block, suspension, or lifecycle closure.
- The worker revalidates recipient activity, membership, unread state, mute,
  block, buyer/seller role eligibility, approved seller access, and conversation
  eligibility immediately before unread-message send.
- A cancelled unread job does not coalesce a later unread batch; a new message
  after read or unmute can queue fresh delivery.
- Email jobs should retry safely and not duplicate invites.
- Outbox workers must claim jobs atomically with a lease so concurrent workers cannot send the same message.
- Maintenance endpoints require `CRON_SECRET` bearer auth.
- Local development may use mock/non-sending email.
- When production scheduling is enabled, email and Auth workers run independently every minute, claim with leases/`SKIP LOCKED`, and publish heartbeats used by readiness checks.
- Vercel scheduling is temporarily disabled for the controlled Hobby-plan preview. The protected endpoints remain callable; restore a per-minute scheduler before relying on email, Auth-ban, expiry, or cleanup automation.
- Public launch is blocked until `/api/maintenance/outbox` runs every minute (`* * * * *`) and `/api/maintenance/expire` runs daily at 09:00 UTC (`0 9 * * *`), with `CRON_SECRET` authentication and worker-heartbeat verification.
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

## Agent notes

In-app notifications are the source of truth; email is delivery support.
