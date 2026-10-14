# Section: Public Preview and Privacy

## Purpose

Owns the homepage demand preview, pre-approval seller list, public-safe buyer projection,
approximate pins, and the boundary between public teaser data and approved
seller data.

## Main files

- `apps/web/app/page.tsx`
- `apps/web/components/public-demand-map.tsx`
- `apps/web/components/public-map-location-search.tsx`
- `apps/web/server/buyer-preview.ts`
- `apps/web/server/buyer/read-models.ts`
- `apps/web/lib/buyer-dtos.ts`
- `apps/web/server/contracts.ts`
- `apps/web/app/api/seller/buyers/route.ts`
- `apps/web/app/api/markets/[slug]/boundaries/route.ts`
- `apps/web/app/api/service-areas/**/route.ts`

## Invariants

- Public preview is a small teaser, not unauthenticated buyer search or public
  buyer profiles.
- Guests receive at most four eligible preview records. A validated signed-in
  user receives all otherwise eligible previews through the same narrow DTO,
  with their own buyer profile excluded by server-side Auth UUID predicate.
- Every audience can filter and sort the shared map; guests stay capped at 4
  preview cards with no paging. Authentication changes only preview count and
  paging. It does not authorize seller search, full buyer profiles, contact
  actions, or additional fields. Previews exclude blocked relationships.
- Every audience may see first name, last initial, stable account code, and initials avatar. Never expose a full surname or photograph.
- Sellers awaiting, denied, missing or suspended full-directory approval see the same signed-in preview DTO on the shared map with their review state shown inline.
- Preview results have no buyer routing IDs, profile links, contact controls, or invite actions and never call the approved seller search contract (`searchBuyers`); they reuse only its id query (`querySellerSearchIds`) and project through the preview `select`.
- The homepage stays map-first. Compact orientation copy, persistent navigation, and role-aware next-step CTAs may clarify the experience, but must not turn it into a separate marketing hero or expand the preview data contract.
- Public and seller responses use dedicated Prisma `select` projections. Do not
  load a broad internal buyer object and sanitize it after serialization.
- Never serialize Auth UUIDs, buyer routing IDs, internal criteria/service-area
  IDs, raw buyer coordinates, private account names, contact data, documents,
  Storage paths, or inactive badges to public clients.
- Public geography responses use market/service-area slugs and immutable geometry hashes. County/city/ZCTA display features contain only kind, slug, label, and geometry.
- Public visibility requires an active application user, active buyer profile,
  active canonical service area, and an explicit preview-safe eligibility rule.
- Public property labels normalize to the approved property types or a generic
  buyer label. Active-profile criteria cardinality is enforced at the database
  boundary. Only allowlisted condition/amenity values enter the public DTO:
  conditions reuse the seller-search validator (Move-in ready, Mild fixer, Fixer),
  and unsupported free text is omitted for both guests and signed-in previews.
- Approximate pins are calculated server-side from the canonical service-area
  center without coordinate offsets. Client code never receives raw buyer coordinates.
  A selected search area filters results without overriding each buyer's target center.
- Identical area centers share a count marker and a popup containing every
  matching preview. Filtering or sorting never changes the geographic position.
- Hovering or keyboard-focusing a preview card highlights the matching
  area marker (shared when several previews target the same center); it does not expose additional data or move the map.
- Serialized-response and recursive forbidden-field assertions cover the
  homepage, seller search API, and shared seller read model; preserve them
  when a contract changes. Route test fixtures must use the live response type.

## Response contracts

- Public preview: `{ alias, avatarVariant, label, area, budgetLabel,
  bedroomsMin?, bathroomsMin?, squareFeetMin?, condition?, amenities, badges,
  pin? }`.
- Seller search uses `SellerBuyerSummaryDTO`: the routing `id`, generated
  limited identity in `name`/`avatarSeed`, allowlisted color preference, approved display fields
  (`bio`, geography labels/slugs, purchase/property types, budget/down-payment
  ranges, criteria, needs/wants, active badges, refreshed date), approximate
  canonical-area `lat`/`lng`, and server-derived `canInvite`/`isDemo` flags.
- Seller-view profile uses the same projection; `getAuthorizedBuyerProfile`
  adds `viewerCanInvite` and `viewerIsOwner` after server authorization.

`id` is the seller-authorized buyer routing identifier, never an Auth UUID.
`name` contains only the limited identity and code, never the full private account name. Auth UUIDs and
internal criteria/service-area identifiers are not part of any contract.
Browser components import these response types only from
`apps/web/lib/buyer-dtos.ts`; Prisma projections and mapping remain
server-only.

## Agent notes

DTO privacy work does not own seller ranking/pagination, geography import, Auth
lifecycle, or visual redesign. Coordinate those contracts before UI polish.


## Limited name identity

Buyer, seller, and combined-role signup collect a full name (first and last required; up to 160 characters). Public identity is first name + last initial + a stable 12-character uppercase hexadecimal account code, for example Julie P. #7C4E2A91B6D0. The code is a truncated SHA-256 digest of the immutable random Auth UUID with a Liber namespace; it is not authentication proof or a database uniqueness constraint. Codes do not reveal the UUID and have no current-account collisions in the release read-only check. Both new and existing accounts use this limited identity in profiles, public previews, approved seller search, invites, and both sides of messaging. Legacy invalid/nameless accounts show Member plus code. Full surnames and contact information stay private except existing authorized LOI party disclosures. Raw account names and UUIDs remain server-side; only the limited label enters public DTOs. Signup shows an initials preview; the final code is assigned from the created account identity. Initials avatars render as text in the app; no name is sent to an external avatar service. Existing avatarVariant tokens remain a backward-compatible color preference, with eight muted colors in the picker. Public labels/codes cannot be edited or shuffled by clients. No schema, role, authorization, RLS, document, or frozen LOI calculation changes.
