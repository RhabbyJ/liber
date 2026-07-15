# CTO Packet — July 14, 2026

## Executive status

Liber remains a controlled CEO demo/private preview. The current application
commit is `af144d7` on `main`. Los Angeles County geography is active and the
application-owned geography security boundary is hardened, but this packet is
not a public-launch approval.

The v1 loop remains a private directory of verified buyer demand: approved
sellers search active buyers, review fit, create private properties, and send
manual invites. There is no escrow, money movement, automated offer, public
buyer directory, or public property marketplace.

## Current shipped scope

- Public homepage: map-first privacy-safe buyer-demand preview with generated
  neutral aliases and animal avatars.
- Seller access: server-enforced approval gate for full buyer search, profiles,
  and invite actions; pending or rejected sellers receive only the narrow
  privacy-safe preview projection.
- Seller search: SQL-backed, keyset-paginated buyer demand with canonical
  geography, fit, amenity, budget, badge, and condition filters.
- Buyer publication: atomic ownership-checked profile, criteria, and one active
  primary canonical service area.
- Property/invites: private property context, version-bound ownership evidence,
  identity invalidation, rolling 24-hour invite quota, and expiring access.
- Auth/data boundary: immutable Supabase Auth UUID ownership, server-controlled
  roles, suspension checks, private Storage, direct upload sessions, leased
  outbox work, and shared Postgres rate limiting.
- Maps: LA County bounds, selected-area-only polygons, direct wheel/touch map
  gestures, and privacy-safe approximate buyer pins.

## Production geography and database evidence

The production LA County release is
`la-county-06037-2026-07-12-v2` for County GEOID `06037`.

- 661 canonical records are retained: 88 cities, 269 statistical communities,
  and 304 Census ZCTAs.
- 395 areas are active: all 88 incorporated cities, all 304 approximate ZCTA
  service areas, plus Encino, Northridge, and Tarzana.
- The remaining 266 statistical communities are inactive. For example,
  Hollywood is retained but is not an active neighborhood selector; an active
  Hollywood-area ZIP can be used instead.
- Production activation evidence records zero invalid active buyers, versioned
  selected-area geometry, one County display bundle, deterministic checksums,
  and guarded rollback.
- July 13 hardening evidence records no raw `anon` or `authenticated` table
  privileges on canonical geography, RLS enabled on all four affected tables,
  a safe server-mediated search route, and an indexed default-planner prefix
  query.

The repository contains 25 checked-in Prisma migrations. Production evidence
from July 13 proves the first 24 were applied with no unresolved ledger rows.
Migration `20260713230000_fix_rate_limit_timestamp_variable` is the 25th
checked-in migration; its production application was not independently
reconciled while preparing this packet and must be verified before the next
database release claim.

## Security posture

Implemented application boundaries include server-side authorization, narrow
public/seller DTOs, private document and property-image access, immutable
evidence, active-user checks, seller approval checks, audit paths, database
rate limiting, invite serialization, and fail-closed production geography.

Open security or platform gates:

- OPSWAT MetaDefender Cloud v4 paid private-processing credentials, terms,
  scan-state implementation, and end-to-end sensitive-document scanning.
- Supabase Auth leaked-password protection.
- Supabase-supported remediation for PostGIS in `public`, `spatial_ref_sys`,
  and the three browser-executable `st_estimatedextent` overloads.
- Guarded staging proof for Auth UUID collision/deletion recovery, suspension,
  Storage access matrices, buyer atomicity, property identity invalidation,
  invite concurrency, outbox leases, and shared rate-limit contention.
- Current staging snapshots proving public and seller DTO omission with
  representative production-like records.

## Operations and environment gates

- Vercel cron schedules are intentionally disabled for the controlled Hobby
  preview. Public launch requires the outbox worker every minute and expiry
  maintenance daily at 09:00 UTC, with `CRON_SECRET` and worker heartbeats.
- Invite email requires valid `RESEND_API_KEY` and `RESEND_FROM_EMAIL` plus a
  verified sender domain.
- Every deployed environment requires a unique `AUTH_RATE_LIMIT_PEPPER` of at
  least 32 characters.
- Remove controlled demo buyer data before true public launch.
- Re-run dependency audit, Supabase security/performance advisors, and seller
  search `EXPLAIN (ANALYZE, BUFFERS)` at realistic volume before launch.

## Dependency posture

The July 11 production dependency audit recorded one high and five moderate
findings. The Hono findings are transitive through Prisma development tooling;
the PostCSS finding is bundled by Next.js 16.2.6. No unsafe forced downgrade or
override was applied. Re-audit is required before public launch and after
supported Prisma or Next upgrades.

## Current verification note

The immediately preceding map interaction change passed `npm run typecheck`,
two focused map tests, and `git diff --check` before commit `af144d7` was pushed
to `main`. A broader verification run started during packet preparation was
cancelled by the requester and is not claimed as passing in this packet.

## CTO decisions and next actions

1. Keep controlled-preview status until malware scanning and scheduled
   maintenance are complete.
2. Reconcile production migration `20260713230000` and record current ledger
   evidence for all 25 migrations.
3. Enable leaked-password protection and obtain a Supabase-supported resolution
   for the remaining platform-owned PostGIS findings.
4. Provision OPSWAT private-processing credentials and approve vendor retention,
   region, deletion, and DPA terms before implementation.
5. Run the protected disposable and staging proof workflows at the exact
   reviewed commit.
6. Restore and verify maintenance schedules, Resend delivery, Auth operations,
   upload cleanup, and worker heartbeats before public availability.
7. Complete a fresh desktop/mobile/accessibility audit after the release gates
   above stabilize.

## Authoritative references

- `docs/product/V1_DEFINITION.md`
- `docs/product/production-decisions.md`
- `docs/engineering/BACKEND_ARCHITECTURE.md`
- `docs/engineering/GEOGRAPHY_LA_COUNTY_RELEASE_EVIDENCE_2026-07-12.md`
- `docs/engineering/GEOGRAPHY_LA_SECURITY_HARDENING_EVIDENCE_2026-07-13.md`
- `docs/engineering/UPLOAD_MALWARE_SCANNING.md`
- `docs/engineering/DEPENDENCY_AUDIT_2026-07-11.md`
