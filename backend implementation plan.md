# Liber Backend Implementation Plan

This document is the backend build contract for Liber. It turns `Implementation.md` into backend architecture decisions and includes the required CTO corrections before any backend migrations, Supabase policies, or server actions are implemented.

Status: core v1 backend foundation is substantially implemented. The Supabase project has the initial Prisma migration, the storage-policy tightening migration, the missing-foreign-key-index migration, the profile-photo bucket migration, the unique-buyer-badges migration, the audit-hardening migration, the Sprint 1 security-hardening migration, and the auth-sync hardening migration in repo. Core buyer/seller/admin server actions are Prisma-backed for real Supabase users only. Production launch still depends on the external/product decisions tracked in `docs/product/production-decisions.md`.

Current remote state:

- Supabase project: `qfjcrhkjlczvzakxives`.
- Applied Prisma migrations:
  - `20260519000000_initial`
  - `20260520000001_tighten_property_image_storage_policy`
  - `20260520000002_add_missing_foreign_key_indexes`
  - `20260520000003_add_profile_photos_bucket`
  - `20260520000004_enforce_unique_buyer_badges`
  - `20260521000005_audit_hardening`
  - `20260526000006_sprint1_security_hardening`
  - `20260526000007_harden_auth_user_sync`
- App tables have RLS enabled.
- Auth-sync and invite-limit triggers are installed in the private `app_private` schema; auth-user creation is idempotent by email so re-created auth users can reclaim an existing app user row instead of failing signup on a unique email conflict.
- `profile-photos`, `property-images`, and `verification-documents` buckets exist.
- The broad public `storage.objects` SELECT policy for `property-images` was removed so public image URLs can work without enabling bucket listing.
- PostGIS functional spatial indexes exist for buyer and seller coordinates.
- Remote smoke checks passed for unverified seller invite rate limiting and PostGIS radius search.
- Role selection writes buyer/seller roles to server-controlled `User.roles` and creates pending `SellerAccess` for selected sellers. Runtime authorization reads `User.roles`; roles are not mirrored into Supabase app metadata, and seller role alone does not grant buyer-directory/profile/invite access.
- Core actions for buyer profile, buyer criteria, seller property, seller search, invites, notifications, and internal admin operations read/write Prisma for UUID-backed Supabase users.
- Buyer profile editing uploads real profile photo files to `profile-photos`, writes the public URL to `User.avatarUrl`, and lets the buyer set Draft/Active visibility, desired location text/coordinates, budget, and down payment. Admin-controlled Hidden/Suspended profiles cannot be restored by buyer form submission.
- Buyer criteria derives `propertyCategory` from `propertySubtype` before persistence so `HOME`, `LAND`, and `COMMERCIAL` filters stay aligned.
- Buyer criteria editing exposes the normalized searchable fields that the backend persists and seller search can use: price, beds/baths, square feet, lot size, cap rate, units, year built, zoning, condition, and features.
- Buyer badge evidence upload stores pre-approval, verified-funds, identity, or other review documents in the private `verification-documents` bucket and creates pending `VerificationDocument` rows.
- Seller property creation and editing handle real file inputs from the existing forms: public property images are stored in `property-images`; ownership documents are stored in `verification-documents`; database records are written after upload.
- Seller property creation/editing forms submit multipart image/document files, include all supported property subtypes, and collect address, coordinates, beds/baths, garage area, square feet, lot size, condition, features, and description.
- Invite send/list views display seller property ownership verification status.
- Invite submission can refresh the selected property's invite-facing details and upload additional property images before sending the seller-to-buyer invite.
- Admin document review lists private documents with 10-minute signed preview URLs generated server-side, updates document/property status, writes audit logs, and notifies the submitting user.
- Admin user management displays persisted user status for suspension review.
- Invite sending checks approved seller access, app-level ownership/rate-limit/dedup rules, creates in-app notifications, writes audit events, and enqueues an `EmailOutbox` row in the same transaction. Resend is used only by the outbox processor when `RESEND_API_KEY` and `RESEND_FROM_EMAIL` are configured; otherwise the adapter reports a mock/non-queued result.
- New invites receive a 30-day `expiresAt`; Vercel cron is configured for `/api/maintenance/expire`, and the route accepts timing-safe signed GET/POST calls with `CRON_SECRET` to mark expired badges and stale sent/viewed invites as expired and process pending email outbox rows.
- Buyer invite responses are limited to sent/viewed invites so accepted, declined, expired, or withdrawn invites cannot be changed.
- Admin badge grant/revoke actions create buyer notifications and audited admin log entries. Sensitive badges require approved verification-document evidence, and the admin badge UI can grant a first badge to a buyer profile, not only update badges that already exist.
- Buyer badges are constrained to one row per buyer profile and badge type.
- Badge display treats past `expiresAt` values as expired even before a scheduled cleanup job runs.
- Seller search uses database-side filters for active buyer profiles, city/state, budget ceiling, buyer criteria category/subtype, property-fit facts such as bedrooms, bathrooms, square feet, lot size, cap rate, and units, active non-expired badges, minimum rating, minimum review count, and optional PostGIS radius search. Seller search can render a Mapbox Static Images map when `NEXT_PUBLIC_MAPBOX_TOKEN` is configured; autocomplete/geocoding UI remains a follow-up.
- Seller search UI exposes Home/Land/Commercial category plus all supported buyer property subtypes.
- Owner uploads use user-scoped Supabase storage clients with app-level byte limits, magic-byte content checks, normalized storage object names, and verification-document hash/size/MIME metadata. Verification-document owner update/delete storage policies are removed so evidence remains immutable after upload.
- Vercel builds run `npm run db:generate` before `npm run build`, and Prisma CLI uses `DIRECT_URL` when present.

