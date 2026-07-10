# Section: Buyer Profile and Criteria

## Purpose

Owns buyer profile setup, searchable buyer demand, buyer criteria, buyer-side invite/notification views, and seller-view buyer profile presentation.

## Main files

- `apps/web/app/buyer/profile/page.tsx`
- `apps/web/app/buyer/criteria/page.tsx` (redirects to profile form)
- `apps/web/app/buyer/invites/page.tsx`
- `apps/web/app/buyer/notifications/page.tsx`
- `apps/web/app/buyers/[buyerProfileId]/page.tsx`
- `apps/web/components/buyer-profile-wizard.tsx`
- `apps/web/server/form-actions.ts`
- `apps/web/server/contracts.ts`
- `apps/web/server/buyer-dtos.ts`
- `apps/web/lib/buyer-dto-types.ts`

## Invariants

- Draft/hidden/suspended profiles must not appear in seller search.
- Full buyer profiles are not public pages.
- Public pre-signup buyer previews must be limited, privacy-safe teaser cards only (`apps/web/server/buyer-preview.ts`).
- Buyer documents are never shown to sellers.
- Seller-view profile responses use a dedicated projection/DTO and require an
  active owning User, active profile, active canonical service area, and active
  market. Auth UUIDs, internal criteria/service-area IDs, raw coordinates,
  contact data, documents, Storage paths, and inactive badges are excluded.
  `buyerProfileId` is intentionally exposed as the authorized routing ID.
- Criteria should describe property fit, not protected-class attributes.
- Amenity needs use canonical feature tokens (Pool, Parking, ADU, Yard, Garage) so seller amenity filters can match; condition uses Move-in ready / Mild fixer / Fixer.
- Buyer setup is one form on `/buyer/profile`: buyer info, criteria, size, details, and location. Criteria save in the same submit as the profile.
- Profile, canonical service-area selection, visibility activation, and criteria must commit atomically; a partial save must not publish stale or mismatched buyer demand.
- The profile form publishes a complete snapshot. Blank optional profile and criteria controls clear persisted values; they are not patch semantics.
- The database must enforce exactly one criteria row per buyer unless an approved product change introduces named alternative criteria sets.
- Concurrent buyer saves serialize on the immutable Auth UUID owner row. The last committed save must be internally consistent across profile, criteria, derived location, selection, and visibility rather than mixing fields from two submissions.
- Activation fails unless the exact owning UUID has one criteria row and one active primary `SELECTED` service area. Ownership filters belong on reads and writes, not only in the form payload.
- Buyer info uses allowlisted purchase type values (`Cash`, `Conventional financing`, `Other`) and allowlisted seeking property type values (`House`, `Condo`, `Townhouse`, `Manufactured`, `Land`). The persisted fields are still `buyerType` and `buyingPurpose` for schema compatibility.
- Buyer desired location is exactly one primary service-area UUID in an active market. Active profiles require a buyer-confirmed `SELECTED` row.
- Profile saves resolve market + slug on the server and derive location text, city, neighborhood, postal code, state, and approximate coordinates from the canonical service-area row. Client copies of those fields are not authoritative.
- Clearing the canonical selection clears derived fields and moves a buyer-controlled active profile to draft; unsupported or inactive-market selections cannot activate.
- Buyer verification upload UI appears only after the buyer has submitted the profile; draft setup should not show the pre-approval card.
- Budget, down payment, square-feet, and lot-size ranges accept custom numeric amounts; the UI must not force fixed increments before submit.
- Buyer profile purpose is purchase-only; do not add rental/tenant intent to signup, profile, criteria, or seller-search surfaces.
- Buyer account names are private to the buyer portal. Seller/public surfaces must use the generated `BuyerProfile.displayName` alias, not `User.name`, and buyers must not be able to type arbitrary public names.
- Buyer profile create/update input schemas must not expose `displayName`; alias changes go through the dedicated regenerate server action.
- Buyer avatars are generated 2D animal avatars from allowlisted `User.avatarVariant` tokens. Only the token is stored; no avatar image file or URL is stored.
- `/buyer/criteria` redirects to the profile form for old links; there is no separate criteria onboarding flow.

## Agent notes

Keep buyer profile UX focused on becoming searchable and trusted. Do not add public SEO profile behavior; limited preview cards are allowed only to support pre-signup marketplace understanding.

The constraint and deferred-trigger SQL is an unnumbered CTO integration proposal in `packages/db/prisma/proposals/buyer-profile-atomicity.sql`; do not copy it into an already assigned migration number without reconciling the stacked migration order. Source-shape tests are not database proof; the integrated publication service must pass the disposable two-connection harness.
