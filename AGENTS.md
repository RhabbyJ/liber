# AGENTS.md

## Repository map

Liber is a private real-estate buyer directory built with Next.js App Router,
TypeScript, Prisma, and Supabase Auth/Postgres/Storage.

- `apps/web/app` — pages and HTTP routes.
- `apps/web/server` — authorization, domain logic, and integrations.
- `apps/web/components` and `apps/web/lib` — UI and browser-safe helpers.
- `packages/db` — Prisma client, schema, and SQL migrations.
- `packages/validators` — shared input contracts.
- `scripts` — verification and operational tooling.

Use `docs/README.md` to find current documentation. Read the relevant section
notes and architecture/product contracts for the area being changed; do not
load the entire documentation tree. Archived plans are historical context.
For framework-specific behavior, consult the installed Next.js docs at
`apps/web/node_modules/next/dist/docs` (or the hoisted `node_modules/next/dist/docs`).

## Working agreements

- Complete authorized work end to end. Routine fixes, refactors, tests, and
  documentation updates do not need repeated approval.
- Improve architecture when a concrete correctness, security, performance, or
  maintenance problem justifies it. Preserve sound existing patterns and avoid
  speculative rewrites. Dependencies are allowed when needed; explain the cost.
- For multi-step work, keep a short plan with the goal, changes, verification,
  and non-goals. Delegate independent investigation when useful.
- Preserve unrelated user changes. Remove obsolete code within the work's
  scope. Keep comments focused on non-obvious behavior or invariants.
- Current user instructions govern scope. Use `docs/product/V1_DEFINITION.md`
  for existing behavior and `docs/product/CEO_ROADMAP.md` for direction; update
  them when approved work changes the product. Update architecture and section
  docs when their contracts change.

## Security and data boundaries

- Enforce authorization on the server using database-controlled identity and
  roles. Validate untrusted inputs at server boundaries.
- Preserve RLS, private Storage access, seller/admin gates, rate limits, and
  document immutability. Keep secrets and private data out of browser payloads,
  logs, and test output; use the existing authorized document-access paths.
- Use explicit test fixtures or guarded demo tooling for synthetic data; never
  represent it as real production activity.
- Keep applied migrations immutable. Test schema changes on a disposable target
  using the documented migration path. A code-change request does not itself
  authorize destructive operations or changes to shared production data.

## Commands and verification

From the repository root, use `npm ci` to install the lockfile and `npm run dev`
to start the app. Run the narrowest useful checks first:

- `npm run typecheck`, `npm run lint`, `npm test`, `npm run build`
- `npm run db:validate` for schema changes
- `npm run smoke:routes`, `npm run smoke:security`,
  `npm run smoke:no-auth-bypass`, `npm run smoke:visual` for relevant flows
- `npm run readiness:env` for environment readiness

Run server-starting smoke scripts sequentially. Add regression coverage for
meaningful bugs and changed contracts. Report only checks actually run, and
state missing credentials or other verification limits.

Finish with changed files, behavior changes, verification results, migration or
environment requirements, remaining risks, and whether product docs changed.

Instruction-file reference: [OpenAI AGENTS.md guidance](https://learn.chatgpt.com/docs/agent-configuration/agents-md).
