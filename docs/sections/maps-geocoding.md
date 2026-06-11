# Section: Maps and Geocoding

## Purpose

Owns buyer search geography, map rendering, fallback maps, Mapbox integration, and geocoding helpers.

## Main files

- `apps/web/components/buyer-map.tsx`
- `apps/web/components/interactive-buyer-map.tsx`
- `apps/web/components/static-buyer-map.tsx`
- `apps/web/lib/mapbox.ts`
- `apps/web/lib/launch-market.ts`
- `apps/web/app/api/geo/geocode/route.ts`

## Invariants

- Map view and list view must reflect the same buyer results.
- Seller search maps are buyer-demand maps; numbered pins/clusters represent buyers or buyer demand signals, not property listings.
- Buyer map markers must preserve privacy and should not expose exact private addresses.
- Mapbox must be optional; local development should degrade gracefully.
- Geocoding endpoints need validation and rate limits.
- Do not claim national coverage unless product docs approve it.

## Agent notes

Geography should be the first seller-search affordance while still surfacing buyer trust and fit details in nearby cards or detail states.
