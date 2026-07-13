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
- `apps/web/lib/buyer-map-point.ts`
- `apps/web/lib/mapbox.ts`
- `apps/web/lib/map-boundary-layers.ts`
- `apps/web/lib/use-keyed-geojson.ts`
- `apps/web/lib/service-areas.ts`
- `apps/web/components/service-area-suggestions.tsx`
- `apps/web/app/api/geo/geocode/route.ts`
- `apps/web/app/api/service-areas/**/route.ts`
- `apps/web/server/service-area-matching.ts`

## Invariants

- Map view and list view must reflect the same buyer results.
- Seller search maps are buyer-demand maps; numbered pins/clusters represent buyers or buyer demand signals, not property listings.
- Buyer map markers must preserve privacy and should not expose exact private addresses.
- Mapbox must be optional; local development should degrade gracefully.
- Interactive maps are clamped to the active market bbox, remain draggable/zoomable throughout Los Angeles County, and provide a View all LA County reset.
- Maps do not draw ambient County, city, or ZCTA borders. They fetch and render a boundary only for the exact ZIP, city, or neighborhood selected through search, and remove it when the selection is cleared.
- Public touch maps use cooperative gestures so the map does not trap one-finger vertical page scrolling.
- Geocoding endpoints need validation and rate limits.
- Public homepage area selection is limited to known active service areas; it draws approximate Liber-owned polygons and scopes the limited preview cards only, and must not become unauthenticated buyer search.
- ZIP/city/neighborhood selection must render service-area polygons from GeoJSON, not radius circles.
- If a non-Mapbox fallback cannot project the selected GeoJSON truthfully, omit the boundary; never draw a generic decorative shape as if it were the selected area.
- Static seller/public pin fallbacks currently normalize pins independently, so they must omit selected boundaries until both use one bbox projection.
- Mapbox search/geocoding payloads must not become the canonical service-area database.
- Canonical lookup requires a market slug plus a market-scoped service-area slug or explicit per-area search term.
- Empty reviewed search terms fail closed; runtime code must not synthesize city/state aliases from broad metadata.
- Mapbox geocoding must be constrained by the active market bbox from `public.markets`/service-area metadata, not a hardcoded SFV rectangle.
- Map components must receive market context from server-loaded market metadata; do not import static market bounds into map components.
- Versioned geometry URLs must return the exact retained hash even after the current pointer changes. Only unversioned URLs follow the current pointer.
- Versioned market-boundary URLs obey the same immutable-cache rule and expose only display-safe kind/slug/label/geometry fields.
- Fixture market bounds must be derived from fixture service-area metadata; do not keep a hardcoded empty-catalog fallback rectangle.
- Seller and public pins must use the buyer's selected DB service-area center; static catalog lookup and stale city text must not place pins.
- Mapbox address results must use typed postcode/place fields. Never extract the first five-digit substring from a formatted address.
- Production database failures must return controlled unavailable errors; static service-area data is test/development fixture data only.
- Search suggestions and exact resolution are separate; ambiguous place terms and unique prefixes must ask the user to choose a specific supported area.
- Service-area API submit flows may auto-select only exact `resolution.status === "resolved"` results, not single search suggestions.
- Selected-area preview pins must anchor to the selected service-area center plus privacy offset instead of re-parsing buyer city text.
- Do not claim national coverage unless product docs approve it.

## Agent notes

Geography should be the first seller-search affordance while still surfacing buyer trust and fit details in nearby cards or detail states.
