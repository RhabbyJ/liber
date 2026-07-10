# Section: API Routes and Integrations

## Purpose

Owns Next route handlers and external provider adapters for auth callbacks, geocoding, property enrichment, and maintenance.

## Main files

- `apps/web/app/api/auth/login/route.ts`
- `apps/web/app/api/geo/geocode/route.ts`
- `apps/web/app/api/service-areas/search/route.ts`
- `apps/web/app/api/service-areas/[slug]/route.ts`
- `apps/web/app/api/seller/buyers/route.ts`
- `apps/web/app/api/property/enrich/route.ts`
- `apps/web/app/api/maintenance/expire/route.ts`
- `apps/web/app/auth/callback/route.ts`
- `apps/web/server/attom.ts`
- `apps/web/server/rate-limit.ts`

## Invariants

- Provider-backed routes must be auth-protected or strictly rate-limited.
- Validate request inputs.
- Return safe errors; do not leak provider responses or secrets.
- Service-area endpoints may return active Liber-supported area metadata only, never buyer data.
- Geography endpoints require explicit market context and return immutable service-area IDs with market-scoped slugs.
- Service-area search endpoints must use canonical slugs/explicit search terms and must not let broad provider/geography metadata select unsupported areas.
- Geocode calls must use the active market bbox derived from service-area metadata; do not reintroduce hardcoded SFV bounds.
- Mapbox address parsing must use typed postcode/place fields so a five-digit house number cannot be treated as a ZIP.
- Service-area database failures return controlled `503` responses and are logged without secrets; production routes never fall back to static pilot metadata.
- Service-area search returns `{ resolution, suggestions }`; callers must not silently choose the first suggestion for ambiguous terms or unique prefixes.
- Seller buyer APIs must require approved seller-directory access and return seller-safe buyer fields only.
- `GET /api/seller/buyers` serializes the dedicated seller-search DTO envelope
  from `apps/web/server/buyer-dtos.ts`; browser-safe response types live in
  `apps/web/lib/buyer-dto-types.ts`. The route does not serialize the internal
  `Buyer` domain model or internal exception details.
- State-changing routes need appropriate origin/session protection.
- Property enrichment is for private seller property prep. It requires an authenticated seller/admin role and rate limits, but not approved seller-directory access.

## Agent notes

External API quota is a security and cost boundary. Do not create public proxy endpoints.
