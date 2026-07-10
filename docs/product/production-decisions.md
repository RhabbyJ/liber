# Production Decisions

Last reviewed: 2026-07-10

This is the living launch-gate matrix for moving Liber from a controlled pilot
to a public Los Angeles beta. It does not override `V1_DEFINITION.md`,
`CEO_ROADMAP.md`, or the backend architecture.

## Current release state

- Keep Liber in controlled pilot availability. Do not advertise LA-wide
  coverage.
- The CTO integration branch contains the application-side security, ownership,
  search, DTO, rate-limit, and CI changes listed below. It is schema-ahead and
  is not deployable to the current shared database.
- A read-only check on 2026-07-10 found the shared Liber migration catalog
  through `00012`; `00013`–`00016` were absent. The proposals reserved for
  `00017`–`00022` are also unapplied.
- Los Angeles County is the intended LA beta boundary. The inactive coverage
  proposal remains isolated on `codex/geography-la-coverage` at `0ae12d7` and
  must not be merged, numbered, or activated until its listed defects and the
  canonical cutover gate are closed.
- Migration ordering, proof requirements, and rollback boundaries are in
  `docs/engineering/MIGRATION_VERSION_PLAN_2026-07-10.md`.

## Integrated application code

The following behavior is implemented on the CTO integration branch and has
local unit/static coverage. “Integrated” does not mean its dependent database
proposal has passed staging or is deployed.

- Public preview and approved-seller responses use narrow Prisma projections
  and dedicated DTOs. Auth UUIDs, raw buyer coordinates, internal criteria and
  service-area IDs, private document/storage data, and inactive badges are not
  serialized. Approximate public pins are server-derived.
- Public preview candidates require an ACTIVE application user, ACTIVE profile,
  one active selected area in an active market, one criteria row, and approved
  purchase/property values.
- Seller search filtering and all four sorts execute in SQL before stable
  keyset pagination. There is no fixed 100-buyer prefilter or JavaScript
  post-filter. Cursor pages remain market/filter/snapshot bound.
- Buyer publication saves profile, selected canonical area, criteria, derived
  location, and visibility in one transaction while locking and rechecking the
  ACTIVE immutable Auth UUID owner.
- Property writes and post-upload bindings lock and recheck the ACTIVE owner.
  Ownership-relevant edits use versioned evidence semantics, and failed
  post-upload binding performs best-effort Storage cleanup.
- Expired invites are rejected at read/use time. Property/evidence/invite
  database enforcement exists in an unnumbered proposal.
- Auth identity resolution no longer rebinds UUIDs by email, ignores
  user-editable metadata roles, treats collisions as recovery, and preserves
  explicit purge/re-registration semantics.
- Suspension runtime revokes Auth sessions, bans through the Admin API, and
  works with ACTIVE-user Storage policies. The obsolete `profile-photos` bucket
  remains unused with no owner-write policies; V1 avatars are generated in-app.
- Email outbox runtime uses recipient UUIDs, expiring leases, token-checked
  completion, retry ceilings, and provider idempotency keys.
- Auth, seller search/profile view, invites, uploads, geocoding, and property
  enrichment call one Supabase-backed atomic limiter. Production fails closed;
  only local development can use the bounded in-process fallback.
- Real ESLint, typecheck, tests, build, smoke, dependency audit, a synthetic
  25K seller-search regression, protected disposable proof workflows, and a
  protected production environment format check are checked into GitHub Actions.
- Obsolete runtime mock buyer search and its unused fixture dataset were
  removed. Invite verification decisions now use typed states rather than
  display-string matching.

## SQL present but not deployment-proven

- Reserved `00017`: Auth/security, suspension, Storage, leased outbox, generic
  shared limiter.
- Reserved `00018`: buyer criteria uniqueness and atomic activation guards.
- Reserved `00019`: seller property version/evidence/invite integrity.
- Reserved `00020`: measured seller-search indexes, created concurrently
  outside a transaction.
- Reserved `00021`: inactive LA County staging; the isolated proposal still
  needs a transaction, aborting assertions, full immutable-field conflict
  checks, a missing FK index, and restoration of changed inactive rows.
- Reserved `00022`: separate LA activation; not authored.

No reserved proposal may be copied into a numbered migration until its exact
disposable proof, counts, quarantine review, checksum, and rollback note are
recorded.

## Required release sequence

1. Resolve the historical `00005` fresh-install blocker without rewriting any
   migration already applied to a shared database; prove canonical geography on
   representative upgrade and supported fresh/baseline paths.