Known Supabase advisor items:

- The hardening migration enables RLS and revokes browser-role access on `public.spatial_ref_sys` and `public._prisma_migrations`, and revokes browser-role execution on public `st_estimatedextent` overloads. Verify the migration in staging before applying to production.
- Live Prisma migration bookkeeping may still need an operations fix if `20260520000004_enforce_unique_buyer_badges` was applied outside Prisma. Verify `_prisma_migrations` before the next production deploy.
- PostGIS is installed in `public`; move to a non-exposed extension schema later only after verifying the safest Supabase/PostGIS migration path.
- App tables intentionally have RLS enabled with no client policies yet because v1 data access is server-side through Prisma. Add explicit owner/admin policies before exposing these tables through Supabase Data API clients.
- Fresh-database `unused_index` performance notices are expected until real traffic exercises the schema. Do not remove marketplace/search indexes just because a new database has not used them yet.
- Local Node fetches to Supabase Storage currently fail with `UNABLE_TO_VERIFY_LEAF_SIGNATURE`. PowerShell reaches the same project URL, so this is a local Node CA trust issue. Do not set `NODE_TLS_REJECT_UNAUTHORIZED=0` in app code; configure a proper CA through `NODE_EXTRA_CA_CERTS` if needed for local QA.
- Resend delivery has not been live-smoke-tested because no production sender/domain should be assumed. Configure `RESEND_FROM_EMAIL` only after the sending domain is verified.

## 1. Backend Goal

Build the backend for the v1 marketplace loop:

```txt
Buyer creates searchable profile
-> Seller searches buyers by geography and criteria
-> Seller views buyer profile
-> Seller creates property
-> Seller sends invite
-> Buyer receives notification/email
```

Do not build escrow, money custody, offer/counteroffer, lender APIs, or a customer-facing admin analytics dashboard in v1.

## 2. Approved Architecture Direction

Use:

- Next.js Server Actions / route handlers as the backend API boundary
- Supabase Auth for authentication
- Supabase Postgres as the database
- Supabase Storage for images and private verification documents
- Prisma for schema, migrations, and typed database access
- PostGIS for radius/geography search
- Zod for all action payload validation
- Resend or Postmark for invite email
- In-app `Notification` table for product notifications

