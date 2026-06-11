# Section: Seller Properties and Invites

## Purpose

Owns private seller property records, property images, ownership evidence upload, invite creation, sent invites, and seller notifications.

## Main files

- `apps/web/app/seller/properties/page.tsx`
- `apps/web/app/seller/properties/new/page.tsx`
- `apps/web/app/seller/properties/[propertyId]/edit/page.tsx`
- `apps/web/app/seller/invite/[buyerProfileId]/page.tsx`
- `apps/web/app/seller/invites/page.tsx`
- `apps/web/app/seller/notifications/page.tsx`
- `apps/web/components/property-address-lookup.tsx`
- `apps/web/server/contracts.ts`
- `apps/web/server/form-actions.ts`

## Invariants

- Seller properties are private invite context, not public listings.
- Property creation requires `ownershipConfirmed` (validated in `createSellerPropertySchema`); the confirmation is audited but is not a substitute for admin-reviewed ownership evidence.
- Seller can invite only from owned properties.
- Invite is manual outreach only.
- Invite response does not create an offer, escrow, or transaction.

## Agent notes

Keep legal/safety disclaimer near invite send and response actions, and keep the illegal-ownership-claim disclaimer next to the ownership confirmation checkbox on property creation.
