# Section: Buyer Profile and Criteria

## Purpose

Owns buyer profile setup, searchable buyer demand, buyer criteria, buyer-side invite/notification views, and seller-view buyer profile presentation.

## Main files

- `apps/web/app/buyer/profile/page.tsx`
- `apps/web/app/buyer/criteria/page.tsx`
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
- The profile wizard only activates a profile through the explicit confirmation step; the criteria form updates the existing criteria row instead of creating duplicates.

## Agent notes

Keep buyer profile UX focused on becoming searchable and trusted. Do not add public SEO profile behavior; limited preview cards are allowed only to support pre-signup marketplace understanding.
