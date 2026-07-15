# Production Decisions

Last reviewed: 2026-07-14

This is the living launch-gate matrix for moving Liber from a controlled CEO
demo/private preview to a public Los Angeles beta. It does not override
`V1_DEFINITION.md`, `CEO_ROADMAP.md`, or the backend architecture.

## Current release state

- Keep Liber in controlled preview availability; malware scanning and scheduled
  maintenance remain public-launch blockers.
- Guided Messaging V1 is approved for implementation as invite-scoped guided
  conversation only. Its production flag remains off outside a server-managed
  cohort until the messaging launch gates below are closed.
- Los Angeles County is the approved v1 geography boundary. The exact reviewed
  v2 release activates 88 incorporated cities and 304 approximate Census ZCTA
  service areas while preserving three reviewed neighborhoods.
- The guarded v2 stage and activation completed in production on 2026-07-12;
  the release and 2026-07-13 security hardening migrations are applied with all
  24 checked-in migrations accounted for, zero unresolved Prisma rows, and zero
  invalid active buyers.
- Canonical geography browser grants are closed, all four affected tables have
  RLS enabled, and the server-mediated search path remains operational. This
  hardening does not clear the remaining Supabase-owned PostGIS or Auth gates.
- LA County geography activation is a coverage decision, not authorization to
  describe the entire product as publicly launched.

## Architecture-boundary implementation status

Migration `20260711071555_complete_architecture_boundaries` and its application changes implement the local code boundary for narrow seller DTOs, atomic buyer publication, versioned property evidence/decisions, direct upload sessions, private property images, suspension/Auth operations, rolling-24-hour invite serialization, leased email delivery, evidence-compatible badges, shared Postgres rate limiting, real lint/CI, and dependency-based readiness checks.

Migration `20260711082500_close_property_identity_lifecycle` closes the remaining local identity boundary across seller attestation, property images, invites, invited-buyer access, delayed invite email, upload cleanup, and upload-session buyer ownership. The quality CI now supplies non-secret dummy Prisma URLs and Vercel installs from the lockfile with `npm ci`; the guarded `release-database-gate` remains mandatory before deployment.

The two architecture-boundary migrations were applied to the shared production
Supabase project on 2026-07-11. Post-migration checks confirmed the expected
schema head, private `property-images` storage, both required Storage policies,
the image-authorization and shared-rate-limit functions, RLS on all five new
operational tables, and no unresolved Prisma migration entry.

This production schema deployment is not a public-launch approval.
Fresh/upgrade/RLS/Storage/concurrency proof must still run against guarded
disposable and staging Supabase databases before controlled-pilot restrictions
are removed.

OPSWAT MetaDefender Cloud v4 paid private processing is the selected sensitive-document scanner. Integration is intentionally pending production API credentials and private-processing/vendor terms; see `docs/engineering/UPLOAD_MALWARE_SCANNING.md`. This remains a public-launch blocker and must never be replaced with a mock clean result.

Product-owner decision on 2026-07-11: do not add scanner API code or provisional scan-state behavior during this architecture-closure pass. Continue controlled-pilot debugging only; scanning must be completed before public launch.

The seller invite quota is 25 sends per seller in the preceding rolling 24 hours. Private property images are available only to an active property owner, active admin, or active buyer whose invite is `SENT`, `VIEWED`, or `ACCEPTED`; `SENT` and `VIEWED` access ends when the invite expires. Browser access uses a short-lived signed URL and never exposes the stored object path.

Guided Messaging V1 adds exactly one two-party conversation per invite,
immutable PostgreSQL messages, versioned guided copy, plain-text fallback,
read state, permanent V1 blocking, message reporting, and report-driven admin
moderation. Initial operating constants are one curated seller follow-up after
24 hours, 20 send attempts per user per minute, 120 successful messages per
conversation per hour, 500 successful messages per user per rolling 24 hours,
and a 10-minute content-free unread-email debounce. These beta controls do not
change or weaken the existing invite quota.

