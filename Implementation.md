# Liber Implementation Plan

This is the source-of-truth build brief for future agents. It is based on `ceo transcript.txt`, the 31 images in `Figma Images/`, the extracted product read, and the repo-level orchestration rules in `AGENTS.md`.

## 1. Product Definition

Liber is a reverse real-estate marketplace.

Traditional platforms start with sellers listing properties and buyers searching inventory. Liber flips that: buyers create searchable demand profiles, and sellers search for serious buyers who match their property.

Core MVP loop:

```txt
Buyer creates searchable profile
-> Seller searches buyers by geography and criteria
-> Seller views buyer profile
-> Seller adds property details
-> Seller sends invite
-> Buyer receives notification/email
```

Do not build escrow first. The MVP must prove seller demand for a searchable buyer directory.

Current backend status:

- Supabase project `qfjcrhkjlczvzakxives` is connected and has the initial Prisma schema deployed.
- Applied migrations: `20260519000000_initial`, `20260520000001_tighten_property_image_storage_policy`, `20260520000002_add_missing_foreign_key_indexes`, `20260520000003_add_profile_photos_bucket`, `20260520000004_enforce_unique_buyer_badges`, and `20260521000005_audit_hardening`.
- RLS is enabled on app tables, private `app_private` trigger functions are installed, storage buckets exist, and PostGIS radius search is available.
- Core buyer/seller/admin actions now use Prisma for real Supabase users only; there is no local auth bypass or fixture-store fallback.
- Buyer/seller role selection writes server-controlled roles to `User.roles`; role-less Supabase users are sent to onboarding, and admin cannot be self-assigned.
- Buyer profile editing now uploads profile photos to the public `profile-photos` bucket and stores the public URL in `User.avatarUrl`.
- Buyer profile editing exposes Draft/Active visibility, desired location text/coordinates, budget, and down payment. Admin-controlled Hidden/Suspended profiles cannot be restored by buyer form submission.
- Buyer criteria now derives Home/Land/Commercial category from the selected subtype so commercial search filters remain coherent.
- Buyer criteria editing exposes the common searchable criteria fields used by the backend: price, beds/baths, square feet, lot size, cap rate, units, year built, zoning, condition, and features.
- Buyer badge evidence upload now stores pre-approval, verified-funds, identity, or other documents in the private `verification-documents` bucket for admin review.
- Seller property creation and editing now upload selected property images to `property-images`, upload ownership documents to `verification-documents`, write `PropertyImage` / `VerificationDocument` rows, and mark ownership review as pending.
- Seller property creation/editing forms submit multipart image/document files, expose the full supported property subtype set, and collect address, coordinates, beds/baths, garage area, square feet, lot size, condition, features, and description.
- Invite send/list views now surface seller property ownership status so buyers can distinguish pending from verified properties.
- Invite submission can refresh the selected property's invite-facing details and upload additional property images before sending the seller-to-buyer invite.
- Internal admin document review can render private verification document previews through short-lived signed URLs.
- Admin document review updates document/property status, writes audit logs, and notifies the submitting user.
- Admin user management displays persisted user status for suspension review.
- Invite creation now checks app-level ownership/rate-limit/dedup rules, writes in-app notifications, and calls a server-only email adapter. Resend sends only when `RESEND_API_KEY` and `RESEND_FROM_EMAIL` are configured; otherwise the adapter returns a mock result.
- New invites receive a 30-day `expiresAt`; Vercel cron is configured for `/api/maintenance/expire`, and the route accepts signed GET/POST calls with timing-safe `CRON_SECRET` validation to expire badges and stale sent/viewed invites.
- Buyer invite responses are limited to sent/viewed invites so accepted, declined, expired, or withdrawn invites cannot be re-responded to.
- Admin badge grant/revoke actions now write buyer notifications and audit logs.
- Buyer badges are unique per buyer profile and badge type.
- Badge display treats past `expiresAt` values as expired even before a scheduled cleanup job runs.
- Seller search now applies structured DB-side filters for city/state, budget ceiling, property category/subtype, property-fit facts such as bedrooms, bathrooms, square feet, lot size, cap rate, and units, active badges, rating, review count, and optional PostGIS radius search when latitude/longitude/radius are supplied.
- Seller search UI exposes Home/Land/Commercial category plus all supported buyer property subtypes.
- Seller search map rendering uses Mapbox Static Images when `NEXT_PUBLIC_MAPBOX_TOKEN` is configured and falls back to the local styled map shell when it is not.
- Owner uploads now use user-scoped Supabase storage clients with app-level byte limits and magic-byte content checks; profile-photo owner policies and verification-document owner delete policy are included in the hardening migration.
- The hardening migration revokes browser-role access to `_prisma_migrations` and `spatial_ref_sys`, enables RLS on those public tables, revokes public `st_estimatedextent` execution, preserves audit logs when admin users are deleted, adds invite de-duplication, and adds database check/index hardening for core v1 queries.
- Vercel builds run `npm run db:generate` before `npm run build`, and Prisma CLI uses `DIRECT_URL` when present.
- `npm run smoke:routes` starts a temporary dev server on an available local port, verifies public auth pages, and confirms unauthenticated buyer, seller, and admin routes redirect to login.
- `npm run smoke:no-auth-bypass` scans active source and docs for forbidden auth-bypass strings.
- `npm run smoke:visual` starts a temporary dev server on an available local port, captures public desktop/mobile screenshots under `.artifacts/visual-smoke`, and verifies PNG dimensions.
- `npm run readiness:env` validates local backend configuration without printing secrets; `npm run readiness:production` fails until production-only settings and decisions are complete.
- The customer-facing admin analytics dashboard from the screenshot remains out of scope.