Build as a modular monolith. Do not split into services yet.

## 3. Product and Compliance Boundaries

### Trust badges

All trust badges are admin-controlled in v1.

Badge examples:

- `PRE_APPROVED`
- `VERIFIED_FUNDS`
- `EARNEST_MONEY_DEPOSITED`
- `CASH_BUYER`
- `NON_CONTINGENT`
- `VERIFIED_IDENTITY`
- `COMPLETED_TRANSACTION`

Rules:

- Buyers may upload supporting documents to private storage.
- Admins review documents and manually grant/revoke badges.
- Sensitive badges (`PRE_APPROVED`, `VERIFIED_FUNDS`, `VERIFIED_IDENTITY`, `EARNEST_MONEY_DEPOSITED`, `CASH_BUYER`) require an approved verification document linked to the badge.
- Pre-approval expires after 90 days from issuance.
- Expired badges must not affect search ranking or filtering.
- Badge changes must write `AdminAuditLog` records.
- Lender portal is out of scope for v1.

### Earnest money and escrow

Do not build payment custody, bank transfers, wallet balances, earnest-money holding, or escrow in v1.

Required language:

> `EARNEST_MONEY_DEPOSITED` is manually marked by Admins only after third-party escrow/title/partner evidence is reviewed.

Do not say Liber has received, holds, wires, controls, transfers, or releases earnest money unless a licensed/legal workflow exists.

The v1 transaction boundary stops at buyer invite response:

- Buyer can accept invite.
- Buyer can decline invite.
- No offer/counteroffer.
- No contract signing.
- No transaction execution.
- No money movement.

### Property ownership and invites

Sellers may create properties before ownership approval to reduce marketplace friction.

Seller access to buyer search, buyer profile views, property enrichment, and invites requires `SellerAccess.status = APPROVED`. Self-selected seller role creates only pending access until an admin reviews it.

Invite display must show one of:

- `Seller Property Ownership: Pending Verification`
- `Seller Property Ownership: Verified`

Required invite limits:

- Unverified property: max 5 invites per seller per 24 hours, no bulk invite.
- Verified property: max 25 to 50 invites per seller per 24 hours.
- Suspicious behavior should trigger admin review.

Do not implement a flat 50/day limit for all sellers.

### Fair Housing and search safety

Seller search may filter by:

- Geographic radius/city
- Budget range
- Property category/subtype
- Structured property criteria
- Active trust badges
- Review count/rating
- Profile freshness

Seller search must not filter, sort, rank, or profile by:

- Race
- Color
- Religion
- Sex
- Familial status
- National origin
- Disability
- Age
- Marital status
- Identity traits
- Subjective personality traits
- Free-text demographic inference

Do not index buyer bio or subjective profile text for seller filtering in v1.

## 4. Admin Scope

The designer-made backend/admin dashboard is out of scope.

Do not build:

- Customer-facing admin dashboard
- Revenue chart dashboard
- Seller/buyer management sidebar UI from the screenshot
- Polished admin analytics product

Keep only internal admin operations required for v1 safety:

- Review documents
- Grant/revoke badges
- Suspend users
- Hide profiles
- Inspect invite abuse
- View audit logs

These can be implemented as protected internal routes or operational tools later. They should not appear in customer-facing navigation.

## 5. Database and Auth Sync

### Required ID strategy

Supabase Auth user IDs are UUIDs. Use UUID-compatible IDs for users and all user foreign keys.

Prisma direction:

```prisma
model User {
  id String @id @db.Uuid
  email String @unique
  roles UserRole[] @default([])
}
```

Any model referencing `User.id` should use `String @db.Uuid`.

### Connection strings

Use two database URLs:

- `DATABASE_URL`: runtime connection for Next.js server actions.
- `DIRECT_URL`: direct/session connection for Prisma migrations.