## Required release sequence

1. Prove the canonical geography cutover on both a supported fresh baseline and
   representative existing Liber data.
2. Prove immutable Auth UUID ownership and collision recovery in staging.
3. Land seller/public DTO privacy and property-evidence version integrity.
4. Land suspension/session/Storage enforcement and real CI/lint gates.
5. Import and review Los Angeles County coverage as inactive, versioned data. **Staged and activated in production for v2 on 2026-07-12.**
6. Land atomic buyer saves, SQL seller search, pagination, shared rate limiting,
   concurrency-safe outbox leasing, and invite-expiry enforcement.
7. Run the full migration/security suite on staging with production-like data.
8. Activate the reviewed LA County city/ZCTA allowlist through the exact-hash release command. **Applied and reconciled 2026-07-12.**
9. Rehearse Guided Messaging V1 on a guarded disposable database, prove its
   participant/RLS/block/send/backfill matrix, then enable only the reviewed
   staff/demo cohort.

## LA launch blockers by owner

### Geography

- Keep the v2 checksum ledger, legal-city source attribution, and activation
  snapshot with the release evidence.
- Preserve ZIP labeling as approximate Census ZCTA coverage; do not claim USPS
  or survey-grade boundaries.
- Do not add inferred ZIP-to-city rollups without a separately reviewed source.
- Preserve server-mediated access to canonical geography. Do not grant raw
  `anon` or `authenticated` table access to bypass the narrow APIs.

### Auth, suspension, and Storage

- Run the direct two-connection identity harness and real staging Auth flows for
  deletion, email reuse, ownership preservation, and ADMIN non-inheritance.
- Prove the queued Auth ban, seller-access suspension, and retry/recovery path
  against staging Auth.
- Prove the active-application-user Storage policies with owner, invited buyer,
  outsider, expired-invite, accepted-invite, and suspended-user connections.
- Keep customer hard deletion disabled until retention, Storage, outbox, and
  audited purge behavior is implemented.
- Guided Messaging V1 requires a maintenance/traffic-drain cutover because its
  schema and invite-trigger contract cannot overlap safely with the old app.
  Keep invite writes stopped from the first migration statement until the exact
  approved app SHA is deployed and smoke-tested; the feature flag is not a
  substitute for this cutover.

### Public and seller data contracts

- Snapshot the narrow public/seller projections in staging and prove they omit
  Auth UUIDs, internal criteria/service-area IDs, raw coordinates, private
  paths, and inactive badges.
- Prove active-user filtering and server-generated approximate pins with
  representative production-like records.

### Buyer ownership and atomicity

- Run the guarded database tests for rollback, concurrent saves, exact UUID
  ownership, the one-criteria invariant, and geography deactivation.

### Seller search, properties, and invites

- Run the seller-search plan threshold on production-like volume and verify
  live keyset pagination without the former silent cap.
- Prove property identity invalidation, structured current-version approval,
  rolling-24-hour quota serialization, and expired-invite rejection against a
  disposable then staging database.

### Guided messaging and moderation

- Confirm any credentials exposed in source packets or archives were rotated
  or revoked. CI scans tracked repository text (including force-tracked local
  environment files) and ZIP files present in the scanned workspace. A release
  packet is not covered by CI unless it is supplied to that workspace; record
  a separate approved scan for external or non-ZIP binary packets/archives.
- Obtain fair-housing counsel approval for every guided template and the
  moderation/enforcement policy before public use.
- Publish a counsel-approved retention, de-identification, legal-hold, and
  deletion rule. The 24-month idea remains a proposal and no automatic message
  deletion is authorized yet.
- Prove fresh and representative upgrade backfill, exactly two invite-derived
  participants, message-sender constraints, immutable evidence, keyset reads,
  idempotent sends, and block/send linearization on a guarded disposable
  database.
- Prove private `conversation:<uuid>` Realtime joins on Supabase with public
  channels disabled. Events may contain only conversation/message/type IDs;
  canonical reads must reject outsiders and suspended users even if a stale
  socket remains connected.
