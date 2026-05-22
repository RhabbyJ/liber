# Production Decisions

These decisions must be answered by the CEO/product owner before production launch. Until then, future agents should not invent defaults that change marketplace behavior, compliance posture, or operational responsibility.

## Launch Market

Decision needed:

- First city/region/state to launch.
- Whether search seed data and default coordinates should focus on that market only.
- Whether buyers outside the first market can create active profiles.

Recommended default until answered:

- Keep seed fixtures, when needed, focused on Los Angeles/Northridge.
- Do not claim national coverage.

## Invite Limits

Decision needed:

- Daily invite limit for unverified sellers.
- Daily invite limit for ownership-verified sellers.
- Whether bulk invite/select-all is allowed in v1.
- Abuse threshold that should trigger manual admin review.

Recommended default until answered:

- Unverified property: 5 invites per seller per 24 hours.
- Verified property: 25 invites per seller per 24 hours.
- No bulk invite in v1.

## Ownership Verification

Decision needed:

- Acceptable ownership documents: deed, tax bill, title report, utility bill, broker authorization, other.
- Whether ownership verification is required before invite sending or only displayed as pending/verified.
- Exact buyer-facing wording for pending ownership.

Recommended default until answered:

- Sellers may send limited invites before approval.
- Buyer-facing invite status should say `Seller Property Ownership: Pending Verification` or `Seller Property Ownership: Verified`.

## Buyer Badge Verification

Decision needed:

- Which documents/evidence are acceptable for each badge.
- Who inside operations can approve or revoke badges.
- Renewal workflow for 90-day pre-approval expiration.
- Whether `EARNEST_MONEY_DEPOSITED` means third-party escrow evidence, partner notification, or another proof type.

Recommended default until answered:

- All badges are admin-controlled.
- Pre-approval expires 90 days after issuance.
- `EARNEST_MONEY_DEPOSITED` must be described as reviewed third-party evidence, not Liber-held funds.

## Production Admin Assignment

Decision needed:

- Which real users become production admins.
- Who can grant admin status.
- Whether admin role changes require two-person approval.

Recommended default until answered:

- No self-service admin assignment.
- Admin role is granted only through a controlled server/database operation.

## Email Provider

Decision needed:

- Resend, Postmark, or another transactional provider.
- Verified sender domain/address.
- Whether invite email copy needs legal/compliance approval.

Recommended default until answered:

- Keep mock/non-sending email for local development.
- Use Resend only when `RESEND_API_KEY` and `RESEND_FROM_EMAIL` are configured.

## Maps and Geocoding

Decision needed:

- Whether Mapbox is the production map/geocoding provider.
- Mapbox token and allowed domains.
- Autocomplete UX requirements for city/address search.

Recommended default until answered:

- Use the local map fallback without token.
- Use Mapbox Static Images when `NEXT_PUBLIC_MAPBOX_TOKEN` is configured.
- Keep PostGIS as the backend source of truth for radius filtering.

## Supabase Advisor Remediation

Decision needed:

- Whether to move PostGIS out of `public`.
- Whether and how to handle RLS warnings on `public.spatial_ref_sys` and `public._prisma_migrations`.

Recommended default until answered:

- Do not auto-apply advisor remediation that could block extension or migration access.
- Surface the advisor warnings in deployment readiness.