Before implementation, verify the current Supabase/Prisma connection-string guidance from official docs. Supabase and Prisma behavior around poolers can change.

### Auth sync trigger requirement

Do not put `SECURITY DEFINER` functions in `public`.

Create a private schema such as `app_private` and put auth-sync functions there.

Required properties:

- Function lives outside exposed schemas.
- Function uses `SECURITY DEFINER`.
- Function sets a locked `search_path`.
- Function references target tables with explicit schema names.
- Trigger is attached to `auth.users`.
- User starts role-less until onboarding chooses buyer/seller.
- Admin role cannot be self-assigned by auth metadata.

Pattern:

```sql
CREATE SCHEMA IF NOT EXISTS app_private;

CREATE OR REPLACE FUNCTION app_private.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  INSERT INTO public."User" (
    id,
    email,
    name,
    "avatarUrl",
    roles,
    "createdAt",
    "updatedAt"
  )
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'name', ''),
    NEW.raw_user_meta_data->>'avatarUrl',
    ARRAY[]::public."UserRole"[],
    NOW(),
    NOW()
  );

  RETURN NEW;
END;
$$;

CREATE OR REPLACE TRIGGER on_auth_user_created
AFTER INSERT ON auth.users
FOR EACH ROW
EXECUTE FUNCTION app_private.handle_new_user();
```

Use a matching `app_private.handle_update_user()` for email/name/avatar sync. It must not sync roles from user-editable metadata.

## 6. Storage Architecture

### Buckets

Use three buckets in v1:

1. `profile-photos`
2. `property-images`
3. `verification-documents`

### `profile-photos`

Purpose:

- Public buyer profile photos used in buyer cards and public buyer profiles.

Read:

- Public read is allowed after upload.
- Do not add a broad `storage.objects` SELECT policy. Public object URLs do not require bucket listing.

Write:

- Buyers upload through a server action after `BUYER` role validation. The server uses the user's Supabase session, storage RLS enforces the first path segment, and the action updates `User.avatarUrl`.

Required path format:

```txt
profile-photos/{userId}/{imageId}/file
```

### `property-images`

Purpose:

- Public property images used in seller invite/property previews.

Read:

- Public read is allowed after upload.
- Do not add a broad `storage.objects` SELECT policy for this public bucket. Public object URLs do not need it, and the policy allows bucket listing.

Write:

- Authenticated seller can write only for properties they own.

Required path format:

```txt
property-images/{propertyId}/{imageId}/file
```

The policy must verify that `propertyId` belongs to `auth.uid()`.

### `verification-documents`

Purpose:

- Ownership documents
- Pre-approval documents
- Verified funds documents
- Identity documents
- Partner evidence for sensitive badges

Read:

- Owner can read own documents.
- Admin can read all documents.
- No public reads.

Write:

- Owner can upload own documents.
- Owner cannot update or delete uploaded verification-document storage objects. New evidence requires a new object and document row.

Required path format:

```txt
verification-documents/{userId}/{documentId}/file
```

Policies may rely on the first path segment only if uploads are forced to this exact format by server-side code.

### Signed URLs

All private document previews must use short-lived signed URLs.

Rules:

- Signed URLs are generated server-side only.
- Service role key is never exposed to client code.
- Endpoint/action checks owner or admin permission before generating URL.
- Suggested expiry: 10 minutes.

## 7. Geolocation Search

### Storage model

Store coordinates as normal Prisma-supported numeric fields:

- `BuyerProfile.desiredLat`
- `BuyerProfile.desiredLng`
- `SellerProperty.lat`
- `SellerProperty.lng`

Use `Decimal(10, 7)` in Prisma.

Do not store PostGIS geometry/geography columns in Prisma models for v1.

### PostGIS

Enable PostGIS through migration SQL.

Create functional partial indexes with null guards:

