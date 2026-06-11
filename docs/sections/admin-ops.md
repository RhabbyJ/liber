# Section: Admin Operations

## Purpose

Owns internal admin review and moderation tools: users, seller access, buyer profiles, documents, badges, invites, reports, and audit logs.

## Main files

- `apps/web/app/admin/**`
- `apps/web/server/contracts.ts`
- `apps/web/server/authz.ts`

## Invariants

- Admin pages are internal only.
- Admin role is server-controlled.
- Sensitive admin actions should write audit logs.
- Customer navigation must not expose admin analytics or admin-only surfaces.

## Agent notes

Admin UX can be utilitarian. Correctness, auditability, and privacy matter more than polish.
