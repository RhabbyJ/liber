# Liber Documentation Map

Use this file to choose the correct source of truth before editing the repo.

## Source-of-truth priority

1. `AGENTS.md` — how agents must work.
2. `docs/product/V1_DEFINITION.md` — strict product scope and non-goals.
3. `docs/product/CEO_ROADMAP.md` — CEO vision and sequencing.
4. `docs/engineering/BACKEND_ARCHITECTURE.md` — backend architecture, security, and data-flow rules.
5. `docs/sections/*.md` — short code-area notes for implementation tasks.

If docs conflict, use the highest-priority doc above and update the stale lower-priority doc in the same change.

## Core docs

- `product/V1_DEFINITION.md` — exact v1 product boundary. Read before changing customer workflows.
- `product/CEO_ROADMAP.md` — CEO/product roadmap. Read before planning features.
- `product/production-decisions.md` — living LA launch-gate matrix, release order, environment blockers, and advisor follow-ups.
- `engineering/BACKEND_ARCHITECTURE.md` — backend, auth, Supabase, Prisma, storage, email, and security architecture.

- `engineering/GEOGRAPHY_CANONICAL_CUTOVER_RUNBOOK.md` — migration history, fresh/upgrade proof, reconciliation, and rollback for geography migrations 13-15.
- `engineering/GEOGRAPHY_CANONICAL_CUTOVER_EVIDENCE_2026-07-09.md` — disposable-branch counts, per-row quarantine review, database assertions, and the open fresh-install gate.
- `engineering/AUTH_IDENTITY_OWNERSHIP_RUNBOOK.md` — immutable Auth UUID rules, collision recovery, account lifecycle, deployment, and rollback for identity migration 16.
- `engineering/AUTH_IDENTITY_OWNERSHIP_EVIDENCE_2026-07-09.md` — shared read-only audit, disposable proof, and remaining identity deployment gates.
- `engineering/MIGRATION_VERSION_PLAN_2026-07-10.md` — reserved `00017`–`00022` order, schema-ahead warning, proof requirements, and rollback boundaries; reservations are not deployment authorization.
- `engineering/CTO_INTEGRATION_EVIDENCE_2026-07-10.md` — exact integrated code commit, local verification results, intentionally unrun protected gates, and release verdict.
- `engineering/SELLER_PROPERTY_INTEGRITY_PROPOSAL.md` — ownership-version and invite-validity proposal, rollout gates, disposable proof command, and rollback boundary.
- `engineering/AUTH_SECURITY_FOLLOWUP_FORWARD.sql` and
  `engineering/AUTH_SECURITY_FOLLOWUP_ROLLBACK.sql` — unnumbered CTO migration
  proposal for callback/session initialization, suspension, Storage, outbox,
  and generic shared limiting.
- `engineering/AUTH_SECURITY_FOLLOWUP_EVIDENCE_2026-07-09.md` — disposable
  catalog/concurrency/Storage results for the earlier proposal plus the current
  repair addendum and still-open database/staging gates.
- `engineering/SERVICE_AREA_BOUNDARIES.md` — canonical service-area, relationship, geometry, rendering, and LA import boundaries.
- `engineering/SELLER_SEARCH_SQL_EVIDENCE_2026-07-09.md` — SQL-native seller search contract, temporary 25K-row benchmark, cursor assertions, and measured plan.
- `engineering/SELLER_SEARCH_SQL_PROPOSAL.sql` — unnumbered CTO index proposal; not an applied migration.
- `engineering/UPLOAD_MALWARE_SCANNING.md` — selected OPSWAT private-processing scanner and credential-blocked public-launch gate.
- `engineering/DEPENDENCY_AUDIT_2026-07-11.md` — current dependency findings, reachability triage, and compatible-upgrade policy.
- `engineering/GEOGRAPHY_LA_COUNTY_RELEASE_RUNBOOK.md` — exact-hash LA County staging, activation, production reconciliation, and rollback.
- `engineering/GEOGRAPHY_LA_COUNTY_RELEASE_EVIDENCE_2026-07-12.md` — pinned source, transaction rehearsal, verification, and production reconciliation evidence for the active County release.
- `engineering/GEOGRAPHY_LA_SECURITY_HARDENING_EVIDENCE_2026-07-13.md` — applied raw-access/default-privilege hardening, prefix-index and migration-ledger proof, plus the remaining Supabase-owned launch blockers.

## Section micro-docs

- `sections/auth-access.md`
- `sections/buyer-profile-criteria.md`
- `sections/public-preview-privacy.md`
- `sections/seller-search.md`
- `sections/seller-properties-invites.md`
- `sections/verification-documents-badges.md`
- `sections/admin-ops.md`
- `sections/ui-design-system.md`
- `sections/api-routes-integrations.md`
- `sections/maps-geocoding.md`
- `sections/email-maintenance.md`
- `sections/database-prisma.md`
- `sections/testing-smoke.md`

These are intentionally short. They tell agents what a section is for, where the entry points are, and what not to break.

## Historical/reference material

These are not source of truth:

- root `Implementation.md`
- root `backend implementation plan.md`
- root `sprint1.md`
- `dobeforelaunch/*`
- `docs/archive/*`
- raw CEO transcripts and critique screenshots
- Figma/reference images
- `engineering/GEOGRAPHY_LA_COVERAGE_EVIDENCE_2026-07-10.md` — superseded v1 proposal evidence retained for audit history.

Keep historical files only when they help preserve context. Do not ask agents to read them by default.
