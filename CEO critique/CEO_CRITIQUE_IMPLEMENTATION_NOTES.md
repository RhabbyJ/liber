# Liber CEO Critique Implementation Notes

Source images: `IMG_4830.jpg` through `IMG_4836.jpg`

Purpose: convert the CEO's handwritten review notes into a clean implementation brief. This document is intentionally written for a future implementation pass, not as code.

## Executive Direction

The CEO is pushing the product toward a simpler residential-first marketplace flow:

- Keep the core idea: sellers browse buyer demand, mostly through a map/list experience.
- Make the first version residential-focused. Hold commercial buyer criteria for later.
- Replace many numeric/free-text fields with dropdowns or constrained choices.
- Hide sensitive or unnecessary details from public seller-facing views.
- Make buyer badges feel like useful profile extensions, especially pre-approval and cash-buyer status.
- Make seller property entry feel like a private invite tool, not a public listing workflow.

## High-Priority Product Changes

1. Remove commercial buyer criteria from v1 buyer onboarding/profile setup.
   - Hold off on multifamily, retail, STNL, industrial, office, cap rate, vacancy, units, and similar commercial criteria.
   - Keep the data model capable of supporting commercial later, but hide these UI paths for now.

2. Convert buyer criteria inputs into dropdowns.
   - Budget min/max should be dropdowns.
   - Down payment min/max should be dropdowns.
   - Property type should be a dropdown or simplified residential selector.
   - Buying purpose should be a dropdown.
   - Suggested buying-purpose options:
     - Owner occupy
     - Rental
     - Fix and flip
     - Other

3. Simplify seller search filters.
   - The current detailed filter grid is too heavy.
   - Remove or collapse advanced fields from the default seller search view.
   - Seller search should feel like browsing buyer demand first, not filling out a complex form.

4. Keep and improve the map/list seller browsing experience.
   - CEO liked the map/list concept.
   - Seller can browse buyers on a map.
   - Buyer details should be withheld until appropriate.
   - Seller should not be able to invite/message unless they are in the proper seller workflow.

5. Make seller property entry private.
   - The seller's property is not a public listing.
   - Property details are only visible to buyer profiles the seller chooses to invite.
   - Add explanatory copy near the property flow:
     > Your property is private and only shared with buyers you invite.

6. Hide latitude and longitude fields from seller property forms.
   - They should be stored internally only.
   - Users should never manually edit raw coordinates.

7. Rename optional price to asking price.
   - Current label: `Optional price`
   - Preferred label: `Asking price`

8. Rework buyer badge page into a clearer buyer trust/qualification flow.
   - Badges may become an extension of the buyer profile.
   - Pre-approval and cash-buyer status should be central.
   - The page should explain why a buyer should do this.
   - Suggested explanation:
     > A pre-approval shows sellers you are a capable buyer and can generate more invitations from serious sellers.
   - Add/prefer action paths:
     - Get pre-approved
     - I am already pre-approved
     - Cash buyer
   - Consider linking `Get pre-approved` to a future lender/pre-approval portal.

## Page-by-Page Notes

### 1. Home Page

CEO notes:

- Hero direction is generally approved.
- Consider adding a large `Browse Buyers` button.
- Question from CEO: would a large browse button help engage visitors?

Implementation interpretation:

- Add a prominent seller-oriented CTA in the hero, likely `Browse Buyers`.
- The CTA should route to a seller browse/search experience.
- Do not make it feel like a public listing portal.
- Keep the existing seller/buyer role selector unless a future redesign replaces it.

Open question:

- Should anonymous visitors be allowed to browse approximate buyer demand, or should `Browse Buyers` require login?

Recommended v1 answer:

- Allow a limited browse preview from the home page, but withhold buyer details and invite/message actions until login.

### 2. Buyer Profile Builder

CEO notes:

- Remove draft-style friction.
- Keep basic profile details.
- No commercial for now.
- Convert budget/down-payment fields into dropdowns.
- Convert buying purpose into dropdown.
- Suggested purposes: owner occupy, rental, fix and flip, other.
- The preview card should not show commercial criteria for now.

Implementation interpretation:

- Buyer setup should create an active buyer profile after submission.
- Remove commercial criteria from this page.
- Replace free-entry money fields with fixed ranges.
- Keep buyer type simple, likely a dropdown:
  - Home buyer
  - Investor
  - Cash buyer
  - Agent/representative, only if needed later

Suggested dropdown ranges:

- Budget:
  - Under $500k
  - $500k-$750k
  - $750k-$1M
  - $1M-$1.5M
  - $1.5M-$2M
  - $2M+
- Down payment:
  - Under $100k
  - $100k-$250k
  - $250k-$500k
  - $500k-$1M
  - $1M+

### 3. Buyer Criteria Page

CEO notes:

- Use dropdowns heavily.
- Hold off on all commercial fields for v1.
- `Submit search` / saved search concept is a good idea.
- AI may later study buyer text and cross-reference seller descriptions.
- Keep location picker/map.

Implementation interpretation:

- Rename this flow from a generic criteria editor into a saved search/intake flow.
- Suggested label:
  - `Save Search Criteria`
  - or `Save Buyer Criteria`
- Remove commercial-only fields:
  - cap rate
  - vacancy
  - units
  - zoning
  - year built, unless used residentially
  - commercial property tabs
- Keep residential fields:
  - city/ZIP/area
  - budget range
  - bedrooms
  - bathrooms
  - square feet range
  - lot size range
  - condition
  - features
  - buying purpose

Future AI note:

- Store buyer free-text needs/wants cleanly because future matching can compare buyer descriptions to seller property descriptions.
- Do not build AI matching yet; just structure the data so it can be used later.

### 4. Role / Both-Sides Page

CEO notes:

- The `Use both sides` concept may be valid, but needs discussion.
- CEO marked it as a question rather than a clear approval.

Implementation interpretation:

- Keep buyer and seller role paths.
- Do not over-emphasize `both` until the workflow is clearer.
- If `both` remains, explain it plainly:
  > Use both if you want to create a buyer profile and also search buyers as a seller.

Open question:

- Should new users choose only one starting role, then add the other later from account settings?

Recommended v1 answer:

- Use one starting role during onboarding.
- Allow adding the other role later from `My Account`.

### 5. Seller Search / Browse Buyers

CEO notes:

- The map/list section is good.
- CEO was thinking of a browse option on the home page or seller landing page.
- Sellers can browse buyers on a map.
- Buyer details are withheld until later.
- Seller cannot invite or message from a public/preview browse state.
- Property listing is not made public.
- Listing is only visible to buyer profiles the seller chooses to invite.
- The `Add My Property Details` language should become more seller/property-listing oriented.

Implementation interpretation:

- Create two seller search modes:
  - Browse preview: limited buyer map/list, no private buyer details, no invite/message.
  - Authenticated seller search: buyer cards plus invite workflow.
- Replace `Add My Property Details` with clearer copy:
  - `List My Property`
  - or `Add Private Property`
- Add privacy helper text:
  > This is not a public listing. Your property is only shown to buyers you invite.

Filter cleanup:

- Default seller search should not show every technical field.
- Keep only:
  - area/ZIP
  - property type
  - budget range
  - bedrooms/bathrooms, if needed
  - badges, if needed
- Move the rest into `All Filters` or remove for v1.

### 6. Seller Property Details

CEO notes:

- Rename price field to asking price.
- Remove/hide latitude and longitude.
- Property images are good.
- Ownership verification is good.

Implementation interpretation:

- Rename `Optional price` to `Asking price`.
- Coordinates should only be populated by geocoding, never manually shown.
- Keep property image upload.
- Keep ownership verification upload.
- Add property privacy copy:
  > This private property profile is used only for matching and invites.

Suggested field order:

1. Property type
2. Address
3. City/state/ZIP
4. Asking price
5. Beds/baths
6. Square feet / lot size
7. Garage area
8. Condition
9. Features
10. Description
11. Property images
12. Ownership verification

### 7. Buyer Badges / Verification

CEO notes:

- Badges may be an extension of buyer profile.
- Current admin-review framing may need refinement.
- Keep trust badge expiration/admin review idea.
- Add clear buyer-facing choices:
  - Get pre-approved
  - Cash buyer
  - I am already pre-approved
- Explain why the badge matters.
- Possible lender/pre-approval portal later.

Implementation interpretation:

- Rename page or section from `Badges` to something more action-oriented:
  - `Buyer Verification`
  - `Strengthen Your Buyer Profile`
  - `Trust Badges`
- Do not lead with `Submit a document for admin review`.
- Lead with value:
  > Verified buyers stand out to sellers.
- Then show actions:
  - `Get pre-approved`
  - `Upload existing pre-approval`
  - `Verify cash buyer status`

Compliance copy:

- Include:
  > Pre-approval is not a loan approval. Final loan approval is subject to lender review, underwriting, property review, and other conditions.

## Keep

- Hero concept and general brand direction.
- Home-page role selector, unless replaced by a browse CTA.
- Seller map/list concept.
- Property image upload.
- Ownership verification upload.
- Trust badges after admin/manual review.
- Badge expiration concept.
- Residential buyer demand marketplace positioning.

## Change

- Replace free-text numeric buyer criteria with dropdowns.
- Hide raw lat/lng fields.
- Rename `Optional price` to `Asking price`.
- Make property sharing privacy explicit.
- Reframe badge page around buyer value, not admin document handling.
- Use `List My Property` or `Add Private Property` instead of vague property detail language.

## Remove / Defer

- Commercial buyer criteria in v1.
- Cap rate, vacancy, units, zoning, and related commercial fields in visible v1 UI.
- Public visibility of seller property listings.
- Invite/message actions from anonymous browse mode.
- Raw coordinate inputs.

## Open CEO Questions

1. Should anonymous visitors be able to browse approximate buyer demand from the home page?
2. Should `Use both sides` remain in onboarding, or should users start as buyer or seller and add the other role later?
3. Should the home hero CTA be `Browse Buyers`, `Search Buyers`, or `Meet Buyers Near You`?
4. For badges, should `Get pre-approved` link to a lender/pre-approval portal now, or stay as a placeholder until a lender workflow exists?
5. Should seller property CTA say `List My Property` even though the property is private, or should we use `Add Private Property` to avoid confusion?

## Recommended Implementation Order

1. Clean buyer onboarding/profile UI.
   - Remove commercial fields from visible buyer flow.
   - Add dropdowns for budget, down payment, property type, and buying purpose.

2. Clean seller search.
   - Simplify default filters.
   - Add privacy explanation.
   - Rename property CTA.

3. Clean seller property form.
   - Hide coordinates.
   - Rename asking price.
   - Add private-property helper copy.

4. Rework badge page.
   - Reframe as buyer verification.
   - Add pre-approval/cash-buyer action cards.
   - Add compliance copy.

5. Add limited home-page browse CTA.
   - Route to seller browse/search.
   - Withhold details and actions until login.

