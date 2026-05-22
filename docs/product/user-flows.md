# User Flows

## Buyer Profile Flow

1. Buyer signs up.
2. Buyer chooses buyer role.
3. Buyer creates profile with photo, bio, buying purpose, budget, down payment, and desired location.
4. Buyer adds one or more criteria records by property type.
5. Buyer submits profile and sets visibility to active.
6. Buyer can view invites and notifications.

Acceptance checks:

- Draft/hidden profiles do not appear in seller search.
- Active profiles appear only with privacy-safe fields.
- Criteria can support residential and commercial use cases.

## Seller Search Flow

1. Seller signs up.
2. Seller searches a city/geography.
3. Seller filters by property type, budget, badges, reviews, and criteria.
4. Seller sees buyer cards in list and map views.
5. Seller opens buyer public profile.

Acceptance checks:

- Map and list reflect the same result set.
- Badge filters only use active badges.
- Search remains explainable and deterministic.

## Seller Property and Invite Flow

1. Seller creates property details.
2. Seller uploads property images.
3. Seller optionally uploads ownership verification.
4. Seller selects or opens a buyer profile.
5. Seller writes invite title/body.
6. Seller sends invite.
7. Buyer receives notification/email.

Acceptance checks:

- Seller cannot invite from a property they do not own.
- Buyer profile must be active.
- Invite volume is rate-limited.

## Admin Verification Flow

1. Admin reviews users, profiles, documents, badges, and invites.
2. Admin approves/rejects documents.
3. Admin grants/revokes badges.
4. Admin can hide profiles or suspend users.
5. Sensitive actions write audit logs.

Acceptance checks:

- Pre-approval expires after 90 days.
- Expired badges no longer affect search.
- Private documents are never public.
