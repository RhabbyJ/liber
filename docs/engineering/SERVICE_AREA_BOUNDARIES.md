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

- `public.markets` stores launch-market metadata, jurisdiction identity, center/bbox, active state, and an optional approved immutable boundary pointer.
- `public.service_areas` stores `market_id`, market-scoped slug, stable source identity, center, bbox, source/version/license/retrieval/checksum metadata, active flags, and an optional approved immutable geometry pointer.
- `public.geography_dataset_versions`, `market_boundary_versions`, `market_display_geometry_versions`, and `service_area_geometry_versions` retain immutable staged evidence. Staging never changes live current pointers.
- `public.service_area_search_terms` stores reviewed normalized runtime terms with a composite same-market foreign key.
- `public.service_area_relationships` references parent/child UUIDs. Only reviewed `SEARCH_ROLLUP` rows affect matching; `CONTAINS`, `OVERLAPS`, and `DISPLAY_PARENT` are spatial/display metadata.
- `apps/web/public/geo/service-areas/**` stores only reviewed development/cutover fixtures. LA County production geometry is served from immutable database-backed versions so approval does not depend on a frontend asset swap.
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
- `service_areas(market_id, stable_external_id)` keeps source identity stable within
  a market without blocking a boundary-crossing source area in an adjacent market.
- `service_areas(market_id, active, type)` supports active-area listing inside a market.
- `service_areas(postal_code)` supports ZIP metadata lookup.
- `service_area_search_terms_market_term_prefix_idx` is the composite unique covering index for `(market_id, term_normalized, service_area_id)`. It stores reviewed lookup terms for bounded deterministic exact/prefix search without retaining a redundant larger prefix index. Results are deduplicated by service-area UUID.
- relationship UUID/type/reviewed indexes support recursive reviewed rollups without rewriting buyers.
- `buyer_desired_service_areas(service_area_id, buyer_profile_id)` supports seller/public selected-area filtering.
- a deferred constraint trigger prevents a buyer profile/selection transaction from committing an active profile without exactly one active primary `SELECTED` row; deactivating its market or area automatically drafts the profile and reactivation does not republish it.

Before true public production, run advisors and `EXPLAIN` against realistic data volume. PostGIS remains a later point-in-polygon upgrade; do not add text/bbox fallback to compensate for missing polygons.

The production default planner has been verified to use `service_area_search_terms_market_term_prefix_idx` for the bounded prefix path. Plan proof must use the default planner; disabling sequential scans is not acceptable evidence. The database E2E now plans the deployed function body read from `pg_proc`, so the proof cannot drift from the migration.

## Search And Filtering

Public service-area endpoints return metadata only:

- `GET /api/service-areas/search?market=los-angeles&q=northridge`
- `GET /api/service-areas/:slug?market=los-angeles`

These are server-mediated Next.js endpoints. Raw Supabase Data API reads of the canonical geography tables are intentionally denied to `anon` and `authenticated`; do not restore table grants as an endpoint shortcut.

The search endpoint returns both exact resolution and suggestions. Clients may auto-select only when `resolution.status` is `resolved`; a single prefix suggestion such as `stu` is still only a suggestion until the user chooses the supported service area.

`geography_admin.search_active_service_areas` (migration `20261013120000_activate_la_county_communities`) builds suggestions in this order, at most eight:

1. display-name prefix (`gran` → Granada Hills), where the display name drops a trailing `(Unincorporated)`;
2. later-word prefix (`hills` → Granada Hills, Beverly Hills);
3. reviewed-term prefix through the indexed lexical range (`los angeles gr`, `noho`, ZIP prefixes);
4. only when nothing above matched, `pg_trgm` typo matches (`granda hils`) against display names and reviewed community aliases, keeping results within 0.15 of the best similarity and at least 0.45.

Within a rank, digits list ZIPs first; otherwise cities, then communities, then ZIPs, alphabetically. Exact resolution is unchanged: slug, then ZIP, then full label, then reviewed term, and only the best exact rank counts, so `arcadia` resolves to the city rather than Arcadia (Unincorporated) while `downtown` stays ambiguous. Typo matches are never exact. Areas without a reviewed search term never appear in any branch. `pg_trgm` lives in the `extensions` schema; the migration fails if it is installed elsewhere.

The search route validates `market` and `q` with Zod, folds accents before normalizing (`La Cañada` → `la canada`), limits each client IP to 120 lookups per minute through the existing Postgres limiter, and marks successful public responses `public, max-age=60, s-maxage=300, stale-while-revalidate=600` so CDN hits skip the database and the limiter. Throttled, invalid, and failed responses are `no-store`.

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

- UI/API lookup uses explicit per-area search terms such as `91604`, `studio city`, and `studio city 91604`, plus display-name word prefixes and typo suggestions that only suggest.
- Suggestion UI calls the service-area search API. Static TypeScript geography is fixture data only.
- Broad metadata such as `type`, `state`, and `county` must not decide canonical area selection.
- Search suggestions may return one or more matches, but automatic resolution must only occur for exact unambiguous slug/postal/label/search-term matches.
- Selected-area preview pins anchor to the selected service-area center plus the privacy offset, not re-parsed buyer city text.
- Public preview filtering uses the same selected UUID and reviewed rollups as seller search.
- Public and seller pins use the selected DB service-area center; stale city text does not place pins.

