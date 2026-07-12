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
- When production scheduling is enabled, email and Auth workers run independently every minute, claim with leases/`SKIP LOCKED`, and publish heartbeats used by readiness checks.
- Vercel scheduling is temporarily disabled for the controlled Hobby-plan preview. The protected endpoints remain callable; restore a per-minute scheduler before relying on email, Auth-ban, expiry, or cleanup automation.
- Public launch is blocked until `/api/maintenance/outbox` runs every minute (`* * * * *`) and `/api/maintenance/expire` runs daily at 09:00 UTC (`0 9 * * *`), with `CRON_SECRET` authentication and worker-heartbeat verification.
- Invite email rows reference their invite. Workers revalidate current property identity and account/workflow eligibility immediately before sending; invalid work becomes `CANCELLED`.
- Upload cleanup marks a session `CLEANED` only after Storage deletion succeeds, so completed cleanup is not selected again.

## Agent notes

In-app notifications are the source of truth; email is delivery support.
