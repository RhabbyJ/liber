# Section: Verification Documents and Badges

## Purpose

Owns buyer verification evidence, seller ownership evidence, private document storage, admin document review, and trust badge integrity.

## Main files

- `apps/web/app/buyer/badges/page.tsx`
- `apps/web/app/admin/documents/page.tsx`
- `apps/web/app/admin/badges/page.tsx`
- `apps/web/components/badge-pill.tsx`
- `apps/web/server/contracts.ts`
- `packages/db/prisma/schema.prisma`
- `packages/db/prisma/migrations/**`

## Invariants

- Verification documents are private and immutable evidence.
- Owners must not overwrite/delete verification document objects.
- Sensitive badges require approved evidence where supported.
- Pre-approval expires after 90 days.
- Badge grants/revokes and document reviews should be audited.

## Agent notes

Do not make verification files public for convenience. Use short-lived signed URLs for admin previews.
