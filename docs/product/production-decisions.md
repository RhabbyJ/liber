# Production Decisions

Last reviewed: 2026-07-10

This is the living launch-gate matrix for moving Liber from a controlled CEO
demo/private preview to a public Los Angeles beta. It does not override
`V1_DEFINITION.md`, `CEO_ROADMAP.md`, or the backend architecture.

## Current release state

- Keep Liber in controlled pilot availability. Do not advertise LA-wide
  coverage yet.
- Geography PR1 and identity PR2 are draft, stacked changes. Neither migration
  set has been deployed to the shared Supabase project.
- The intended LA beta boundary is Los Angeles County. Activation waits for the
  reviewed Geography PR2 dataset and every security/scale gate below.

## Required release sequence

1. Prove the canonical geography cutover on both a supported fresh baseline and
   representative existing Liber data.
2. Prove immutable Auth UUID ownership and collision recovery in staging.
3. Land seller/public DTO privacy and property-evidence version integrity.
4. Land suspension/session/Storage enforcement and real CI/lint gates.
5. Import and review Los Angeles County coverage as inactive, versioned data.
6. Land atomic buyer saves, SQL seller search, pagination, shared rate limiting,
   concurrency-safe outbox leasing, and invite-expiry enforcement.
7. Run the full migration/security suite on staging with production-like data.
8. Activate the reviewed LA beta only after a human go/no-go review.

## LA launch blockers by owner

### Geography

- Resolve the historical `00005` fresh-install blocker without rewriting any
  migration already applied to a shared database.
- Deliver versioned Los Angeles County ZIP/ZCTA, city, and community geometry
  with provenance, license, checksums, reviewed relationships, and atomic
  market-bound derivation.
- Prove same-named places across markets and rapid A-to-B map navigation without
  stale suggestions or polygons.

### Auth, suspension, and Storage

- The unnumbered Auth/security follow-up proposal implements verified-identity,
  application-form role initialization, canonical login collision recovery,
  atomic application suspension/session revocation, Auth ban confirmation,
  ACTIVE-user Storage policies, recipient-bound leased outbox delivery, and
  bounded shared Auth throttling. It remains undeployed pending CTO migration
  numbering and review.
- Earlier disposable-branch proof passed the exact normalized-email catalog
  check, simultaneous case-variant registration, session revocation, and direct
  suspended-user Storage denial. The repaired lease/limiter proposal has changed
  since that proof and must be reapplied to a fresh disposable target; historical
  evidence does not close the current gate.
- The direct two-connection harness and full Admin API deletion/re-registration
  script remain launch gates until branch-specific database and service-role
  credentials are available. Parent/shared credentials must never be reused.
- Keep customer hard deletion disabled. Recovery, tombstone, purge, email
  reuse, Storage cleanup, retention, audit, and outbox behavior are operator
  workflows in `AUTH_IDENTITY_OWNERSHIP_RUNBOOK.md`, not self-service UI.

### Public and seller data contracts

- Build public-safe and seller-safe data with narrow Prisma `select`
  projections. Do not sanitize a broad internal buyer object after loading it.
- Exclude Auth UUIDs, internal criteria/service-area IDs, raw coordinates,
  private paths, and inactive badges from serialized responses.
- Require an active user and explicit preview-safe eligibility; calculate
  approximate public pins on the server and snapshot serialized responses.

### Buyer ownership and atomicity

- Save profile, canonical service-area selection, activation, and criteria in
  one transaction.
- Enforce exactly one criteria row per buyer unless the product definition is
  explicitly changed to support alternatives.
- Test rollback, concurrent saves, exact UUID ownership, and geography
  deactivation.
- The `codex/buyer-profile-atomicity` branch proposes these application and
  database paths. Focused local tests do not prove database serialization. Its
  exact constraint/trigger SQL remains unnumbered pending CTO assignment; this
  gate remains open until the real publication service passes the disposable
  two-connection and rollback harness on the integrated schema.

### Seller search, properties, and invites

- Move filtering/sorting into SQL with stable cursor pagination; remove the
  silent 100-buyer cap and post-cap JavaScript filtering.
- Bind ownership approval to a property identity/version. Ownership-relevant
  edits must increment the version and return the property to `PENDING` while
  preserving old evidence for audit only.
- Reject expired invites at read and use time, not only in maintenance.

### Release infrastructure

- Install a real ESLint configuration and execute it in CI.
- Add exact fresh/upgrade migrations, typecheck, tests, production build,
  RLS/Storage security tests, readiness validation, and realistic seller-search
  query plans to CI/release gates.
- Replace in-memory limits for auth, search, profile views, uploads, invites,
  geocoding, and enrichment with a shared limiter.
- The Auth/login/signup/resend/recovery portion has a Supabase-backed proposal;
  search/profile/upload/invite/geocode/enrichment limits remain separate gates.
- Lease-based outbox code and SQL exist in the unnumbered proposal, including
  expired-lease recovery and provider idempotency. Migration numbering, a fresh
  database run, multi-worker database proof, and the full staging lifecycle
  harness remain open launch gates.

### UI/UX

- Run a fresh desktop/mobile audit after DTOs, pagination, and geography APIs
  stabilize. Do not execute the dated 2026-07-03 research plan as a current bug
  list without re-verifying each item.
- Cover loading, empty, unavailable, recovery, keyboard, hydration-disabled,
  and mobile navigation states. UI work must not redefine authorization or data
  contracts.

## Environment and advisor decisions

- Configure `CRON_SECRET` before scheduled maintenance is enabled.
- Configure `RESEND_API_KEY` and `RESEND_FROM_EMAIL` before relying on invite
  email delivery.
- Enable Supabase Auth leaked-password protection before public launch.
- Decide whether to move PostGIS out of `public` or accept and document the
  remaining `spatial_ref_sys`/PostGIS advisor findings.
- Keep app tables deny-by-default through RLS until direct browser/Data API
  access is intentionally designed with explicit policies.
- Re-run Supabase security/performance advisors and realistic `EXPLAIN` plans
  after the final schema and seller-search query land.
- Remove clearly marked demo buyer data before true public launch.

Low-traffic unused-index findings are not sufficient reason to drop ownership,
search, or foreign-key indexes. Decide indexes from final query plans and
representative volume.
