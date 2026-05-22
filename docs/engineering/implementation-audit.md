# Implementation Audit

Status: the active implementation-plan goal is complete. Core v1 is implemented and verified for local development; production launch remains blocked only by external keys and CEO/DB-owner decisions tracked in `docs/product/production-decisions.md`.

## Objective

Continue completing `Implementation.md` using `AGENTS.md` as the orchestration and quality guide.

Concrete deliverables:

- Read and apply `AGENTS.md`.
- Keep `Implementation.md` as the source-of-truth product and engineering plan.
- Keep `backend implementation plan.md` aligned with backend/Supabase/security decisions.
- Create the supporting product and engineering docs future agents need.
- Implement and verify the core v1 buyer-directory marketplace loop.
- Track, without inventing, the remaining external production decisions.

## Checklist

| Requirement | Evidence | Status |
| --- | --- | --- |
| Read and apply `AGENTS.md` | `AGENTS.md` updated with Liber-specific compliance and points agents to `Implementation.md` plus `backend implementation plan.md`. | Done |
| Phase 0 product/engineering docs | `docs/product/mvp-spec.md`, `docs/product/user-flows.md`, `docs/product/permissions.md`, `docs/product/production-decisions.md`, `docs/engineering/architecture.md`, `docs/engineering/data-model.md`, `docs/engineering/api-contracts.md`, `docs/engineering/agent-tasks.md`. | Done |
| Phase 1 scaffold | Next app under `apps/web`, packages under `packages/db`, `packages/validators`, `packages/ui`, Tailwind/global CSS, Prisma schema, Supabase helpers, Zod validators. | Done |
| Phase 2 auth and roles | `/login`, `/signup`, `/onboarding/role`, `apps/web/proxy.ts`, server role checks, role-less users routed to onboarding, admin not self-assigned. | Done |
| Phase 3 buyer profile | `/buyer/profile`, `/buyer/criteria`, `/buyer/badges`, `/buyers/[buyerProfileId]`; avatar upload, visibility, location, budget/down payment, criteria, badge display. | Done |
| Phase 4 seller search | `/seller/search`, buyer cards, checkbox selection, filters, sort, map/list shell, buyer profile links, PostGIS radius query path, property-fit filter tests. | Done |
| Phase 5 property and invite | `/seller/properties`, `/seller/properties/new`, `/seller/properties/[propertyId]/edit`, `/seller/invite/[buyerProfileId]`, `/seller/invites`; property image upload, ownership docs, invite notifications/email adapter. | Done |
| Phase 6 internal admin verification | `/admin/users`, `/admin/buyer-profiles`, `/admin/badges`, `/admin/documents`, `/admin/invites`, `/admin/reports`, `/admin/audit-log`; document review, badge grant/revoke, suspension, hide profile, audit logs. | Done |
| Phase 7 monetization design only | `docs/product/monetization-design.md`; excludes escrow and money custody. | Done |
| Compliance boundaries | `Implementation.md`, `backend implementation plan.md`, and `AGENTS.md` prohibit escrow, money custody, automated transaction execution, Fair Housing-risk filters, credential handling, and customer-facing admin analytics dashboard. | Done |
| Verification gates | `npm run db:validate`, `npm run readiness:env`, `npm run typecheck`, `npm test`, `npm run lint`, `npm run build`, `npm run smoke:routes`, `npm run smoke:no-auth-bypass`, and `npm run smoke:visual` pass. Route smoke starts a temporary dev server on an available local port and verifies protected buyer/seller/admin pages redirect unauthenticated users to login. Visual smoke captures public desktop/mobile PNGs into `.artifacts/visual-smoke`. | Done |

## Production Launch Blockers Outside This Goal

- Seller search has optional Mapbox Static Images rendering when `NEXT_PUBLIC_MAPBOX_TOKEN` is configured. Mapbox autocomplete/geocoding remains unwired because no product/token decision is present.
- Resend has not been live-smoke-tested because no verified production sender/domain should be assumed.
- `npm run readiness:production` intentionally fails until `CRON_SECRET`, Mapbox, and Resend production configuration are present.
- Supabase advisor items for `spatial_ref_sys`, `_prisma_migrations`, and PostGIS schema placement need an explicit DB-owner decision before production remediation.
- Screenshot-level visual QA exists through `npm run smoke:visual`. Playwright is still not installed as a first-class dependency; add it later only if interaction-level browser tests are needed.
- CEO/product decisions remain open for launch market, exact invite limits, acceptable ownership documents, verification wording, production admin assignment, email provider, Mapbox/geocoding, and Supabase advisor remediation. These are tracked in `docs/product/production-decisions.md`.

These items are not repo-side implementation-plan work. Future agents should not treat them as permission to invent business rules, create fake production keys, or auto-apply Supabase advisor changes.