Local caveat:

- Supabase Storage SDK smoke testing from Node currently fails in this shell with `UNABLE_TO_VERIFY_LEAF_SIGNATURE`; PowerShell can reach the Supabase project URL. Do not disable TLS in app code. Fix local Node CA trust with `NODE_EXTRA_CA_CERTS` if this appears during local browser QA.
- Live Supabase migration bookkeeping may still need an operations fix if `20260520000004_enforce_unique_buyer_badges` was applied outside Prisma. Verify `_prisma_migrations` before the next production deploy.

## 2. Users and Responsibilities

### Buyer

Creates a public/searchable buying profile.

Buyer capabilities:

- Sign up/login
- Create and edit buyer profile
- Upload profile photo
- Define buying purpose, bio, needs, wants
- Select property interests: Home, Land, Multifamily, Retail, STNL, Industrial, Office, Other Commercial
- Enter criteria: location, budget, down payment, beds/baths, square feet, lot size, condition, cap rate, units, zoning, special features
- Display trust badges
- Receive seller invites
- View notifications

### Seller

Searches for buyers and sends property invites.

Seller capabilities:

- Sign up/login
- Search geography/city
- View buyers in map/list layout
- Filter by budget, property type, criteria, reviews, and badges
- View buyer public profile
- Add property details
- Upload property images and ownership documents
- Send invite/message to buyer
- Track sent invites

### Internal Admin

Required from v1.

Internal admin capabilities:

- View users and buyer profiles
- Review ownership documents
- Grant/revoke/expire badges
- Moderate suspicious profiles, invites, reviews, and reports
- Disable users or hide profiles
- View audit logs

### Lender / Escrow Partner

Do not build as a full portal in v1. Represent lender and escrow concepts as admin-controlled statuses/badges until real partners and legal workflows are confirmed.

## 3. MVP Scope

### Build in v1

- Auth and roles
- Buyer profile builder
- Buyer public profile
- Property-specific buyer criteria
- Seller search page with map/list
- Buyer cards and filters
- Seller property creation
- Property images
- Ownership document upload with admin review status
- Invite buyer flow
- In-app notifications
- Email invite notification
- Protected internal admin operations for users, badges, documents, invites, and abuse review

### Defer

- Offer/counteroffer workflow
- True escrow/title integration
- Earnest money custody
- Lender API integration
- Paid subscriptions/upgrades
- Advanced matching algorithm
- Full review/dispute system
- Broker/title/lender partner portals
- Customer-facing admin analytics dashboard

