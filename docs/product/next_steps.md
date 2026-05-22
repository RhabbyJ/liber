# Next Steps

Status: main skeleton complete for local development.

This document records the completion audit for the `Implementation.md` skeleton and defines the next feature work to review before implementation. It does not change product scope by itself.

## Skeleton Completion Criteria

The main skeleton is considered complete when these are present and locally verified:

- Product and engineering docs exist.
- Next.js app and workspace packages exist.
- Auth, role onboarding, and route protection exist.
- Buyer profile, criteria, public profile, badges, invites, and notifications routes exist.
- Seller search, property, property edit, invite, and sent-invites routes exist.
- Internal admin routes exist for users, buyer profiles, documents, badges, invites, reports, and audit log.
- Server contracts exist for buyer, seller, admin, invite, notification, document, and badge operations.
- Prisma/Supabase schema exists for the core marketplace loop.
- Compliance boundaries remain intact: no escrow, no money custody, no automated transaction execution, no Fair Housing-risk filters, no customer-facing admin analytics dashboard.

## Completion Audit

| Requirement | Evidence | Status |
| --- | --- | --- |
| Product plan reviewed | `Implementation.md` defines the core buyer-directory marketplace loop and v1/deferred scope. | Complete |
| Backend plan reviewed | `backend implementation plan.md` tracks Supabase, Prisma, storage, auth, invite, and compliance state. | Complete |
| Product docs | `docs/product/mvp-spec.md`, `user-flows.md`, `permissions.md`, `production-decisions.md`, `monetization-design.md`. | Complete |
| Engineering docs | `docs/engineering/architecture.md`, `data-model.md`, `api-contracts.md`, `agent-tasks.md`, `implementation-audit.md`. | Complete |
| App skeleton | `apps/web` has Next App Router routes, components, server modules, public assets, and package scripts. | Complete |
| Workspace skeleton | `packages/db`, `packages/ui`, `packages/validators`, and root workspace scripts exist. | Complete |
| Public/auth routes | `/`, `/login`, `/signup`, `/onboarding/role`, `/buyers/[buyerProfileId]`. | Complete |
| Buyer routes | `/buyer/profile`, `/buyer/criteria`, `/buyer/badges`, `/buyer/invites`, `/buyer/notifications`. | Complete |
| Seller routes | `/seller/search`, `/seller/properties`, `/seller/properties/new`, `/seller/properties/[propertyId]/edit`, `/seller/invite/[buyerProfileId]`, `/seller/invites`. | Complete |
| Admin routes | `/admin`, `/admin/users`, `/admin/buyer-profiles`, `/admin/badges`, `/admin/documents`, `/admin/invites`, `/admin/reports`, `/admin/audit-log`. | Complete |
| Server contracts | `apps/web/server/contracts.ts` exports buyer, seller, admin, invite, notification, document, badge, and property functions. | Complete |
| Database model | `packages/db/prisma/schema.prisma` includes `User`, `BuyerProfile`, `BuyerCriteria`, `BuyerBadge`, `SellerProperty`, `PropertyImage`, `VerificationDocument`, `Invite`, `Notification`, `Review`, and `AdminAuditLog`. | Complete |
| Search and invite rules | `apps/web/server/domain.ts` tests active profile filtering, structured property-fit filtering, badges, radius filtering, role checks, ownership checks, and invite limits. | Complete |
| Email adapter skeleton | `apps/web/server/email.ts` sends through Resend only when configured and otherwise returns a mock result. | Complete skeleton, production config pending |
| Map skeleton | `apps/web/components/buyer-map.tsx` and `apps/web/lib/mapbox.ts` support a local map shell and optional Mapbox Static Images. | Complete skeleton, full map/geocoding pending |
| Reports skeleton | `/admin/reports` exists with placeholder report cards. | Complete placeholder, real reporting pending |
| Ratings/reviews skeleton | `Review` model exists and buyer search/profile can display rating/review counts. | Complete skeleton, review workflow pending |

## Verification Run

Last checked on 2026-05-20:

- `cmd /c npm.cmd run typecheck`: passed.
- `cmd /c npm.cmd test`: passed, 5 test files and 22 tests.
- `cmd /c npm.cmd run db:validate`: passed, Prisma schema valid.
- `cmd /c npm.cmd run readiness:env`: passed for local readiness.
- `cmd /c npm.cmd run build`: passed, production build compiled and listed all core routes.
- `cmd /c npm.cmd run smoke:routes`: initial self-start was blocked by an already-running Next dev server in `apps/web`; rerun with `SMOKE_BASE_URL=http://127.0.0.1:3002` passed all route markers.

Local readiness still warns that production-only settings are not configured:

- `CRON_SECRET`
- `NEXT_PUBLIC_MAPBOX_TOKEN`
- `RESEND_API_KEY`
- `RESEND_FROM_EMAIL`

## Next Work Order

### 1. Product Decisions And Production Gates

Before implementing deeper production behavior, decide:

- Launch market and default geographic assumptions.
- Exact ownership verification evidence and buyer-facing wording.
- Badge evidence rules, especially for `EARNEST_MONEY_DEPOSITED`.
- Production admin assignment process.
- Email provider and verified sender domain.
- Mapbox provider decision, token, allowed domains, and autocomplete UX.
- Supabase advisor remediation path for `spatial_ref_sys`, `_prisma_migrations`, and PostGIS schema placement.

Verify:

- `npm run readiness:production` passes only after required env and decisions are real.

### 2. Map And Geocoding System

Build:

- Address/city autocomplete for buyer desired location and seller property address.
- Geocoding/reverse-geocoding that writes normalized city/state/lat/lng.
- Interactive seller search map with pins tied to the same server-filtered result set.
- Clear empty, loading, token-missing, and geocode-failed states.

Keep:

- PostGIS remains the source of truth for radius search.
- No demographic, identity, free-text bio, or Fair Housing-risk filters.

Verify:

- Searching by city and radius returns the expected buyer set.
- Map pins and list cards match.
- App works with and without `NEXT_PUBLIC_MAPBOX_TOKEN`.

### 3. Transactional Email System

Build:

- Production Resend or Postmark configuration.
- Invite email template with compliance-safe copy.
- Document review and badge decision email templates if CEO approves email notifications beyond invites.
- Local preview/mock mode that never sends real mail.

Keep:

- Invite email must not imply offer acceptance, escrow, money custody, loan approval, or transaction execution.

Verify:

- Missing provider config returns mock/non-sending result.
- Configured provider queues email successfully in a controlled smoke test.
- Email failures surface to the seller/admin without corrupting the invite record.

### 4. Reports And Abuse Review

Build:

- Replace placeholder `/admin/reports` data with persisted report records or derived abuse-review queues.
- Report categories for invite volume, suspicious profiles, document concerns, and review moderation.
- Admin actions to resolve, dismiss, or escalate reports.
- Audit log entries for sensitive report decisions.

Keep:

- This remains an internal safety tool, not a customer-facing analytics dashboard.

Verify:

- Rate-limit or suspicious behavior creates reviewable admin work.
- Admin decisions are audited.
- Customer navigation does not expose admin reporting.

### 5. Ratings And Reviews

Build:

- Review creation flow tied to a legitimate marketplace interaction.
- Review moderation state using the existing `ReviewStatus`.
- Buyer profile aggregate updates for `ratingAverage` and `reviewCount`.
- Admin moderation for hiding abusive or invalid reviews.

Keep:

- Do not allow reviews to become a proxy for protected-class, demographic, or subjective personality filtering.
- Search can use rating/review count only as already allowed by the product plan.

Verify:

- Only eligible users can review.
- Hidden/pending reviews do not affect public aggregates.
- Search and profile displays use the same aggregate values.

### 6. Production Hardening

Build:

- Scheduled maintenance for invite and badge expiration using `CRON_SECRET`.
- Storage smoke tests for profile photos, property images, and verification documents after local Node CA trust is fixed.
- First-class browser interaction tests if we need coverage beyond current route smoke.
- Error reporting and product analytics only after provider decisions are made.

Keep:

- Service-role keys stay server-only.
- Private verification documents never receive public URLs.
- Do not auto-apply Supabase advisor remediation without DB-owner approval.

Verify:

- Expired badges and stale invites are marked expired.
- Private document previews use signed URLs only.
- Production readiness command passes before launch.

