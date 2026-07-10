# Section: Public Preview and Privacy

## Purpose

Owns the unauthenticated homepage demand preview, public-safe buyer projection,
approximate pins, and the boundary between public teaser data and approved
seller data.

## Main files

- `apps/web/app/page.tsx`
- `apps/web/components/public-demand-map.tsx`
- `apps/web/components/public-map-location-search.tsx`
- `apps/web/server/buyer-preview.ts`
- `apps/web/server/buyer-dtos.ts`
- `apps/web/lib/buyer-dto-types.ts`
- `apps/web/server/contracts.ts`
- `apps/web/app/api/seller/buyers/route.ts`

## Invariants

- Public preview is a small teaser, not unauthenticated buyer search or public
  buyer profiles.
- Public and seller responses use dedicated Prisma `select` projections. Do not
  load a broad internal buyer object and sanitize it after serialization.
- Never serialize Auth UUIDs, internal criteria/service-area IDs, raw buyer
  coordinates, names, contact data, documents, Storage paths, or inactive
  badges to public clients.
- Public visibility requires an active application user, active buyer profile,
  active canonical service area, and an explicit preview-safe eligibility rule.
- Preview-safe eligibility requires allowlisted purchase/property types and at
  least one criteria row. Only allowlisted condition/amenity values are copied
  into the public DTO.
- Approximate pins are calculated server-side from the canonical service-area
  center plus a deterministic privacy offset. Client code never receives raw
  buyer coordinates.
- Add serialized-response snapshots and recursive forbidden-field assertions
  for the homepage, seller search API, and seller-view buyer profile.

## Response contracts

- Public preview: `{ label, area, budgetLabel, bedroomsMin?, bathroomsMin?,
  squareFeetMin?, condition?, amenities, badges, pin? }`.
- Seller search buyer: `{ buyerProfileId, alias, avatarVariant?, purchaseType,
  propertyType, location, budgetMin, budgetMax, downPaymentMin,
  downPaymentMax, criteria, badges, mapPoint, refreshedAt, canInvite }`.
- Seller-view profile: `{ buyerProfileId, alias, avatarVariant?, purchaseType,
  propertyType, location, budgetMin, budgetMax, downPaymentMin,
  downPaymentMax, needs, wants, badges, viewerCanInvite,
  viewerIsOwner }`.

`buyerProfileId` is the seller-authorized routing identifier. Auth UUIDs and
internal criteria/service-area identifiers are not part of any contract.
Browser components import these response types only from
`apps/web/lib/buyer-dto-types.ts`; Prisma projections and mapping remain
server-only.

## Agent notes

DTO privacy work does not own seller ranking/pagination, geography import, Auth
lifecycle, or visual redesign. Coordinate those contracts before UI polish.
