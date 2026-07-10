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
- `apps/web/server/ownership-evidence.ts`

## Invariants

- Seller properties are private invite context, not public listings.
- Property creation requires `ownershipConfirmed` (validated in `createSellerPropertySchema`); the confirmation is audited but is not a substitute for admin-reviewed ownership evidence.
- Seller property type choices are the v1 buyer-demand choices: house (`HOME` legacy enum value), condo, townhouse, manufactured, and land.
- Seller ownership verification requires two private evidence uploads before admin approval: government-issued photo ID and utility/tax/mortgage proof matching the property address.
- Ownership approval is bound to a property identity/version. Editing address, ZIP, coordinates, or another ownership-relevant field increments the version and returns the property to `PENDING`; prior evidence remains audit history only.
- The seller owner UUID is immutable in V1. Evidence upload rechecks the exact owner and the version observed before Storage upload; a changed property rejects the binding and triggers best-effort object cleanup.
- Seller can invite only from owned properties.
- Seller cannot invite their own buyer profile.
- Invite is manual outreach only.
- Invite response does not create an offer, escrow, or transaction.
- Expired invites are rejected whenever they are read or used, even if the maintenance job has not updated their stored status yet; response writes use the database clock.
- Invite creation is serialized per seller and the database permits only one `SENT`/`VIEWED` invite for the exact seller, buyer profile, and property; stale expired rows are closed before reuse.

## Agent notes

Keep legal/safety disclaimer near invite send and response actions, and keep the illegal-ownership-claim disclaimer next to the ownership confirmation checkbox on property creation.
