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
- New-property creation begins with a focused street-address and active-ZIP lookup, then keeps the complete review, matching context, and ownership attestation form available below. Lookup never creates or saves a property; only the final `Save private property` server action does.
- Property creation requires `ownershipConfirmed` (validated in `createSellerPropertySchema`); the confirmation is audited but is not a substitute for admin-reviewed ownership evidence.
- Seller property type choices are the v1 buyer-demand choices: house (`HOME` legacy enum value), condo, townhouse, manufactured, and land.
- Seller ownership verification requires two private evidence uploads before admin approval: government-issued photo ID and utility/tax/mortgage proof matching the property address.
- Ownership approval is bound to a property identity/version. Editing address, ZIP, coordinates, or another ownership-relevant field increments the version and returns the property to `PENDING`; prior evidence remains audit history only.
- Seller can invite only from owned properties.
- Seller cannot invite their own buyer profile.
- Invite is manual outreach only.
- Invite response does not create an offer, escrow, or transaction.
- Expired invites are rejected whenever they are read or used, even if the maintenance job has not updated their stored status yet.
- Only current `READY_FOR_INVITES` properties can send invites. Invite quota means the preceding rolling 24 hours, not a calendar day.
- Property images are private. The owner/admin may view them; invited buyers may view them only while invite status is `SENT`, `VIEWED`, or `ACCEPTED`.
- Identity-relevant property edits increment `identityVersion`, reset ownership approval, and preserve prior versioned evidence for audit only.
- Identity changes clear the seller attestation and withdraw `SENT`, `VIEWED`, and `ACCEPTED` invites. The seller must explicitly re-attest to the new version.
- Property images and invites carry `propertyIdentityVersion`; invited buyers never receive mismatched images or invite details.
- Invited-buyer image authorization is centralized in the database and also requires active buyer/seller state plus a current approved, unflagged, ready property.

## Agent notes

Keep legal/safety disclaimer near invite send and response actions, and keep the illegal-ownership-claim disclaimer next to the ownership confirmation checkbox on property creation.
