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
- `apps/web/app/api/uploads/sessions/route.ts`
- `apps/web/app/api/uploads/sessions/[sessionId]/finalize/route.ts`
- `apps/web/app/api/property-images/[imageId]/route.ts`
- `apps/web/app/api/maintenance/expire/route.ts`
- `apps/web/app/api/conversations/**`
- `apps/web/app/api/messages/**`
- `apps/web/app/auth/callback/route.ts`
- `apps/web/server/attom.ts`
- `apps/web/server/rate-limit.ts`

## Invariants

- Provider-backed routes must be auth-protected or strictly rate-limited.
- Validate request inputs.
- Return safe errors; do not leak provider responses or secrets.
- Service-area endpoints may return active Liber-supported area metadata only, never buyer data.
- Geography endpoints require explicit market context and return market-scoped slugs plus immutable versioned geometry hashes/paths; database UUIDs stay server-side.
- Service-area search endpoints must use canonical slugs/explicit search terms and must not let broad provider/geography metadata select unsupported areas.
- Geocode calls must use the active market bbox derived from service-area metadata; do not reintroduce hardcoded SFV bounds.
- Mapbox address parsing must use typed postcode/place fields so a five-digit house number cannot be treated as a ZIP.
- Service-area database failures return controlled `503` responses and are logged without secrets; production routes never fall back to static pilot metadata.
- `GET /api/markets/:slug/boundaries?v=:sha256` serves the immutable public-safe County/city/ZCTA display bundle with ETag and immutable caching. It must not expose internal UUIDs, buyer data, source-administration fields, or relationship evidence.
- Public service-area DTOs use the market slug, service-area slug, and versioned geometry path; internal service-area UUIDs remain server-side.
- Service-area search returns `{ resolution, suggestions }`; callers must not silently choose the first suggestion for ambiguous terms or unique prefixes.
- Seller buyer APIs must require approved seller-directory access and return seller-safe buyer fields only.
- State-changing routes require an authorized session plus shared fail-closed origin protection: an exact matching `Origin`, or `Sec-Fetch-Site: same-origin` only when `Origin` is absent. Missing or conflicting browser signals are rejected.
- Conversation list/read/send/read-state/mute/block/report routes require active
  participant authorization, private no-store responses, safe errors, and
  shared validation. They never return blocker identity, report evidence,
  Auth UUIDs, email, message bodies in logs, or current property details for an
  identity-invalidated invite.
- The only message-report API mutation available to participants creates a
  report for one counterparty message. Admin review uses server-only pages and
  actions rather than duplicate list/detail/resolve API routes.
- Property enrichment is for private seller property prep. It requires an authenticated seller/admin role and rate limits, but not approved seller-directory access.
- Exact-address enrichment uses same-origin `POST` JSON with `private, no-store`; exact addresses must not appear in query strings.
- Upload-session creation/finalization and private property-image signing are authenticated, same-origin, narrow-response endpoints.

## Agent notes

External API quota is a security and cost boundary. Do not create public proxy endpoints.
