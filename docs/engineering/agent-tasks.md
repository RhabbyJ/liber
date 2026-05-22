# Agent Tasks

Use `AGENTS.md` and keep work scoped.

## Task Format

Each task should include:

- Goal
- Files owned
- Acceptance criteria
- Verification command or manual check
- Explicit non-goals

## Initial Build Order

1. Product and engineering docs
2. Repo scaffold
3. Prisma schema
4. Auth and roles
5. Buyer profile slice
6. Seller search slice
7. Property and invite slice
8. Admin verification slice
9. Monetization design only

## Ownership Guidance

- Database tasks own `packages/db/**`.
- Validation tasks own `packages/validators/**`.
- Frontend route tasks own the relevant `apps/web/app/**` route and local components.
- Shared UI tasks own `packages/ui/**`.
- Product/compliance reviews should focus on escrow, money custody, private documents, badge claims, invite abuse, and Fair Housing risk.