## Import And Activation

The approved LA County artifact is `la-county-06037-2026-07-12-v2`. Validation is always read-only first and verifies the external checksum ledger, compressed/decompressed bytes, exact source feature IDs, canonical area hashes, the 661/88/269/304 counts, 91 legal-city components across 88 names, and the 298 reviewed CSA relationships.

Migration `20260712090000_expand_la_county_geography` is transaction-scoped. Its owner-only staging function creates immutable evidence and inactive rows without changing active areas, current pointers, market bounds, terms, or relationships. A second identical stage is a no-op. The production release command is pinned to the exact dataset hashes and Supabase project ref.

The separate activation function turns on exactly 88 city and 304 ZCTA records, preserves the three reviewed pilot neighborhoods, sets current geometry and display pointers, derives County bounds from the approved County polygon, and adds reviewed terms/relationships. It records a pre-change snapshot before mutation and aborts unless all counts, bounds, pointers, terms, relationships, and active-buyer invariants hold. Broad activation from bbox membership is prohibited.

The rollback function restores the prior 15-area activation state, complete prior service-area metadata, market bounds/display pointers, and geometry pointers. Its activation snapshot distinguishes preexisting term/relationship keys from release-created keys. It retains immutable staged evidence and canonical source IDs. Rollback fails before mutation if an `ACTIVE` buyer depends on an area it would deactivate; the profile must first use the supported draft/reselection workflow. See `GEOGRAPHY_LA_COUNTY_RELEASE_RUNBOOK.md`.

### Community layer

`la-county-06037-2026-10-13-communities-v1` is a separate, reversible layer on top of the active v2 release. `geography_admin.activate_la_county_communities` is pinned to that layer key and the v2 manifest/relationship hashes, requires the County snapshot to be live, takes the same market lock, and re-runs `assert_la_county_activation_current` before changing anything. It then records a snapshot in `geography_activation_snapshots` (the prior active flag of all 269 communities and any preexisting alias rows), activates the 266 inactive staged communities, and inserts the reviewed aliases from `geography_admin.la_county_community_aliases()` as `COMMUNITY_REVIEWED_ALIAS` rows owned by the layer key. Postconditions require 88/304/269 active areas inside the County bounds with current geometry. A second activation is an idempotent no-op; a rolled-back layer cannot be reactivated.

`assert_la_county_activation_current` now expects every community active while the layer snapshot is live (only the three pilots otherwise), rejects any layer-owned row that is not a reviewed alias, and rejects alias provenance drift. The layer snapshot is stamped with `clock_timestamp()`, so County rollback is blocked while the layer is live.

`geography_admin.rollback_la_county_communities` requires the exact layer key and fails before mutation if any `ACTIVE` buyer's primary area would be deactivated. It deletes only the layer's alias rows (keeping preexisting keys), restores each community's prior active flag, marks the snapshot rolled back, and re-validates the County release. Existing SEARCH_ROLLUP relationships already connect 139 Los Angeles and 10 Long Beach communities to their city, so activation alone makes a city search include its community buyers.

## Map Rendering

Both interactive maps start without County, city, or ZCTA border overlays and do not fetch the market display bundle for ordinary rendering. The retained immutable display bundle remains release evidence behind its public-safe versioned API, but it is not an ambient map layer.

Maps use flat Mercator, stay north-up (no rotate or pitch gestures), allow panning up to half the County's size beyond its bbox with a minimum zoom of 7, support drag/touch pan and zoom with direct gestures, and provide a **View all LA County** control. They open on the saved per-URL view or the framing target, refit only when the selected area (or market) changes, and keep the user's camera when results, filters, sort, or page change.

When a supported area is selected:

1. Remove the previous selected-area source/layers.
2. Add the selected GeoJSON as `liber-selected-service-area-source`.
3. Add `liber-selected-service-area-fill`.
4. Add `liber-selected-service-area-outline`.
5. Fit the map to the stored bbox.

Both layers are inserted beneath the basemap's first label layer so street and place names stay legible.

The UI must not draw radius circles for selected ZIP, city, or neighborhood areas.
When Mapbox is unavailable, a fallback may draw a selected boundary only if pins and geometry share the same projection. Current static pin fallbacks omit the boundary rather than imply false spatial alignment.

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

Los Angeles County statistical communities are approximate Liber service areas and must not be presented as exact neighborhood or jurisdictional boundaries.

Canonical city service areas use reviewed County CSA city membership; the retained release display bundle uses County Public Works legal-city land boundaries dissolved to 88 city features. Neither is represented as survey-grade legal evidence.

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
- direct browser-role reads of canonical geography tables are denied while the narrow public search endpoint still returns safe results without database UUIDs.

For richer future spatial queries, add PostGIS polygon matching (`service_areas.geom`, buyer desired point geometry, GIST indexes, and `ST_Covers`/equivalent point-in-polygon matching). It is not required for the ZIP-first launch, and text/bbox matching must not be reintroduced as a substitute.

## Non-Goals

- Do not switch to Google for v1.
- Do not depend on Mapbox Boundaries for v1.
- Do not bypass the exact-hash staged release, explicit city/ZIP allowlist, activation snapshot, or rollback checks.
- Do not build generic public map search.
- Do not expose seller buyer search on the public homepage.
- Do not add speculative service-area admin UI before product approval.
