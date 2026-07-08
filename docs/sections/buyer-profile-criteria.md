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

## Invariants

- Draft/hidden/suspended profiles must not appear in seller search.
- Full buyer profiles are not public pages.
- Public pre-signup buyer previews must be limited, privacy-safe teaser cards only (`apps/web/server/buyer-preview.ts`).
- Buyer documents are never shown to sellers.
- Criteria should describe property fit, not protected-class attributes.
- Amenity needs use canonical feature tokens (Pool, Parking, ADU, Yard, Garage) so seller amenity filters can match; condition uses Move-in ready / Mild fixer / Fixer.
- Buyer setup is one form on `/buyer/profile`: buyer info, criteria, size, details, and location. Criteria save in the same submit as the profile.
- Budget and down payment ranges accept custom numeric dollar amounts; the UI must not force fixed increments before submit.
- Buyer profile purpose is purchase-only; do not add rental/tenant intent to signup, profile, criteria, or seller-search surfaces.
- Buyer account names are private to the buyer portal. Seller/public surfaces must use the generated `BuyerProfile.displayName` alias, not `User.name`, and buyers must not be able to type arbitrary public names.
- Buyer profile create/update input schemas must not expose `displayName`; alias changes go through the dedicated regenerate server action.
- Buyer avatars are generated 2D animal avatars from allowlisted `User.avatarVariant` tokens. Only the token is stored; no avatar image file or URL is stored.
- `/buyer/criteria` redirects to the profile form for old links; there is no separate criteria onboarding flow.

## Agent notes

Keep buyer profile UX focused on becoming searchable and trusted. Do not add public SEO profile behavior; limited preview cards are allowed only to support pre-signup marketplace understanding.
