# Section: Verification Documents and Badges

## Purpose

Owns buyer verification evidence, seller ownership evidence, private document storage, admin document review, and trust badge integrity.

## Main files

- `apps/web/app/buyer/badges/page.tsx`
- `apps/web/app/admin/documents/page.tsx`
- `apps/web/app/admin/badges/page.tsx`
- `apps/web/components/badge-pill.tsx`
- `apps/web/components/direct-upload-field.tsx` and `apps/web/lib/direct-upload.ts`
- `apps/web/components/buyer-verification-documents.tsx`
- `apps/web/components/admin-badge-review-form.tsx`
- `apps/web/server/verification/buyer-documents.ts` and `badge-review.ts`
- `apps/web/server/contracts.ts`
- `apps/web/server/ownership-evidence.ts`
- `packages/db/prisma/schema.prisma`
- `packages/db/prisma/migrations/**`

## Invariants

- Verification documents are private and immutable evidence.
- Owners must not overwrite/delete verification document objects.
- Browser-callable upload actions must return document IDs/status, not raw private storage paths.
- Browser uploads use signed direct-to-Storage upload sessions followed by server finalization; Server Actions never carry file bodies.
- Cleanup atomically marks an expired eligible upload session `EXPIRED` before deleting its Storage object. Competing finalization is resolved by the session row lock; `FINALIZED` sessions cannot be deleted by cleanup or regressed by stale expiry/rejection. Failed Storage deletion leaves the session `EXPIRED` for retry.
- Buyer file selection waits for **Submit for review**. Retry reuses the authorized upload session and completed Storage upload; success requires server finalization. An expired session can be reset by choosing the file again. Seller uploads retain automatic submission on selection.
- Buyers see their latest 50 submitted verification documents with review status and rejection feedback. The server scopes this metadata to the current buyer and exposes no Storage paths or file URLs.
- Seller ownership evidence remains `DocumentType.OWNERSHIP`; use `OwnershipEvidenceKind` for government ID versus property address proof.
- Seller ownership verification can be marked approved only after both required ownership evidence kinds are approved.
- The explicitly enabled CEO preview has a separate, closed-cohort synthetic property test approval in `/admin/documents`. Its temporary invite-ready state is labeled **Test approval — ownership not verified** in property/invite/chat views, is bound to the current property identity, and permits invites only between the exact designated demo accounts. It does not write evidence, checklists, badges, or a `PropertyVerificationDecision`. Revocation restores the actual evidence state; genuine approval survives only if its current decision and both reviewed evidence records remain valid. See `server/synthetic-property-review.ts` for the cohort and audit actions.
- Sensitive badges require approved evidence where supported.
- Badge/evidence compatibility is centralized in `server/verification/evidence-rules.ts`; `OTHER` evidence never supports a financial badge.
- Cash buyer is derived from cash purchase type and current verified-funds evidence. Earnest-money, completed-transaction, and non-contingent badges are disabled.
- Pre-approval expires after 90 days.
- Regranting funds/identity without an explicit expiry clears a previous expiry. The admin badge form only offers compatible approved evidence; expected validation, evidence, and rate-limit failures remain inline.
- After an admin approves or rejects a document, `/admin/documents?reviewed=approved|rejected&subject=buyer|property` confirms the decision; an approved buyer document shows a **Grant badge** shortcut, since approval alone never grants a badge. Badge grants notify the buyer as `Badge added: <badge>`; rejected buyer documents notify `Verification document not accepted`.
- Buyer document submission times display in the market time zone (America/Los_Angeles).
- Badge grants/revokes and document reviews should be audited.
- Buyer-facing verification copy may explain that approved badges help sellers identify verified buyers, but it must not imply guaranteed invites, financing, or closing.

## Agent notes

Confidential uploads/finalization, admin document review/listing and signing
currently fail closed outside development/test or the explicitly configured
controlled preview, pending real malware scanning. The UI disables file
selection with a temporary-unavailability explanation. Vercel production cannot
enable this path through stale preview flags.

Admin pending documents are paged at 50 and have no eager signed URLs. The
admin-only document access route signs one pending file for 60 seconds and
audits access. Reviews conditionally transition only a still-pending document;
concurrent reviewers cannot overwrite the winning decision.

Upload creation is capped at 8 KiB; finalization is limited to 60/minute/account.
Signature inspection reads at most 16 bytes with a 5-second timeout and no
redirects. It validates file type only. Finalization locks and rechecks current
account status/role. Private response errors never expose provider diagnostics.

Do not make verification files public for convenience. Use short-lived signed URLs for admin previews.

Before public launch, complete the OPSWAT MetaDefender Cloud v4 paid private-processing integration described in `docs/engineering/UPLOAD_MALWARE_SCANNING.md`. Credentials are intentionally not present yet; do not fake scan success.

The enabled CEO demo can display an audit-backed `TEST_PRE_APPROVED` marker from Admin → Badges. Its label is **Test pre-approval — not verified**, with distinct information styling and automatic 24-hour expiry. It is not in supported evidence-backed badge types, is never granted through real badge controls, and cannot satisfy LOI financing or search verification requirements. Test and demo labels never trigger the public preview's verified indicator (`hasVerifiedPreviewBadge`). Revocation, expiry, malformed metadata, or disabling the existing demo gate hides it.