```sql
CREATE EXTENSION IF NOT EXISTS postgis;

CREATE INDEX IF NOT EXISTS buyer_profile_spatial_idx
ON public."BuyerProfile"
USING gist (
  geography(
    ST_SetSRID(
    ST_MakePoint(
      CAST("desiredLng" AS double precision),
      CAST("desiredLat" AS double precision)
    ),
    4326
    )
  )
)
WHERE "desiredLng" IS NOT NULL AND "desiredLat" IS NOT NULL;

CREATE INDEX IF NOT EXISTS seller_property_spatial_idx
ON public."SellerProperty"
USING gist (
  geography(
    ST_SetSRID(
    ST_MakePoint(
      CAST("lng" AS double precision),
      CAST("lat" AS double precision)
    ),
    4326
    )
  )
)
WHERE "lng" IS NOT NULL AND "lat" IS NOT NULL;
```

### Radius query pattern

Use Prisma raw SQL only for the spatial portion.

Requirements:

- Query excludes null lat/lng.
- Radius is converted to meters.
- `LIMIT` is bounded server-side.
- Query uses structured filters only.
- No demographic/free-text filters.

Pattern:

```ts
const buyers = await prisma.$queryRaw`
  SELECT bp.*, u.name, u."avatarUrl"
  FROM public."BuyerProfile" bp
  JOIN public."User" u ON bp."userId" = u.id
  WHERE bp."visibilityStatus" = 'ACTIVE'
    AND bp."desiredLng" IS NOT NULL
    AND bp."desiredLat" IS NOT NULL
    AND ST_DWithin(
      ST_SetSRID(
        ST_MakePoint(
          CAST(bp."desiredLng" AS double precision),
          CAST(bp."desiredLat" AS double precision)
        ),
        4326
      )::geography,
      ST_SetSRID(ST_MakePoint(${propertyLng}, ${propertyLat}), 4326)::geography,
      ${radiusMiles} * 1609.344
    )
  ORDER BY bp."ratingAverage" DESC NULLS LAST
  LIMIT ${limit};
`;
```

## 8. Server Actions and API Security

Server actions should live under `apps/web/app/actions/` or a clearly named server module imported by route-specific actions.

Every mutation must do this in order:

1. Get authenticated user with Supabase Auth.
2. Load server-controlled user record from Postgres.
3. Validate payload with Zod.
4. Check role/ownership.
5. Run mutation.
6. Write audit log for sensitive admin/trust/document actions.
7. Return a minimal response.

### Buyer actions

- `createBuyerProfile`
- `updateBuyerProfile`
- `upsertBuyerCriteria`
- `setBuyerProfileVisibility`
- `uploadBuyerAvatar`
- `listBuyerInvites`
- `respondToInvite`

Rules:

- Requires `BUYER`.
- Buyer can only mutate own profile.
- Buyer can only respond to own invites.

### Seller actions

- `searchBuyers`
- `getBuyerProfileForSeller`
- `createSellerProperty`
- `updateSellerProperty`
- `uploadPropertyImage`
- `uploadOwnershipDocument`
- `sendInvite`
- `listSellerInvites`

Rules:

- Requires `SELLER`; buyer-directory, buyer-profile, property-enrichment, and invite operations additionally require approved `SellerAccess`.
- Seller can only mutate owned properties.
- Seller can only send invites from owned properties.
- Buyer profile must be active.
- Invite limits depend on ownership verification status.

### Admin actions

- `listUsers`
- `listPendingDocuments`
- `reviewDocument`
- `grantBadge`
- `revokeBadge`
- `suspendUser`
- `hideBuyerProfile`
- `listAuditLog`

Rules:

- Requires `ADMIN`.
- Admin role is server-controlled.
- Every sensitive action writes `AdminAuditLog`.

## 9. Invite Rate Limiting

Use a Postgres-backed check before insert.

Initial limits:

- Unverified seller property: 5 invites per seller per 24 hours.
- Verified seller property: 25 invites per seller per 24 hours.
- Increase to 50/day only after product review and abuse monitoring exists.

