# Liber Service-Area Boundaries

This file records the implemented v1 architecture for ZIP, city, and neighborhood boundaries. Product scope still lives in `docs/product/V1_DEFINITION.md`; backend rules still live in `docs/engineering/BACKEND_ARCHITECTURE.md`.

## Goal

Replace ZIP radius-circle behavior with a Zillow-style selected service-area boundary experience.

Supported searches include active Liber pilot ZIPs, cities, and neighborhoods such as:

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

## Data Model

`public.service_areas` is the canonical table for active supported areas.

For v1:

- `public.service_areas` stores metadata, center, bbox, source/version, active flags, and GeoJSON paths.
- `apps/web/public/geo/service-areas/**` stores simplified static GeoJSON polygons.
- `BuyerProfile.desiredPostalCode` and `BuyerProfile.desiredNeighborhood` store derived buyer geography for exact service-area filtering.

For a later spatial upgrade:

- add PostGIS `geom geometry(MultiPolygon, 4326)` to `service_areas`,
- add buyer desired point geometry,
- add GIST indexes,
- use `ST_Covers` for point-in-polygon matching.

## Database Scalability

The v1 database shape is scalable enough for local development and the CEO/private-preview launch:

- `service_areas.slug` is unique for direct lookup.
- `service_areas(active, type)` supports active-area listing.
- `service_areas(postal_code)` supports ZIP metadata lookup.
- `BuyerProfile.desiredPostalCode`, `desiredNeighborhood`, and `(desiredCity, desiredState)` support service-area search.
- Partial active-profile indexes in the migration support the common seller-search path without scanning draft/hidden/suspended profiles.

Before true public production, run advisors and `EXPLAIN` against realistic data volume. If geography volume grows beyond v1 text fields and bbox fallback, move to the PostGIS upgrade above instead of adding more text matching.

## Search And Filtering

Public service-area endpoints return metadata only:

- `GET /api/service-areas/search?q=northridge`
- `GET /api/service-areas/:slug`

Seller buyer search accepts a service-area slug:

- `GET /api/seller/buyers?service_area=northridge`

Seller buyer search must:

- require authentication,
- require approved seller-directory access,
- validate the service-area slug,
- return only seller-safe buyer fields,
- return no buyers for unsupported areas.

MVP matching:

- ZIP: exact `desiredPostalCode`, with legacy text/bbox fallback only when no derived postal code exists.
- Neighborhood: exact `desiredNeighborhood`, with city/text/bbox fallback only when no derived neighborhood exists.
- City: exact desired city/text/bbox fallback.

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
- buyer list/map filters by selected service-area slug,
- clearing the selected area removes the polygon/filter,
- unsupported service areas return no buyer results,
- seller buyer API requires approved seller access.

Data passes when:

- every active service area has a valid GeoJSON file,
- every GeoJSON file has matching slug/type/source metadata,
- every service area has bbox and center values,
- no Mapbox temporary result payload is stored as canonical geography.

## Non-Goals

- Do not switch to Google for v1.
- Do not depend on Mapbox Boundaries for v1.
- Do not build generic public map search.
- Do not expose seller buyer search on the public homepage.
- Do not add speculative service-area admin UI before product approval.
