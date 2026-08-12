# Section: Admin Operations

## Purpose

Owns internal admin review and moderation tools: users, seller access, buyer profiles, documents, badges, invites, reports, and audit logs.

## Main files

- `apps/web/app/admin/**`
- `apps/web/server/contracts.ts`
- `apps/web/server/authz.ts`
- `apps/web/server/messaging/service.ts`

## Invariants

- Admin pages are internal only.
- Admin role is server-controlled.
- Sensitive admin actions should write audit logs.
- Conversation content access is report-driven. Report reads, status changes,
  resolution, and redaction are audited; admins do not receive a general inbox
  or unrestricted conversation browser.
- Customer navigation must not expose admin analytics or admin-only surfaces.
- `/preview-tools` is not itself the admin review UI. In the explicitly enabled
  CEO preview, every active signed-in account is auto-granted `ADMIN` (and
  sellers are auto-approved for directory access) on session load so `/admin`
  and seller search stay reachable during demos. `/preview-tools` remains a
  status/fallback page for those same current-user-only elevations. It must not
  reimplement admin review queues or act on other users.

## Agent notes

Admin UX can be utilitarian. Correctness, auditability, and privacy matter more than polish.
