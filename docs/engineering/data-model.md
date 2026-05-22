# Data Model

Primary models:

- `User`
- `BuyerProfile`
- `BuyerCriteria`
- `BuyerBadge`
- `SellerProperty`
- `PropertyImage`
- `VerificationDocument`
- `Invite`
- `Notification`
- `Review`
- `AdminAuditLog`

## Notes

- A user can be buyer, seller, admin, or buyer+seller.
- User IDs mirror Supabase Auth UUIDs.
- Users can be suspended without deleting their auth account.
- Buyer profiles are the searchable marketplace asset.
- Buyer criteria supports residential and commercial fields.
- Common filter fields are normalized.
- Subtype-specific criteria lives in `extraCriteria`.
- Documents are private and status-driven.
- Badge changes and moderation actions are audited.
- Invite status tracks seller outreach lifecycle without implementing offers.
- Seller invite limits are lower until property ownership is verified.

The canonical schema lives in `packages/db/prisma/schema.prisma`.

Remote status:

- Initial schema migration is applied in Supabase.
- Storage-policy migration removed broad public listing on the `property-images` bucket.
- Index migration covers nullable foreign keys flagged by Supabase performance advisors.
- Storage migration added the public `profile-photos` bucket.
- Integrity migration enforces one `BuyerBadge` row per buyer profile and badge type.
- Core buyer/seller/admin server actions are wired to these tables for real Supabase users only.
- Buyer profile photo uploads update `User.avatarUrl` after writing to `profile-photos`.
- Buyer verification document uploads create pending `VerificationDocument` rows after writing files to `verification-documents`.
- Property image uploads create `PropertyImage` rows after writing files to `property-images`.
- Ownership document uploads create `VerificationDocument` rows after writing files to `verification-documents`.
- Seller search uses normalized buyer criteria for property-fit filters: bedrooms, bathrooms, square feet, lot size, cap rate, and units.
- Fixture data may support public examples and unit tests, but protected app behavior must use real Supabase Auth sessions and persisted database rows.
