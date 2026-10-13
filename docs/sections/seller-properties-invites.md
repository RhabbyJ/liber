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
- `apps/web/components/seller-invite-form.tsx`
- `apps/web/server/invite-send-errors.ts`
- `apps/web/server/messaging/**`
- `apps/web/server/ownership-evidence.ts`

## Invariants

- Seller properties are private invite context, not public listings.
- New-property creation presents one scroll flow as `Address -> Details -> Confirm`: it begins with a focused street-address and active-ZIP lookup, then keeps the complete review, matching context, and ownership attestation form available below. Lookup never creates or saves a property; only the final `Save and continue` server action does.
- Property creation requires `ownershipConfirmed` (validated in `createSellerPropertySchema`); the confirmation is audited but is not a substitute for admin-reviewed ownership evidence.
- Seller property type choices are the v1 buyer-demand choices: house (`HOME` legacy enum value), condo, townhouse, manufactured, and land.
- Condition uses the shared Move-in ready / Mild fixer / Fixer dropdown. Property features use checkboxes for Pool, Fireplace, Garage, Parking, ADU, Yard, Single story, and Central air conditioning. Historical custom conditions and features remain selectable on edit; unchecking every feature clears the saved selections. The existing condition/features database fields remain the source of truth.
- Garage square footage is no longer collected, accepted by property writes, or included in property DTOs; historical database values remain untouched. Garage availability is a feature checkbox.
- Saved condition/features appear on owner property cards and the buyer's authorized, current-identity invite card. They remain private property context, not public listing data.
- Seller ownership verification requires two private evidence uploads before admin approval: government-issued photo ID and utility/tax/mortgage proof matching the property address.
- A separate admin-only synthetic test approval is available for the exact September 25 journey fixture while the existing private-preview flags are enabled. It preserves seller authority attestation and property-version gates, writes a distinct audit marker, and is truthfully labeled **Test approval — ownership not verified**. The server allows that property to invite only the designated fixture buyer; normal property invite rules and browser-denying Invite RLS remain in force. Revoke restores genuine evidence state. Property identity changes invalidate the override; old chat snapshots keep an invite-time test label without rewriting stored snapshots.
- Ownership approval is bound to a property identity/version. Editing address, ZIP, coordinates, or another ownership-relevant field increments the version and returns the property to `PENDING`; prior evidence remains audit history only.
- Property evidence upload finalization binds documents only to `propertyIdentityVersion`; legacy parallel ownership-version fields and triggers are not part of the supported flow.
- Saving edited property details returns the seller to the property list after the server commits the update; evidence uploads finalize independently when each file transfer completes.
- The owner-only property edit read returns canonical address lines, city, state, ZIP, and coordinates separately from presentation labels. The edit form preserves those values, including unit/suite and coordinate precision, so saving unrelated details does not invent an address or alter property identity.
- Seller can invite only from owned properties.
- Seller cannot invite their own buyer profile.
- Invite is manual outreach only.
- The HTML invite form's guided-template version is normalized from FormData text to an integer before strict validation; JSON messaging contracts remain numeric-only.
- Expected invite-send failures stay on the form with plain-language recovery guidance and preserved property/terms selections. Duplicates link to the existing seller-scoped conversation only after account, pair, ownership, and current-property checks and the messaging feature gate; otherwise they link to Sent invites. Unavailable buyers/blocks share generic copy. Unknown failures and framework redirects are rethrown, with the global error page displaying only the Next support digest, never internal error messages.
- Invite response does not create an offer, escrow, or transaction.
- Invite creation binds its queued email to the new invite row. The outbox must
  use the canonical invite reference and worker lease; retired generic
  recipient/UUID-lease artifacts are not part of this flow.
- A successful valid invite creates exactly one invite-scoped conversation,
  two authoritative participants, and the immutable rendered opening message.
- Accepted invites remain messageable; decline, effective expiry, withdrawal,
  property identity invalidation, and participant blocking disable sends.
- A block in either direction prevents a new invite and returns a generic
  unavailable result rather than disclosing the block.
- Expired invites are rejected whenever they are read or used, even if the maintenance job has not updated their stored status yet.
- Only current `READY_FOR_INVITES` properties can send invites. Invite quota means the preceding rolling 24 hours, not a calendar day.
- The invite page distinguishes no property from an existing property that is not invite-ready. Existing blocked properties show their ownership state and link back to the property record; the server-side invite gate remains unchanged.
- Property images are private. The owner/admin may view them; invited buyers may view them only while invite status is `SENT`, `VIEWED`, or `ACCEPTED`.
- Identity-relevant property edits increment `identityVersion`, reset ownership approval, and preserve prior versioned evidence for audit only.
- Identity changes clear the seller attestation and withdraw `SENT`, `VIEWED`, and `ACCEPTED` invites. The seller must explicitly re-attest to the new version.
- Property images and invites carry `propertyIdentityVersion`; invited buyers never receive mismatched images or invite details.
- Invited-buyer image authorization is centralized in the database and also requires active buyer/seller state plus a current approved, unflagged, ready property.

## Agent notes

Keep legal/safety disclaimer near invite send and response actions, and keep the illegal-ownership-claim disclaimer next to the ownership confirmation checkbox on property creation.
