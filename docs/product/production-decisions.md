# Production Decisions

This file tracks decisions and operational work required before Liber moves from CEO demo / private preview to true public production.

## Current Environment

The current shared Vercel + Supabase deployment is treated as CEO demo / private preview while access remains intentionally limited.

## Open Production Items

- Configure `CRON_SECRET` before enabling scheduled maintenance in production.
- Configure Resend (`RESEND_API_KEY`, `RESEND_FROM_EMAIL`) before relying on invite email delivery.
- Enable Supabase Auth leaked-password protection before public launch.
- Decide whether to move PostGIS out of the public schema or otherwise accept and document Supabase advisor findings for `spatial_ref_sys` and PostGIS SECURITY DEFINER functions.
- Keep app tables protected by server-mediated access. Current RLS-with-no-policy advisor findings are deny-by-default for direct Data API access; add explicit policies only if browser/Data API access is intentionally introduced.
- Re-run Supabase security and performance advisors before launch and after every schema migration.
- Re-run `EXPLAIN` on seller buyer-search queries against realistic data volume before public launch.
- Keep current buyer/search/property indexes until realistic traffic proves they are unnecessary; early unused-index advisor findings in a demo database are not enough to drop them.
- Remove or replace clearly marked demo buyer data before true public launch.

## Recent Advisor Snapshot

Captured during the ownership-evidence/property-subtype pass:

- Security advisor: RLS enabled with no policies on core app tables, which currently keeps direct Data API access denied by default.
- Security advisor: `public.spatial_ref_sys` has RLS disabled and PostGIS is installed in `public`.
- Security advisor: Supabase Auth leaked-password protection is disabled.
- Performance advisor: several app indexes are unused in the low-traffic demo database, including the new `VerificationDocument_propertyId_ownershipEvidenceKind_idx`; retain until representative production traffic or query plans show they are unnecessary.
