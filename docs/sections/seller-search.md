# Section: Seller Search

## Purpose

Owns the core map-first seller workspace for finding matched buyers by geography, criteria, trust signals, buyer-demand pins, and synchronized buyer cards/list views.

## Main files

- `apps/web/app/seller/search/page.tsx`
- `apps/web/components/buyer-card.tsx`
- `apps/web/components/search-filters-sidebar.tsx`
- `apps/web/components/view-toggle.tsx`
- `apps/web/components/buyer-map.tsx`
- `apps/web/components/interactive-buyer-map.tsx`
- `apps/web/components/static-buyer-map.tsx`
- `apps/web/server/contracts.ts`
- `apps/web/server/buyer-dtos.ts`
- `apps/web/lib/buyer-dto-types.ts`
- `apps/web/server/seller-search-query.ts`
- `apps/web/server/service-areas.ts`

## Invariants

- Requires approved seller access.
- Approved sellers land on the map view by default (`view=list` opts out); buyer cards render below the map from the same result set.
- List and map use the same `items` from one paginated query contract; neither consumer performs its own filtering or sorting.
- Map pins show coarse budget labels for buyer demand signals, not seller listings, identities, or exact buyer locations.
- Location filtering requires market + service-area routing keys; the selected polygon and buyer list use the same resolved UUID.
- Seller search matches the buyer's one primary `SELECTED` UUID plus recursively reviewed `SEARCH_ROLLUP` descendants. It does not use ordinary legacy text/bbox fallback.
- Free-text `area`, city/state, and coordinate/radius values are not search filters. Display labels must be loaded from the canonical `serviceArea` row.
- Search submit flows may auto-apply only exact service-area resolutions, not single prefix suggestions.
- Seller map pins use the selected DB service-area center; raw buyer coordinates are not a geography fallback.
- Budget min/max filters match overlapping buyer budget ranges, not exact prices.
- Property-fit filters (beds/baths/sqft/condition/amenities Pool/Parking/ADU/Yard/Garage) stay fit-and-trust oriented; no protected-class proxies.
- Persisted filters and all four sorts execute in SQL before keyset pagination; do not reintroduce a fixed pre-filter cap or post-cap JavaScript matching.
- Cursors are opaque, filter-bound, snapshot-bound, expire after 30 minutes, reject future snapshots, and are ordered by the SQL sort key plus buyer id. Filter, geography, and sort changes must clear the cursor. The snapshot excludes later inserts but is not a historical copy of profiles edited between page requests.
- Public pre-signup previews may show only limited privacy-safe buyer cards; they are not full seller search.
- Search should explain why a buyer matches where possible.
- Search/profile-view usage consumes the shared database limiter and remains
  auditable. Production fails closed when the limiter is unavailable.
- A seller who also owns an active buyer profile may see that buyer demand in search; self-invite actions stay blocked elsewhere.
- The seller's own active buyer demand remains in the shared list/map result;
  its server-derived `canInvite` flag is false.
- Search rows require an active owning User and use the dedicated seller-search
  projection/DTO. Client map code receives only the approved canonical-area
  `mapPoint` and a server-derived `canInvite` flag, never either party's Auth
  UUID or raw buyer coordinates.
- Seller search serializes active, unexpired badges only and never criteria or
  canonical service-area IDs.
- Validate the reserved `00020` indexes and final query plans against realistic
  LA-scale data; the synthetic 25K CI plan is only a regression signal.

## Query contract

`searchBuyers` returns `{ items, pageInfo }`. `pageInfo` contains `hasMore`, `nextCursor`, `pageSize`, and `snapshotAt`. The seller API returns the same shape. Page size defaults to 24 and is capped at 100; clients follow `nextCursor` rather than constructing offsets.

## Agent notes

Default UX should lead with the map and keep actionable buyer cards close to the map. The public homepage is a separate, limited map teaser (`apps/web/components/public-demand-map.tsx` + `apps/web/server/buyer-preview.ts`) with anonymized, unlabeled pins at approximate locations plus preview cards — do not expose full search, precise pins, or full buyer profiles before signup and approved seller access.
