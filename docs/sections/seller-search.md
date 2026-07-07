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

## Invariants

- Requires approved seller access.
- Approved sellers land on the map view by default (`view=list` opts out); buyer cards render below the map from the same result set.
- List and map use the same result set.
- Map pins show coarse budget labels for buyer demand signals, not seller listings, identities, or exact buyer locations.
- Budget min/max filters match overlapping buyer budget ranges, not exact prices.
- Property-fit filters (beds/baths/sqft/condition/amenities Pool/Parking/ADU/Yard/Garage) stay fit-and-trust oriented; no protected-class proxies.
- Public pre-signup previews may show only limited privacy-safe buyer cards; they are not full seller search.
- Search should explain why a buyer matches where possible.
- Search/profile-view usage should remain rate-limited/auditable.

## Agent notes

Default UX should lead with the map and keep actionable buyer cards close to the map. The public homepage is a separate, limited map teaser (`apps/web/components/public-demand-map.tsx` + `apps/web/server/buyer-preview.ts`) with anonymized, unlabeled pins at approximate locations plus preview cards — do not expose full search, precise pins, or full buyer profiles before signup and approved seller access.