## 4. Screen Flow From Figma Images

### Home Page

Role selector plus location search.

Routes:

- Seller CTA -> `/seller/search`
- Buyer CTA -> `/buyer/profile`

### Buyer Public Profile

Used by seller to decide whether to invite.

Must show:

- Photo, name, location
- Buyer type
- Rating/reviews
- Active badges
- Pre-approval expiration countdown
- Budget and down payment range
- Buying purpose
- Bio, needs, wants
- Send Invite button

Route:

- `/buyers/[buyerProfileId]`

### Buyer Profile Builder

Used by buyer to become searchable.

Must support:

- Personal details
- Photo upload
- Profile visibility
- Request admin pre-approval review action placeholder
- Property category tabs
- Criteria forms by category/subtype
- Location picker/map
- Submit Profile button

Note: one desktop screenshot labels the action as `Send Invite`, but context and mobile screenshot indicate it should be `Submit Profile`.

Routes:

- `/buyer/profile`
- `/buyer/criteria`

### Seller Discovery

Core seller experience.

Must support:

- Map with buyer pins
- Buyer list/cards
- Result count
- Select buyer checkbox
- Sort
- All Filters
- Add My Property Details
- See More profile links

Route:

- `/seller/search`

### Seller Property Details

Used to create property context before inviting.

Must support:

- Property type
- Address/location
- Bedrooms/bathrooms
- Square feet/lot size
- Features
- Condition
- Description
- Image upload
- Ownership verification upload

Routes:

- `/seller/properties`
- `/seller/properties/new`
- `/seller/properties/[propertyId]/edit`

### Invite Buyer

Final designed funnel step.

Must support:

- Message title/body
- Property selection or creation
- Address/city/zip/map
- Optional price
- Bedrooms/bathrooms/area/garage
- Property overview card
- Terms checkbox
- Send Invite button

Routes:

- `/seller/invite/[buyerProfileId]`
- `/seller/invites`

## 5. Recommended Tech Stack

Build as a modular monolith first. Do not start with microservices.

### App

- Next.js App Router
- TypeScript
- Tailwind CSS
- shadcn/ui or similar primitive component system
- React Hook Form
- Zod

### Database and Auth

- Supabase Postgres
- Supabase Auth
- Supabase Storage
- PostGIS for location search
- Prisma for schema, migrations, and typed server-side DB access

Security notes:

- Never expose service role keys to the browser.
- Do not use user-editable metadata for authorization.
- Store authoritative roles in server-controlled tables/app metadata.
- Enable RLS on tables exposed through Supabase APIs.
- Use private storage buckets for verification, identity, funds, and ownership documents.

### Maps

- Mapbox for geocoding, reverse geocoding, autocomplete, and map UI
- PostGIS for actual database geo queries

### Notifications

- Postgres `Notification` table for in-app notifications
- Resend or Postmark for transactional email

### Payments

- Stripe Billing later for subscriptions, visibility upgrades, or invite credits
- Do not use Stripe as escrow
- Do not hold earnest money in v1

### Jobs

Use a simple scheduled job system only when needed.

Initial jobs:

- Expire badges
- Remind buyers about expiring pre-approval
- Expire stale invites
- Remind buyers to refresh stale profiles

Options:

- Supabase scheduled functions / pg_cron
- Inngest
- Trigger.dev

### Observability and Testing

- Sentry for errors
- PostHog or similar for product analytics
- Vitest for units
- Playwright for core flows
- Typecheck/build before merging

## 6. Suggested Repo Structure

```txt
liber/
  apps/
    web/
  packages/
    db/
    ui/
    validators/
    config/
  docs/
    product/
    engineering/
  AGENTS.md
  Implementation.md
```

Keep the first implementation simple. Add packages only when there is a real shared boundary.

## 7. Core Data Model

### User

Account identity.

Key fields:

- `id`
- `email`
- `phone`
- `name`
- `avatarUrl`
- `roles`
- `status`
- `suspendedAt`
- `createdAt`
- `updatedAt`

