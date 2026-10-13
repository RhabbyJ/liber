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
- `apps/web/lib/map-camera.ts`
- `apps/web/lib/map-presentation.ts`
- `apps/web/lib/mapbox-gl-loader.ts`
- `apps/web/lib/use-keyed-geojson.ts`
- `apps/web/lib/service-areas.ts`
- `apps/web/components/service-area-combobox.tsx`
- `apps/web/components/seller-map-location-search.tsx`
- `apps/web/components/location-lookup-fields.tsx`
- `apps/web/lib/service-area-search-client.ts`
- `apps/web/app/api/geo/geocode/route.ts`
- `apps/web/app/api/service-areas/**/route.ts`
- `apps/web/server/service-area-matching.ts`

## Invariants

- Map view and list view must reflect the same buyer results.
- Seller search maps are buyer-demand maps; numbered pins/clusters represent buyers or buyer demand signals, not property listings.
- Buyer map markers must preserve privacy and should not expose exact private addresses.
- Seller pins are budget pills. When labels overlap at the current view, later pins in result order render as dots (`declutterPricePins`, re-run on every `moveend`); there is no numeric clustering. Hovering a pin or its listing card raises both, and hover or click opens one shared mini-card popup that links to the buyer profile in-app. Pins keep `role="button"` (set before Mapbox would assign `role="img"`) and a 24px+ invisible hit area.
- A clicked (pinned) card closes on map click; hover cards must keep working afterwards. Opening a card from the keyboard focuses its link; Escape closes it and returns focus to the pin. Changing results removes any open card.
- Maps refit only when the selected area or market changes. Results, filters, sort, and paging keep the user's camera. The last view is saved per URL in `sessionStorage` so Back restores it; that storage is optional.
- Interactive maps hide basemap POI, transit, and airport labels (`quietBasemap`) so buyer pins stay legible. A selected boundary renders as a 4% green fill with a 3px `#47a62f` outline.
- Mapbox must be optional; local development should degrade gracefully. When WebGL initialization fails but a public token is configured, the public demand map falls back to a Mapbox Static Images street map with the same privacy-safe approximate pins.
- Interactive maps use flat Mercator, stay north-up, pan within the market plus half its size on each side (minimum zoom 7), remain draggable/zoomable throughout Los Angeles County, and provide a View all LA County reset.
- Maps open directly on the target view, preload the pinned Mapbox script and stylesheet during render, style layers on `style.load`, and fall back only for fatal errors before first load (style, auth, network); a single failed tile is not fatal. A failed script tag is removed so the next mount retries.
- The Mapbox wordmark must stay visible; the footnote sits to its right and status toasts sit bottom-center, clear of the map buttons.
- Selected boundaries are drawn beneath the basemap's first label layer.
- Maps do not draw ambient County, city, or ZCTA borders. They fetch and render a boundary only for the exact ZIP, city, or neighborhood selected through search, and remove it when the selection is cleared.
- Customer-facing maps support direct wheel and touch gestures without requiring a modifier key.
- Geocoding endpoints need validation and rate limits. `/api/service-areas/search` allows 120 lookups per IP per minute; cache-eligible responses are public CDN-cacheable, and throttled, invalid, or failed responses are `no-store`.
- Location inputs share one ARIA combobox (`useServiceAreaCombobox`): 150ms debounce, abort of stale requests, a shared in-memory response cache, arrow-key navigation, Escape to close, highlighted matches, two-line type/parent labels, loading/no-result/error states, and up to five per-market recent selections in `localStorage`. Choosing a suggestion selects that canonical area; Enter on typed text still goes through exact resolution.
- Search suggestions include word prefixes and typo matches; only exact matches resolve. See `docs/engineering/SERVICE_AREA_BOUNDARIES.md` for ranking.
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
- Search suggestions and exact resolution are separate; ambiguous place terms and unique prefixes must ask the user to choose a specific supported area.
- Service-area API submit flows may auto-select only exact `resolution.status === "resolved"` results, not single search suggestions.
- Selected-area preview pins must anchor to the selected service-area center plus privacy offset instead of re-parsing buyer city text.
- Do not claim national coverage unless product docs approve it.

## Agent notes

Geography should be the first seller-search affordance while still surfacing buyer trust and fit details in nearby cards or detail states.
