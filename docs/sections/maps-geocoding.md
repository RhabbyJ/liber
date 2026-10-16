# Section: Maps and Geocoding

## Purpose

Owns buyer search geography, map rendering, fallback maps, Mapbox integration, and geocoding helpers.

## Main files

- `apps/web/components/buyer-map.tsx`
- `apps/web/components/interactive-buyer-map.tsx`
- `apps/web/components/public-demand-map.tsx`
- `apps/web/components/seller-map-location-search.tsx`
- `apps/web/lib/map-boundary-layers.ts`
- `apps/web/components/static-buyer-map.tsx`
- `apps/web/lib/map-area.ts`
- `apps/web/lib/buyer-map-point.ts`
- `apps/web/lib/mapbox.ts`
- `apps/web/lib/map-boundary-layers.ts`
- `apps/web/lib/map-presentation.ts`
- `apps/web/lib/use-keyed-geojson.ts`
- `apps/web/lib/service-areas.ts`
- `apps/web/components/service-area-combobox.tsx`
- `apps/web/lib/service-area-search.ts`
- `apps/web/lib/use-service-area-search.ts`
- `apps/web/lib/use-market-map.ts`
- `apps/web/lib/map-marker-clusters.ts`
- `apps/web/app/api/geo/geocode/route.ts`
- `apps/web/app/api/service-areas/**/route.ts`
- `apps/web/server/service-area-matching.ts`

## Invariants

- Map view and list view must reflect the same buyer results.
- Seller search maps are buyer-demand maps; numbered pins/clusters represent buyers or buyer demand signals, not property listings.
- Buyer map markers must preserve privacy and should not expose exact private addresses.
- Seller pins are budget pills; preview pins are dots. After every zoom, pins whose screen positions would overlap merge into a cluster anchored at a real area center (dark count pill or dot); clicking a cluster zooms in until it splits. Hovering a pin or its listing card raises both, and hover or click on a single-area pin opens one shared photo mini-card popup that links to the buyer profile (or, for previews, to sign-up).
- Pins are keyboard reachable. Re-clustering replaces every marker, so a keyboard-focused pin hands focus to the new pin holding its first buyer (activating a cluster with Enter keeps your place as it splits). Enter or Space on a single-area pin opens its mini-card and focuses the card's first link. Escape closes the mini-card, hovered or pinned, and returns focus to its pin when focus was inside it; an open modal (the Filters sheet) keeps Escape for itself.
- The map's location search is one Zillow-style field with the search icon inside it (`SellerMapLocationSearch` → `ServiceAreaCombobox`) and navigates the single map at `/`.
- A selected boundary is drawn from the dissolved shape: multi-part areas are unioned (`polygon-clipping`), hairline holes under 0.1% of a polygon's area are dropped, and the outline and dimmed surround never show internal seams or stray triangles. If a union fails, the outline still draws and the dimming is skipped.
- Interactive maps hide basemap POI, transit, and airport labels (`quietBasemap`) so buyer pins stay legible. A selected boundary renders as a 4% green fill with a 3px `#47a62f` outline.
- Mapbox must be optional; local development should degrade gracefully. When WebGL initialization fails but a public token is configured, public and seller maps fall back to a Mapbox Static Images street map with the same area-center pins. Without a usable map provider, show an unavailable state and retain buyer cards; never position pins on decorative geography.
- Interactive maps are clamped to the active market bbox, remain draggable/zoomable throughout Los Angeles County, and provide a View all LA County reset.
- Maps do not draw ambient County, city, or ZCTA borders. They fetch and render a boundary only for the exact ZIP, city, or neighborhood selected through search, and remove it when the selection is cleared.
- Customer-facing maps support direct wheel and touch gestures without requiring a modifier key.
- Geocoding endpoints need validation and rate limits.
- Public homepage area selection is limited to known active service areas; it draws approximate Liber-owned polygons and scopes the limited preview cards only, and must not become unauthenticated buyer search.
- Hovering or keyboard-focusing a public preview card highlights only its corresponding privacy-safe map pin and does not move the map.
- ZIP/city/neighborhood selection must render service-area polygons from GeoJSON, not radius circles.
- If a non-Mapbox fallback cannot project the selected GeoJSON truthfully, omit the boundary; never draw a generic decorative shape as if it were the selected area.
- Static seller pin fallbacks normalize pins independently, and the public Static Images fallback does not project selected GeoJSON, so both must omit selected boundaries.
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
- Search suggestions and exact resolution are separate; ambiguous place terms and unique prefixes must ask the user to choose a specific supported area. Typo, word, and abbreviation matches are suggestions only.
- Every service-area search box uses `ServiceAreaCombobox`: debounced, cached per tab, ARIA combobox with arrow/Enter/Escape/Tab, highlighted matches, and per-viewer recent searches in `localStorage` (convenience only).
- Selected boundaries dim the surrounding map and render beneath basemap labels. Overlapping markers cluster at real area centers only.
- Service-area API submit flows may auto-select only exact `resolution.status === "resolved"` results, not single search suggestions.
- Searching a parent city or neighborhood filters results and changes the viewport; it must not move buyers away from their own selected service-area centers. No coordinate jitter or pixel fan-out is applied. Identical centers share a count marker whose popup lists the matching buyers.
- The customer-facing destination and map headings are named Map. Public ZIP previews display the selected ZIP label.
- Do not claim national coverage unless product docs approve it.

## Agent notes

Geography should be the first seller-search affordance while still surfacing buyer trust and fit details in nearby cards or detail states.
