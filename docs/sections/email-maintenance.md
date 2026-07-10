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
- EmailOutbox records identify the application recipient UUID. Suspension
  cancels retryable PENDING/FAILED jobs for that UUID, and workers re-check
  ACTIVE recipient status after claiming and use the current User email.
- Claims use one private SQL `SKIP LOCKED`/UPDATE path with an expiring UUID
  lease, attempt ceiling, token-checked completion, and a stable provider
  idempotency key. Expired leases are reclaimable. Unmatched legacy and
  pre-lease SENDING rows are quarantined. Provider-accepted jobs still require
  reconciliation; accepted messages cannot be recalled.
- The lease-aware runtime requires the EmailOutbox columns, constraints, and
  private claim function in the unnumbered proposal reserved for `00017`. Do
  not deploy it to an older database or roll back to the legacy reader-then-
  `SENDING` worker.

## Agent notes

In-app notifications are the source of truth; email is delivery support.
