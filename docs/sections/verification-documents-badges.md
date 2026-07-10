# Section: Verification Documents and Badges

## Purpose

Owns buyer verification evidence, seller ownership evidence, private document storage, admin document review, and trust badge integrity.

## Main files

- `apps/web/app/buyer/badges/page.tsx`
- `apps/web/app/admin/documents/page.tsx`
- `apps/web/app/admin/badges/page.tsx`
- `apps/web/components/badge-pill.tsx`
- `apps/web/server/contracts.ts`
- `apps/web/server/ownership-evidence.ts`
- `packages/db/prisma/schema.prisma`
- `packages/db/prisma/migrations/**`

## Invariants

- Verification documents are private and immutable evidence.
- Owners must not overwrite/delete verification document objects.
- Browser-callable upload actions must return document IDs/status, not raw private storage paths.
- Seller ownership evidence remains `DocumentType.OWNERSHIP`; use `OwnershipEvidenceKind` for government ID versus property address proof.
- Seller ownership verification can be marked approved only after both required ownership evidence kinds are approved.
- Ownership evidence carries the exact current `propertyOwnershipVersion` and owner UUID; generic, prior-version, or different-owner evidence cannot approve the property.
- Every legacy ownership decision is quarantined for current-version re-review with its prior state retained in the admin audit log; generic evidence additionally requires classification.
- A document review is one-winner: only a row still in `PENDING` may transition, so racing admins cannot overwrite each other's decision.
- Sensitive badges require approved evidence where supported.
- Pre-approval expires after 90 days.
- Badge grants/revokes and document reviews should be audited.
- Buyer-facing verification copy may explain that approved badges help sellers identify verified buyers, but it must not imply guaranteed invites, financing, or closing.

## Agent notes

Do not make verification files public for convenience. Use short-lived signed URLs for admin previews.