2. Prove `00016` immutable identity ownership plus proposed `00017` Auth,
   session, Storage, limiter, and outbox behavior on an exact disposable chain.
3. Prove proposed `00018` and `00019` with their two-connection harnesses and
   review all legacy duplicates/evidence/quarantine rows.
4. Run normal CI on the exact reviewed SHA. Run the protected disposable
   workflows with branch-specific credentials and required human approval.
5. Rebase and repair the inactive LA County proposal after Geography PR1 is
   proven. Review every dataset checksum and official relationship.
6. Validate production-like seller-search plans, Supabase security/performance
   advisors, RLS/Storage behavior, and real deployment environment values.
7. Run a fresh desktop/mobile UI audit against the stable APIs and inactive LA
   dataset.
8. Author and rehearse the separate activation/rollback migration, then hold a
   human LA beta go/no-go review.

## Open LA launch blockers

### Geography

- Exact fresh replay currently fails at historical migration `00005` because of
  `spatial_ref_sys` ownership. A proven current baseline is required for new
  databases; applied history must stay immutable.
- The isolated LA proposal stages 661 inactive records (88 cities, 269
  communities, 304 ZCTAs) with versioned geometry/checksum evidence and 149
  reviewed city/community display and search-rollup pairs. It creates no
  inferred ZCTA relationships and performs no activation.
- Before integration, fix direct lookup A→B response races, union every shared
  target into the importer denylist, add an explicit migration transaction and
  aborting checks, compare all immutable fields on repeat staging, index the
  boundary-version FK, and provide executable restoration for modified inactive
  rows.
- Prove same-named places across markets, rapid navigation, stale polygon
  rejection, suggestion races, derived market bounds, double-stage idempotency,
  realistic query plans, and advisors.

### Database and security proof

- Re-run the repaired `00016` and exact current `00017` proposal on a fresh
  sentinel-marked disposable Supabase branch. Earlier branch evidence is
  historical and does not close the current gate.
- Run the direct two-connection identity, limiter/outbox, buyer publication, and
  seller property/invite harnesses. Run the full Auth Admin deletion,
  suspension, direct Storage, and email-reuse lifecycle with branch-specific
  API/database credentials.
- Add a real staged `prisma migrate deploy` ledger/checksum rehearsal. Direct
  SQL harnesses alone do not prove deployment history.
- Preserve exact pre/post counts and disposition every quarantine or legacy
  evidence row. Do not enable customer hard deletion.

### Scale and release operations

- The checked-in 25K seller-search benchmark is a synthetic regression, not a
  substitute for production-like LA-volume `EXPLAIN (ANALYZE, BUFFERS)` and
  advisor review.
- Configure protected GitHub environments with required reviewers, no
  self-approval, exact reviewed SHA inputs, branch-specific proof secrets, and
  passwordless shared-project identity URLs. Never run secret-bearing proof on
  `pull_request_target` or untrusted checkout code.
- The production readiness workflow checks value presence and format only. It
  does not prove database/API connectivity, matching Supabase keys, Resend
  domain verification, provider quotas, leaked-password protection, deployed
  migrations, or advisors.
- Delete disposable proof branches/projects after evidence is captured. Recreate
  a clean target rather than rerunning a half-mutated proof database.

### UI/UX

- Run a fresh desktop/mobile pass after APIs and geography stabilize. Cover
  loading, empty, unavailable, recovery, keyboard, hydration-disabled, rapid
  location switching, and mobile navigation states.
- Do not treat the dated 2026-07-03 research plan as a current bug list without
  reproducing each item. UI work must not redefine authorization or DTOs.

## Environment and advisor decisions

- Configure a 32+ character `AUTH_RATE_LIMIT_PEPPER`. The name is historical;
  it protects HMAC keys for the generic shared limiter, not Auth alone.
- Configure `CRON_SECRET`, verified Resend sender/domain, Mapbox, ATTOM, real
  Supabase URL/keys, and production database targets in the deployment
  environment. Keep `LIBER_AUTO_CONFIRM_SIGNUPS` disabled.
- Enable Supabase Auth leaked-password protection before public launch.
- Decide whether to move PostGIS out of `public` or accept and document the
  remaining `spatial_ref_sys`/PostGIS advisor findings.
- Keep application tables deny-by-default through RLS. Do not expose
  `app_private` or geography administration schemas through the Data API.
- Re-run Supabase security/performance advisors and production-like query plans
  after final numbered migrations.
- Remove clearly marked demo data before true public launch.

Low-traffic unused-index findings are not sufficient reason to drop ownership,
search, or foreign-key indexes. Decide indexes from final query plans and
representative volume.