Blocked cases:

- Seller does not own property.
- Buyer profile is not active.
- Seller access is not approved.
- Seller has exceeded tier limit.
- Seller/user is suspended.
- Property is flagged for abuse.

## 10. Notifications

### In-app

Create a `Notification` row when:

- Invite is sent to buyer.
- Invite is sent by seller.
- Invite expires.
- Badge is approved/rejected/revoked.
- Badge expires.
- Ownership document is approved/rejected.
- Pre-approval is near expiration.

### Email

Use Resend or Postmark.

For local/dev:

- Start with a mock email adapter that logs payloads.
- Use real provider keys only when available.

Do not block core backend development on production email keys.

## 11. Migration Plan

Create migrations in this order:

1. Prisma schema migration with UUID user IDs and core tables.
2. Auth sync private-schema trigger migration.
3. Storage bucket and storage policy migration.
4. PostGIS extension and partial spatial index migration.
5. Invite rate-limit function migration.

Before writing migrations:

- Verify current Supabase docs/changelog.
- Verify Prisma/Supabase pooler guidance.
- Confirm whether the project uses local Supabase CLI or remote MCP tools.

## 12. Verification Plan

### Automated

- `prisma validate` for schema correctness.
- Migration dry run against local Supabase or disposable database.
- Vitest for Zod validators:
  - negative money rejected
  - min greater than max rejected
  - invalid roles rejected
  - invite terms must be accepted
- Unit test search scoring if implemented.
- Server action tests for role/ownership failures.

### Manual

Auth sync:

- Create Supabase Auth test user.
- Confirm matching `public."User"` row is inserted.
- Confirm roles are empty until onboarding.
- Confirm metadata update syncs name/avatar but not roles.

Private documents:

- Upload document to `verification-documents/{userId}/{documentId}/file`.
- Direct public URL should fail.
- Owner signed URL should work.
- Non-owner signed URL request should fail.
- Admin signed URL request should work.

Property images:

- Owner can upload to owned property path.
- Non-owner cannot upload to another property path.
- Public read works for approved image path.

Radius search:

- Insert one buyer within 5 miles and one buyer 20 miles away.
- Search with 10-mile radius.
- Only the nearby active buyer returns.
- Buyer with null lat/lng is ignored.

Invite rate limits:

- Unverified property blocks after 5 invites in 24 hours.
- Verified property uses higher cap.
- Seller cannot invite from property they do not own.

Admin audit:

- Badge grant writes audit log.
- Badge revoke writes audit log.
- Document review writes audit log.
- Suspension/hide action writes audit log.

## 13. Open Questions

Ask the CEO/product owner. Track final answers in `docs/product/production-decisions.md`:

- First launch city or state for seed/test data?
- Should unverified sellers be capped at 5/day or lower?
- What exact wording should buyers see for pending ownership verification?
- Which documents are acceptable for ownership verification?
- Which third-party evidence is acceptable for `EARNEST_MONEY_DEPOSITED`?
- Which email provider should be used first: Resend, Postmark, or mock-only?
- Should Mapbox be the production maps/geocoding provider, and what autocomplete UX is required?
- Who is allowed to become an admin in production?
- What is the DB-owner-approved path for Supabase advisor remediation?

## 14. Approval Checklist

Backend implementation is approved only when:

- Auth sync functions are in a private schema, not `public`.
- `SECURITY DEFINER` functions have locked `search_path`.
- User IDs align cleanly with Supabase UUIDs.
- Earnest money wording avoids Liber custody.
- Invite limits are tiered by ownership verification.
- Storage paths are explicit and enforced.
- Private document signed URLs check owner/admin permission.
- Spatial indexes are partial and exclude null coordinates.
- Search excludes demographic/free-text profile filters.
- Customer-facing admin dashboard is out of scope.
- Admin-only operations remain protected internal tools.
