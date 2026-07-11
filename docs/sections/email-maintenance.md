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
- Email jobs should retry safely and not duplicate invites.
- Outbox workers must claim jobs atomically with a lease so concurrent workers cannot send the same message.
- Maintenance endpoints require `CRON_SECRET` bearer auth.
- Local development may use mock/non-sending email.
- Production email and Auth workers run independently every minute, claim with leases/`SKIP LOCKED`, and publish heartbeats used by readiness checks.
- Invite email rows reference their invite. Workers revalidate current property identity and account/workflow eligibility immediately before sending; invalid work becomes `CANCELLED`.
- Upload cleanup marks a session `CLEANED` only after Storage deletion succeeds, so completed cleanup is not selected again.

## Agent notes

In-app notifications are the source of truth; email is delivery support.
