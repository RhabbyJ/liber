# Section: Maps and Geocoding

## Purpose

Owns buyer search geography, map rendering, fallback maps, Mapbox integration, and geocoding helpers.

## Main files

- `apps/web/components/buyer-map.tsx`
- `apps/web/components/interactive-buyer-map.tsx`
- `apps/web/components/public-demand-map.tsx`
- `apps/web/components/public-map-location-search.tsx`
- `apps/web/components/static-buyer-map.tsx`
- `apps/web/lib/map-area.ts`
- `apps/web/lib/mapbox.ts`
- `apps/web/lib/launch-market.ts`
- `apps/web/lib/service-areas.ts`
- `apps/web/app/api/geo/geocode/route.ts`
- `apps/web/app/api/service-areas/**/route.ts`

## Invariants

- Map view and list view must reflect the same buyer results.
- Seller search maps are buyer-demand maps; numbered pins/clusters represent buyers or buyer demand signals, not property listings.
- Buyer map markers must preserve privacy and should not expose exact private addresses.
- Mapbox must be optional; local development should degrade gracefully.
- Geocoding endpoints need validation and rate limits.
- Public homepage area selection is limited to known active service areas; it draws approximate Liber-owned polygons and scopes the limited preview cards only, and must not become unauthenticated buyer search.
- ZIP/city/neighborhood selection must render service-area polygons from GeoJSON, not radius circles.
- Mapbox search/geocoding payloads must not become the canonical service-area database.
- Do not claim national coverage unless product docs approve it.

## Agent notes

Geography should be the first seller-search affordance while still surfacing buyer trust and fit details in nearby cards or detail states.