- Staff the report queue and audit report-content reads, status changes, and
  redactions. There is no unrestricted admin inbox.
- Keep `LIBER_MESSAGING_V1_ENABLED` disabled by default in production and use
  `LIBER_MESSAGING_V1_COHORT_USER_IDS` for the reviewed cohort. Both
  participants must be eligible before interactive messaging is exposed.

### Release infrastructure

- Run the checked-in quality CI and the guarded manual fresh/upgrade,
  RLS/Storage, identity, concurrency, and query-plan jobs with protected
  disposable-database secrets.
- Exercise shared rate-limit contention and leased outbox recovery with
  multiple workers, then confirm readiness against staging dependencies.

### UI/UX

- Run a fresh desktop/mobile audit after DTOs, pagination, and geography APIs
  stabilize. Do not execute the dated 2026-07-03 research plan as a current bug
  list without re-verifying each item.
- Cover loading, empty, unavailable, recovery, keyboard, hydration-disabled,
  and mobile navigation states. UI work must not redefine authorization or data
  contracts.

## Environment and advisor decisions

- Vercel cron schedules are temporarily disabled for the controlled Hobby-plan preview so deployments can proceed. Restore a per-minute outbox scheduler and the daily expiry scheduler before relying on automated email, Auth bans, invite expiry, or upload cleanup.
- Keep a unique `AUTH_RATE_LIMIT_PEPPER` of at least 32 characters in each deployed environment. Production and the `codex/ui-refresh` branch preview are configured separately; any additional preview branch must receive its own value before Auth can be exercised there.
- Configure `CRON_SECRET` before scheduled maintenance is enabled.
- Configure `RESEND_API_KEY` and `RESEND_FROM_EMAIL` before relying on invite
  email delivery.
- Unread-message email is also outbox-backed and content-free. Do not enable it
  until the per-minute worker schedule and cancel-on-read/block revalidation
  are proven.
- Enable Supabase Auth leaked-password protection before public launch. It
  remains disabled because this pass had neither an authenticated Dashboard
  session nor a supported Management API control for the setting.
- Use a Supabase-supported remediation for the `supabase_admin`-owned
  `public.spatial_ref_sys` table and the three `st_estimatedextent` overloads
  still executable by `anon` and `authenticated`. The PostGIS-in-`public`
  advisor finding also remains. Do not hot-move or take ownership of platform
  extension objects in an application migration.
- Keep app tables protected by server-mediated access. Current RLS-with-no-policy advisor findings are deny-by-default for direct Data API access; add explicit policies only if browser/Data API access is intentionally introduced.
- Re-run Supabase security and performance advisors before launch and after every schema migration.
- Re-run `EXPLAIN` on seller buyer-search queries against realistic data volume before public launch.
- Keep current buyer/search/property indexes until realistic traffic proves they are unnecessary; early unused-index advisor findings in a demo database are not enough to drop them.
- Remove clearly marked demo buyer data before true public launch.
- LA County coverage uses deterministic versioned data, not runtime provider
  lookups: one County outline, 88 city service areas, 304 approximate ZCTA
  service areas, and three existing reviewed neighborhoods. The 266 remaining
  statistical communities stay inactive.

### Public-launch blocker: restore scheduled maintenance

Before any public launch:

- Restore `/api/maintenance/outbox` on `* * * * *` (every minute).
- Restore `/api/maintenance/expire` on `0 9 * * *` (daily at 09:00 UTC).
- Use Vercel Pro or an external scheduler that supports the required frequency; do not reduce the outbox worker to a daily schedule.
- Confirm `CRON_SECRET` is configured, deploy, and verify successful worker heartbeats plus email, Auth-ban, invite-expiry, and upload-cleanup processing.

Low-traffic unused-index findings are not sufficient reason to drop ownership,
search, or foreign-key indexes. Decide indexes from final query plans and
representative volume.
