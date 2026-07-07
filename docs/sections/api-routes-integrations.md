# Section: API Routes and Integrations

## Purpose

Owns Next route handlers and external provider adapters for auth callbacks, geocoding, property enrichment, and maintenance.

## Main files

- `apps/web/app/api/auth/login/route.ts`
- `apps/web/app/api/geo/geocode/route.ts`
- `apps/web/app/api/property/enrich/route.ts`
- `apps/web/app/api/maintenance/expire/route.ts`
- `apps/web/app/auth/callback/route.ts`
- `apps/web/server/attom.ts`
- `apps/web/server/rate-limit.ts`

## Invariants

- Provider-backed routes must be auth-protected or strictly rate-limited.
- Validate request inputs.
- Return safe errors; do not leak provider responses or secrets.
- State-changing routes need appropriate origin/session protection.
- Property enrichment is for private seller property prep. It requires an authenticated seller/admin role and rate limits, but not approved seller-directory access.

## Agent notes

External API quota is a security and cost boundary. Do not create public proxy endpoints.
