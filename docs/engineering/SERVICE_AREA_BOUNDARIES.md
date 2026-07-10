# Liber Service-Area Boundaries

This file records the implemented v1 architecture for ZIP, city, and neighborhood boundaries. Product scope still lives in `docs/product/V1_DEFINITION.md`; backend rules still live in `docs/engineering/BACKEND_ARCHITECTURE.md`.

## Goal

Replace ZIP radius-circle behavior with a Zillow-style selected service-area boundary experience.

Supported searches include active Liber service-area ZIPs, cities, and neighborhoods such as:

- 91325
- 91326
- Northridge
- Tarzana
- Encino
- Glendale
- Burbank

When a supported area is selected, Liber should:

- confirm the area is supported,
- draw the service-area polygon,
- fit the map to the polygon bbox,
- filter approved-seller buyer results by that area,
- keep the public homepage privacy-safe.

## Architecture Decision

Liber owns the supported areas, polygons, privacy rules, and filtering logic.

Mapbox is only a rendering provider for v1 map display. It is not the source of truth for supported geography, and v1 does not depend on Mapbox Boundaries. The v1 autocomplete/search UI intentionally queries Liber service-area metadata instead of generic Mapbox suggestions so unsupported locations do not become accidental public buyer search.

CTO review confirmed this direction: do not switch to Google Maps or another provider for v1. The provider is not the boundary authority. Keep Mapbox replaceable as a renderer/geocoder, and harden Liber's canonical service-area model before expanding beyond the current reviewed service areas.

## Data Model

`public.markets` and `public.service_areas` are the canonical tables for active supported areas. Their UUIDs are immutable identity; slugs are market-scoped routing keys.

For v1:

- `public.markets` stores launch-market metadata, center, padded union bbox, and active state.
- `public.service_areas` stores `market_id`, market-scoped slug, center, bbox, source/version/license/checksum, active flags, explicit search terms, and GeoJSON paths.
- `public.service_area_relationships` references parent/child UUIDs. Only reviewed `SEARCH_ROLLUP` rows affect matching; `CONTAINS`, `OVERLAPS`, and `DISPLAY_PARENT` are spatial/display metadata.
- `apps/web/public/geo/service-areas/**` stores only the current reviewed development/cutover fixtures. Geography PR2 must move broader LA geometry to immutable, versioned, deploy-independent assets referenced by canonical database metadata.
- `buyer_desired_service_areas` stores at most one primary service-area UUID per buyer. Searchable profiles require source `SELECTED`; parent matches are computed from reviewed relationships at query time.
- `BuyerProfile.desiredPostalCode`, `desiredNeighborhood`, `desiredCity`, text, state, and approximate coordinates are compatibility/display fields derived server-side from the selected row. They do not drive ordinary runtime matching.
- `service_area_migration_quarantine` records conflicting, ambiguous, and unresolved legacy profiles for review.

For a later spatial upgrade:

- add PostGIS `geom geometry(MultiPolygon, 4326)` to `service_areas`,
- add buyer desired point geometry,
- add GIST indexes,
- use `ST_Covers` for point-in-polygon matching.

## Database Scalability

The v1 database shape is scalable for ZIP-first LA expansion without changing map providers:

- `service_areas(market_id, slug)` is unique for market-scoped lookup.
- `service_areas(market_id, active, type)` supports active-area listing inside a market.
- `service_areas(postal_code)` supports ZIP metadata lookup.
- `service_areas.search_terms` stores reviewed lookup terms for deterministic search.
- relationship UUID/type/reviewed indexes support recursive reviewed rollups without rewriting buyers.
- `buyer_desired_service_areas(service_area_id, buyer_profile_id)` supports seller/public selected-area filtering.
- a deferred constraint trigger prevents a buyer profile/selection transaction from committing an active profile without exactly one active primary `SELECTED` row; deactivating its market or area automatically drafts the profile and reactivation does not republish it.

Before true public production, run advisors and `EXPLAIN` against realistic data volume. PostGIS remains a later point-in-polygon upgrade; do not add text/bbox fallback to compensate for missing polygons.

## Search And Filtering

Public service-area endpoints return metadata only:

- `GET /api/service-areas/search?market=los-angeles&q=northridge`
- `GET /api/service-areas/:slug?market=los-angeles`

The search endpoint returns both exact resolution and suggestions. Clients may auto-select only when `resolution.status` is `resolved`; a single prefix suggestion such as `stu` is still only a suggestion until the user chooses the supported service area.

Seller buyer search requires a market slug and service-area slug:

- `GET /api/seller/buyers?market=los-angeles&service_area=northridge`

Seller buyer search must:

- require authentication,
- require approved seller-directory access,
- validate both market and service-area routing keys,
- return only seller-safe buyer fields,
- return no buyers for unsupported areas.

MVP matching:

- Resolve market + service-area slug to an active UUID.
- Match the buyer's one primary `SELECTED` UUID.
- For parent searches, recursively include descendants connected by reviewed `SEARCH_ROLLUP` rows.
- Do not let spatial/display relationships or legacy text/bbox fields create matches.

Service-area lookup must be deterministic:

- UI/API lookup uses explicit per-area search terms such as `91604`, `studio city`, and `studio city 91604`.
- Suggestion UI calls the service-area search API. Static TypeScript geography is fixture data only.
- Broad metadata such as `type`, `state`, and `county` must not decide canonical area selection.
- Search suggestions may return one or more matches, but automatic resolution must only occur for exact unambiguous slug/postal/label/search-term matches.
- Selected-area preview pins anchor to the selected service-area center plus the privacy offset, not re-parsed buyer city text.
- Public preview filtering uses the same selected UUID and reviewed rollups as seller search.
- Public and seller pins use the selected DB service-area center; stale city text does not place pins.

## Import And Activation

Bulk import and activation are intentionally unavailable during the canonical cutover. Geography PR2 must deliver the reviewed Los Angeles County manifest, official display/search relationships, source/version/license/checksum evidence, deploy-independent immutable geometry, and transactionally derived market bounds before any broader activation. An inactive market makes all child areas unavailable even if a child row is active. Broad LA activation from bbox membership is prohibited.

## Map Rendering

When a supported area is selected:

1. Remove the previous selected-area source/layers.
2. Add the selected GeoJSON as `liber-selected-service-area-source`.
3. Add `liber-selected-service-area-fill`.
4. Add `liber-selected-service-area-outline`.
5. Fit the map to the stored bbox.

The UI must not draw radius circles for selected ZIP, city, or neighborhood areas.

## Privacy Rules

Public homepage may show:

- supported service-area polygons,
- privacy-safe active-area copy,
- the limited preview content allowed by `docs/product/V1_DEFINITION.md`.

Public homepage must not show:

- full buyer directory search,
- exact buyer locations,
- buyer profile pages,
- private documents,
- seller-only buyer search results.

Approved sellers may see seller-safe buyer cards and map demand from the same filtered result set. They must not see legal names, phone numbers, emails, exact addresses, private documents, or sensitive personal details.

## Data Source Rules

ZIP-like areas use Census ZCTA data and must be labeled approximate, not official USPS ZIP borders.

Neighborhoods are curated Liber service areas and must be labeled approximate, not official neighborhood boundaries.

Cities use city boundary data where available and should still be presented as Liber service areas.

## Acceptance Checklist

Homepage passes when:

- searching 91325 shows a supported result,
- selecting 91325 draws a polygon, not a circle,
- the map fits to that polygon,
- unsupported areas show the unsupported-area state,
- unauthenticated users cannot call seller buyer search.

Seller map passes when:

- searching Northridge shows a supported result,
- selecting Northridge draws the same polygon style as homepage,
- buyer list/map filters by the selected market-scoped service-area UUID,
- clearing the selected area removes the polygon/filter,
- unsupported service areas return no buyer results,
- seller buyer API requires approved seller access.

Current fixture data passes when:

- every active fixture service area has a valid GeoJSON file,
- every fixture GeoJSON file has matching slug/type/source/source-version metadata,
- every fixture bbox matches the computed GeoJSON bbox within tolerance,
- every service area has bbox and center values,
- every active service area belongs to an active market,
- every search-rollup relationship is explicit, reviewed, and evaluated at query time,
- buyer profile saves persist one selected supported service-area UUID and derive all structured fields from it,
- active profiles have exactly one active primary `SELECTED` row; geography deactivation drafts affected profiles and the post-cutover invariant query verifies the result,
- conflicting/unresolved legacy profiles are quarantined and draft,
- every active area's bbox lies inside the recomputed market bbox,
- no Mapbox temporary result payload is stored as canonical geography.

For richer future spatial queries, add PostGIS polygon matching (`service_areas.geom`, buyer desired point geometry, GIST indexes, and `ST_Covers`/equivalent point-in-polygon matching). It is not required for the ZIP-first launch, and text/bbox matching must not be reintroduced as a substitute.

## Non-Goals

- Do not switch to Google for v1.
- Do not depend on Mapbox Boundaries for v1.
- Do not bulk import all LA areas until the authoritative boundary/search-term source and license have been reviewed.
- Do not build generic public map search.
- Do not expose seller buyer search on the public homepage.
- Do not add speculative service-area admin UI before product approval.