Rules:

- User can be buyer, seller, admin, or buyer+seller.
- Admin role must be server-controlled.

### BuyerProfile

Searchable buyer identity.

Key fields:

- `id`
- `userId`
- `displayName`
- `buyerType`
- `bio`
- `buyingPurpose`
- `desiredLocationText`
- `desiredCity`
- `desiredState`
- `desiredLat`
- `desiredLng`
- `budgetMin`
- `budgetMax`
- `downPaymentMin`
- `downPaymentMax`
- `visibilityStatus`
- `profileCompleteness`
- `ratingAverage`
- `reviewCount`
- `lastRefreshedAt`

### BuyerCriteria

Specific property requirements.

Key fields:

- `id`
- `buyerProfileId`
- `propertyCategory`: home, land, commercial
- `propertySubtype`: home, multifamily, retail, stnl, industrial, land, office, other
- `priceMin`
- `priceMax`
- `squareFeetMin`
- `squareFeetMax`
- `lotSizeMin`
- `lotSizeMax`
- `bedroomsMin`
- `bathroomsMin`
- `capRateMin`
- `capRateMax`
- `unitsMin`
- `unitsMax`
- `yearBuiltMin`
- `yearBuiltMax`
- `condition`
- `zoning`
- `features`
- `extraCriteria`

Use columns for common searchable filters. Use JSON only for subtype-specific fields that are not worth normalizing yet.

### BuyerBadge

Trust marker displayed on buyer profiles and used in search.

Key fields:

- `id`
- `buyerProfileId`
- `badgeType`
- `status`
- `issuedAt`
- `expiresAt`
- `verifiedByUserId`
- `source`

Initial badge types:

- `pre_approved`
- `earnest_money_deposited`
- `cash_buyer`
- `non_contingent`
- `verified_identity`
- `verified_funds`
- `completed_transaction`

Rules:

- Pre-approval expires after 90 days.
- Only active badges affect search/filtering.
- Badge changes require admin audit log entries.
- In v1, badges are manually/admin controlled.

### SellerProperty

Seller property used for matching and invite context.

Key fields:

- `id`
- `ownerUserId`
- `addressLine1`
- `addressLine2`
- `city`
- `state`
- `zip`
- `lat`
- `lng`
- `propertyType`
- `bedrooms`
- `bathrooms`
- `garageArea`
- `squareFeet`
- `lotSize`
- `condition`
- `features`
- `description`
- `price`
- `ownershipVerificationStatus`
- `flaggedForReviewAt`

### PropertyImage

Key fields:

- `id`
- `propertyId`
- `storagePath`
- `sortOrder`
- `altText`

### VerificationDocument

Sensitive document upload.

Key fields:

- `id`
- `userId`
- `buyerProfileId`
- `propertyId`
- `documentType`
- `storagePath`
- `status`
- `reviewedByUserId`
- `reviewedAt`
- `rejectionReason`

Rules:

- Store in private bucket.
- Never expose direct public URLs.
- Access through owner/admin/server-generated signed URL only.

### Invite

Seller-to-buyer outreach.

Key fields:

- `id`
- `sellerId`
- `buyerProfileId`
- `propertyId`
- `title`
- `message`
- `status`: sent, viewed, accepted, declined, expired, withdrawn
- `sentAt`
- `viewedAt`
- `respondedAt`
- `expiresAt`

Rules:

- Seller must own property.
- Buyer profile must be active.
- Invites must be rate-limited.
- Accept/decline is allowed in v1.
- No offer engine in v1.

### Notification

Key fields:

- `id`
- `userId`
- `type`
- `title`
- `body`
- `readAt`
- `metadata`

### AdminAuditLog

Key fields:

- `id`
- `actorUserId`
- `action`
- `targetType`
- `targetId`
- `metadata`
- `createdAt`

Log badge decisions, document reviews, role changes, suspensions, and invite moderation.

## 8. Permissions

### Public

Can view:

- Home page
- Active public buyer profiles with privacy-safe fields

Cannot view:

- Verification docs
- Private contact info
- Invite details
- Admin routes

