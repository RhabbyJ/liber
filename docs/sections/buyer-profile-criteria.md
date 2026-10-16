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
- `apps/web/server/buyer/commands.ts`
- `apps/web/server/buyer/commands.test.ts`
- `apps/web/server/domain/buyer-profile.ts` and `buyer-projection.ts` — owner profile read and owner/admin projection
- `apps/web/server/domain/seller-directory.ts` — approved-seller search and profile reads
- `apps/web/server/contracts.ts` — `"use server"` re-export barrel for the domain modules
- `apps/web/app/messages/**`
- `apps/web/server/buyer/read-models.ts`
- `apps/web/lib/buyer-dtos.ts`

## Invariants

- Draft/hidden/suspended profiles must not appear in seller search.
- Buyers can pause a live profile and republish it later with the existing visibility states only: pause sets `DRAFT`, republish sets `ACTIVE` (`setBuyerProfileVisibility` in `server/buyer/commands.ts`, serialized on the owner row like profile saves). Republish re-validates the stored profile with `publicationGap` (`server/buyer/publication.ts`: purchase/seeking type, both budget bounds, one criteria row, and one active buyer-selected area in an active market). A saved draft that passes those rules shows as **Paused** with a Republish button; anything else reopens the setup form. Admin-controlled `HIDDEN`/`SUSPENDED` profiles cannot be paused or republished. Pause and republish are audited (`pause_buyer_profile`, `republish_buyer_profile`).
- Pausing is a loss of buyer eligibility, so the `messaging_buyer_visibility_loss` trigger closes the buyer's open invite conversations read-only and they stay read-only after republish; open invites are hidden from the buyer while paused. The pause confirmation says so. Keeping conversations open across a pause would need a schema change.
- Conversation identity for both parties uses the limited name and stable account code; full account names and contact details never enter messaging DTOs.
- Buyer invite cards show Decline, a 500-character question, request a tour, and
  Start LOI while status is Sent or Viewed, plus a 48-hour response note.
  After a response, the primary action is Open conversation; repeating the
  same response is a no-op instead of a hard error page.
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
- Buyer setup is one form on `/buyer/profile`: private generated identity, budget/basics, optional size/preferences, and one required target-area interaction. Criteria save in the same submit as the profile.
- After publish, the buyer profile summary stacks identity, general information,
  a full-width pre-approval callout, and verified badges so the financing box
  does not crowd or cover profile details.
- The verified-signup handoff names buyer profile setup as the next stage and shows the buyer where they are in the account -> profile -> seller-visible sequence; it must not ask for role intent again.
- Expected profile input/publication errors return inline without clearing entered fields. Unexpected server or database failures must still fail closed through the application error boundary.
- Profile, canonical service-area selection, visibility activation, and criteria must commit atomically; a partial save must not publish stale or mismatched buyer demand.
- The profile form publishes a complete snapshot. Blank optional profile and criteria controls write explicit database nulls; `undefined` would silently retain the previous Prisma value. Numeric zero remains a submitted value, and unchecked amenities become an empty array. This applies to draft saves too.
- The database must enforce exactly one criteria row per buyer unless an approved product change introduces named alternative criteria sets.
- Concurrent buyer saves serialize on the immutable Auth UUID owner row before
  looking up or creating a profile, and recheck that the application User is
  ACTIVE with the BUYER role under that lock on every serializable retry. The last
  committed save must be internally consistent across profile, criteria,
  derived location, selection, and visibility rather than mixing fields from
  two submissions.
- Activation fails unless the exact owning UUID has one criteria row and one active primary `SELECTED` service area. Ownership filters belong on reads and writes, not only in the form payload.
- Buyer info uses allowlisted purchase type values (`Cash`, `Conventional financing`, `Other`) and allowlisted seeking property type values (`House`, `Condo`, `Townhouse`, `Manufactured`, `Land`). The persisted fields are still `buyerType` and `buyingPurpose` for schema compatibility.
- Buyer desired location is exactly one primary service-area UUID in an active market. Active profiles require a buyer-confirmed `SELECTED` row.
- Target-area entry shows a debounced dropdown of active city, neighborhood, and ZIP suggestions as the buyer types. Clicking an option or choosing it with Arrow keys and Enter immediately selects its canonical slug; editing or clearing the text clears that selection. Escape/outside focus closes the dropdown, and stale responses cannot replace a newer query or selection.
- Profile saves resolve market + slug on the server and derive location text, city, neighborhood, postal code, state, and approximate coordinates from the canonical service-area row. Client copies of those fields are not authoritative.
- Clearing the canonical selection clears derived fields and moves a buyer-controlled active profile to draft; unsupported or inactive-market selections cannot activate.
- Buyer verification upload UI appears only after the buyer has submitted the profile; draft setup should not show the pre-approval card.
- Buyer setup uses a two-handle purchase-budget slider with the Zillow list-price scale: $0, $50k, then $25k steps to $500k, $50k to $1M, $100k to $2M, $250k to $5M and $1M to $10M. Required editable Min/Max boxes retain exact custom, decimal, zero and high saved budgets; slider indices are never submitted. New profiles remain blank until chosen. Moved handles cannot cross; reversed typed values show an inline hint. Down-payment and size controls retain their existing increments.
- Buyer profile purpose is purchase-only; do not add rental/tenant intent to signup, profile, criteria, or seller-search surfaces.
- Full surnames remain private. Server projections derive first name, last initial, and stable code from database-controlled identity before serialization.
- Buyer create/update schemas never expose public label or code editing; the server derives both.
- Avatar color customization is independent of the criteria form and appears on the saved profile summary. Identity/code stays fixed.
- Initials avatars render as text. Required allowlisted legacy avatarVariant tokens remain color preferences; the saved profile picker shows eight colors.
- `/buyer/criteria` redirects to the profile form for old links; there is no separate criteria onboarding flow.

## Agent notes

Keep buyer profile UX focused on becoming searchable and trusted. Do not add public SEO profile behavior; limited preview cards are allowed only to support pre-signup marketplace understanding.

The constraint and deferred-trigger SQL in `packages/db/prisma/proposals/buyer-profile-atomicity.sql` is reserved for `00018`; reservation is not deployment authorization. Source-shape tests are not database proof; the integrated publication service must pass the disposable two-connection harness.


## Limited name identity

Buyer, seller, and combined-role signup collect a full name (first and last required; up to 160 characters). Public identity is first name + last initial + a stable 12-character uppercase hexadecimal account code, for example Julie P. #7C4E2A91B6D0. The code is a truncated SHA-256 digest of the immutable random Auth UUID with a Liber namespace; it is not authentication proof or a database uniqueness constraint. Codes do not reveal the UUID and have no current-account collisions in the release read-only check. Both new and existing accounts use this limited identity in profiles, public previews, approved seller search, invites, and both sides of messaging. Legacy invalid/nameless accounts show Member plus code. Full surnames and contact information stay private except existing authorized LOI party disclosures. Raw account names and UUIDs remain server-side; only the limited label enters public DTOs. Signup shows an initials preview; the final code is assigned from the created account identity. Initials avatars render as text in the app; no name is sent to an external avatar service. Existing avatarVariant tokens remain a backward-compatible color preference, with eight muted colors in the picker. Public labels/codes cannot be edited or shuffled by clients. No schema, role, authorization, RLS, document, or frozen LOI calculation changes.

Owner/admin/seller profile DTOs and limited public previews may display the enabled demo’s separate self-test pre-approval marker. Owner financing readiness stays evidence-backed. Cards keep the explicit unverified marker visible alongside any real approval, and limited public previews expose only its label, without audit or account identifiers.
