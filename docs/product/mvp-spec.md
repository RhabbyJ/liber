# Liber MVP Spec

Liber is a searchable buyer directory for real estate. Buyers publish demand profiles. Sellers search those buyer profiles by geography, criteria, and trust signals, then send property invites.

## MVP Goal

Prove that sellers will use Liber to discover and contact serious buyers.

The v1 success loop is:

1. Buyer creates an active searchable profile.
2. Buyer adds property criteria.
3. Admin can grant a manually verified badge.
4. Seller searches a city/geography.
5. Seller filters buyer cards and opens a buyer profile.
6. Seller creates a property.
7. Seller sends an invite.
8. Buyer receives an in-app notification and transactional email.

## In Scope

- Auth and roles
- Buyer profile builder
- Buyer criteria by property category/subtype
- Public buyer profile
- Seller map/list search
- Seller property creation
- Invite flow
- In-app notifications
- Invite email
- Protected internal admin document and badge review

## Out of Scope

- True escrow
- Earnest money custody
- Automated offers/counteroffers
- Lender API integrations
- Paid upgrades/subscriptions
- Full dispute/review system
- Customer-facing admin analytics dashboard

## Product Safety

Badges are manually/admin controlled in v1. Financial and ownership documents are private. Seller invites are rate-limited. Liber must not represent itself as holding funds or providing lending approval without the operational/legal workflow behind it.

Production launch decisions are tracked in `docs/product/production-decisions.md`. Future agents should not invent those answers.