### Buyer

Can:

- Manage own profile and criteria
- Upload own profile photo
- View own badge statuses
- View/respond to own invites
- View own notifications

Cannot:

- Grant badges
- View other users' private documents

### Seller

Can:

- Search active buyer profiles
- View public buyer profiles
- Manage own properties
- Upload own property images/docs
- Send invites
- View own sent invites

Cannot:

- View buyer private verification docs
- Send unlimited invites
- Grant badges

### Internal Admin

Can:

- Review users, badges, documents, invites, reports
- Grant/revoke badges
- Approve/reject documents
- Hide profiles
- Suspend users
- View audit logs

Admin actions must be audited.

## 9. Main Routes

### Public

- `/`
- `/buyers/[buyerProfileId]`

### Auth

- `/login`
- `/signup`
- `/onboarding/role`

### Buyer

- `/buyer/profile`
- `/buyer/criteria`
- `/buyer/badges`
- `/buyer/invites`
- `/buyer/notifications`

### Seller

- `/seller/search`
- `/seller/properties`
- `/seller/properties/new`
- `/seller/properties/[propertyId]/edit`
- `/seller/invite/[buyerProfileId]`
- `/seller/invites`

### Internal Admin

Protected internal operations only. Do not expose these routes in customer navigation, and do not build the designer-made revenue/admin analytics dashboard as part of the customer-facing MVP.

- `/admin`
- `/admin/users`
- `/admin/buyer-profiles`
- `/admin/badges`
- `/admin/documents`
- `/admin/invites`
- `/admin/reports`
- `/admin/audit-log`

## 10. Server Contracts

Use server actions or route handlers. Validate mutations with Zod.

Buyer:

- `createBuyerProfile`
- `updateBuyerProfile`
- `upsertBuyerCriteria`
- `setBuyerProfileVisibility`
- `uploadBuyerAvatar`
- `listBuyerInvites`
- `respondToInvite`

Seller:

- `searchBuyers`
- `getBuyerProfileForSeller`
- `createSellerProperty`
- `updateSellerProperty`
- `uploadPropertyImage`
- `uploadOwnershipDocument`
- `sendInvite`
- `listSellerInvites`

Admin:

- `listUsers`
- `listPendingDocuments`
- `reviewDocument`
- `grantBadge`
- `revokeBadge`
- `suspendUser`
- `hideBuyerProfile`
- `listAuditLog`

## 11. Search and Matching

Start explainable. Do not overbuild ML/matching.

v1 filters:

- Location/city/radius
- Property category/subtype
- Budget overlap
- Bedrooms/bathrooms
- Square footage
- Lot size
- Cap rate
- Units
- Active badges
- Rating/review count
- Recently refreshed

v1 sort:

- Recommended
- Recently active
- Highest budget
- Most verified
- Highest rated

Recommended score inputs:

- Location fit
- Property type fit
- Budget fit
- Criteria fit
- Active pre-approval
- Active cash/verified funds badge
- Rating/reviews
- Profile freshness

Keep scoring server-side and covered by unit tests.

## 12. Compliance and Product Safety

Future agents must follow these rules:

- Do not build true escrow in v1.
- Do not hold earnest money in v1.
- Do not claim lending approval unless manually/admin verified.
- Do not expose buyer financial documents.
- Do not expose seller ownership documents.
- Do not create Fair Housing-risk filters.
- Do not build automated offer acceptance or automated transaction execution.
- Do not bypass third-party systems, CAPTCHAs, lender portals, identity checks, or escrow workflows.
- Do not store third-party credentials.
- Rate limit seller invites.
- Require admin review for sensitive trust badges.
- Keep the designer-made admin analytics dashboard out of customer-facing MVP scope.

Note: `AGENTS.md` now points future agents to these Liber-specific compliance rules.

## 13. Implementation Phases

### Phase 0: Product and engineering docs

Create:

- `docs/product/mvp-spec.md`
- `docs/product/user-flows.md`
- `docs/product/permissions.md`
- `docs/product/production-decisions.md`
- `docs/engineering/data-model.md`
- `docs/engineering/api-contracts.md`
- `docs/engineering/agent-tasks.md`
- `docs/engineering/implementation-audit.md`

