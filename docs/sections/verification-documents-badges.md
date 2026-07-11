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
- Browser uploads use signed direct-to-Storage upload sessions followed by server finalization; Server Actions never carry file bodies.
- Seller ownership evidence remains `DocumentType.OWNERSHIP`; use `OwnershipEvidenceKind` for government ID versus property address proof.
- Seller ownership verification can be marked approved only after both required ownership evidence kinds are approved.
- Sensitive badges require approved evidence where supported.
- Badge/evidence compatibility is centralized in `server/verification/evidence-rules.ts`; `OTHER` evidence never supports a financial badge.
- Cash buyer is derived from cash purchase type and current verified-funds evidence. Earnest-money, completed-transaction, and non-contingent badges are disabled.
- Pre-approval expires after 90 days.
- Badge grants/revokes and document reviews should be audited.
- Buyer-facing verification copy may explain that approved badges help sellers identify verified buyers, but it must not imply guaranteed invites, financing, or closing.

## Agent notes

Do not make verification files public for convenience. Use short-lived signed URLs for admin previews.

Before public launch, complete the OPSWAT MetaDefender Cloud v4 paid private-processing integration described in `docs/engineering/UPLOAD_MALWARE_SCANNING.md`. Credentials are intentionally not present yet; do not fake scan success.