Verify:

- Full v1 loop is documented.
- Deferred features are explicit.
- Badge, invite, role, and document rules are defined.

### Phase 1: Scaffold

Build:

- Next.js app
- TypeScript
- Tailwind/component primitives
- Prisma/Supabase wiring
- Zod validators
- Base layout/nav

Verify:

- App boots locally.
- Typecheck passes.
- Database migration runs.

### Phase 2: Auth and roles

Build:

- Signup/login
- Role selection
- Buyer/seller/admin route protection
- Server-side role checks

Verify:

- Unauthenticated users redirect.
- Buyer cannot access seller-only mutations unless also seller.
- Seller cannot access admin routes.
- Admin role cannot be self-assigned.

### Phase 3: Buyer profile

Build:

- Buyer profile form
- Criteria forms
- Avatar upload
- Public profile page
- Badge display
- Visibility status

Verify:

- Buyer can create/edit profile.
- Active profile appears in seller search.
- Hidden/draft profile does not appear.
- Badge expiration displays correctly.

### Phase 4: Seller search

Build:

- Map/list layout
- Buyer cards
- Filters
- Sort
- Buyer profile navigation

Verify:

- Search by city/geography works.
- Filters narrow results correctly.
- Map/list results match.

### Phase 5: Property and invite

Build:

- Seller property create/edit
- Property image upload
- Ownership document upload
- Invite form
- Invite status
- Buyer notification
- Invite email

Verify:

- Seller can create property.
- Seller can invite active buyer.
- Buyer receives notification/email.
- Seller cannot invite using property they do not own.

### Phase 6: Internal admin verification

Build:

- User list
- Document review
- Badge grant/revoke
- Profile moderation
- Invite abuse view
- Audit log

Verify:

- Admin can approve/reject documents.
- Admin can grant/revoke badges.
- Expired badges no longer affect search.
- Audit log records sensitive actions.
- Internal admin routes are not visible in customer navigation.

### Phase 7: Monetization design only

Do after the core loop works.

Design:

- Buyer visibility upgrades
- Seller invite credits
- Seller subscriptions
- Lender referral monetization

Verify:

- No escrow or money custody is included.

## 14. Agent Orchestration

Use `AGENTS.md`.

CTO:

- Defines success criteria
- Keeps scope tight
- Delegates only when useful
- Reviews all outputs
- Rejects speculative features

Planner:

- Produces short plan, files touched, acceptance criteria, and checks

Implementer:

- Makes smallest working change
- Touches only assigned files
- Does not invent product rules

Reviewer:

- Reviews correctness, simplicity, scope, unused code, missing tests, and security/privacy issues

Test Runner:

- Runs narrow checks matching risk
- Recommends tests if runtime dependencies are missing

Product/Compliance Reviewer:

- Applies the Liber compliance rules in section 12

Important: one agent should not free-build across the whole repo. Every task needs file ownership and acceptance criteria.

## 15. First Build Tasks

Do not start with "build the whole app."

Start here:

1. Create product and engineering docs under `docs/`.
2. Scaffold app/packages.
3. Define Prisma schema and migrations.
4. Implement auth and roles.
5. Implement buyer profile vertical slice.
6. Implement seller search vertical slice.
7. Implement property + invite vertical slice.
8. Implement admin verification.
9. Design monetization after the core loop works.

## 16. Ask CEO / Designer For

Before high-fidelity UI work, ask for:

- Original Figma file link with view/dev access
- Clickable prototype
- Logo, colors, fonts, icons
- Component library/design system
- Desktop/mobile breakpoint expectations
- Exact MVP scope versus later phases
- First launch city/market
- Badge verification rules
- Pre-approval renewal workflow
- Earnest money legal/payment assumptions
- Seller invite limits
- Whether ownership verification is required before invites
- Public/private buyer profile fields
- Legal/compliance assumptions already reviewed by counsel
- Monetization model

The Figma file helps polish UI. The product rules are required before production logic.
