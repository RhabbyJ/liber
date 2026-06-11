# AGENTS.md

Rules for AI agents working in this repository.

This file is intentionally **product-light**. It tells agents how to work. Product scope lives in `docs/product/V1_DEFINITION.md`. Vision lives in `docs/product/CEO_ROADMAP.md`. Backend details live in `docs/engineering/BACKEND_ARCHITECTURE.md`.

## Required reading

Before editing code, read only the docs needed for the task:

1. `AGENTS.md` — global agent rules.
2. `docs/README.md` — source-of-truth map.
3. `docs/product/V1_DEFINITION.md` — required for any customer-facing or workflow change.
4. `docs/engineering/BACKEND_ARCHITECTURE.md` — required for backend, auth, storage, schema, API, or security changes.
5. The matching `docs/sections/*.md` micro-doc for the files you will touch.

Do not treat old root-level planning docs or archived notes as source of truth.

## Operating mode

- Make the smallest correct change.
- Prefer existing patterns over new abstractions.
- Do not redesign adjacent code unless the task requires it.
- Remove only unused code created by your change.
- Do not silently change product behavior.
- Do not add dependencies unless the task explicitly requires them and the tradeoff is documented.
- Do not create fake data, fake credentials, or fake production behavior.

For multi-step work, maintain a short plan:

```txt
Goal:
Plan:
1. Change ... -> verify with ...
2. Change ... -> verify with ...
Non-goals:
```

## Security rules

- Authorization belongs on the server, not in UI hiding.
- Never expose service-role keys, private storage paths, or document URLs to the browser unless mediated by an allowed server path.
- Treat Supabase RLS and Storage policies as production security boundaries.
- Validate inputs at server boundaries with the existing Zod validators or a local equivalent.
- User-editable metadata must not drive authorization.
- Do not weaken rate limits, seller access checks, document immutability, or admin-only gates to make a UI easier.
- Do not print secrets in logs, test output, screenshots, or documentation.

## Product-change rules

- If a requested change expands product scope, first compare it to `docs/product/V1_DEFINITION.md`.
- If the change is outside v1, do not implement it as production behavior unless explicitly approved.
- If product behavior changes, update `docs/product/V1_DEFINITION.md` or `docs/product/CEO_ROADMAP.md` in the same change.
- If backend behavior changes, update `docs/engineering/BACKEND_ARCHITECTURE.md` and the relevant section micro-doc.

## Code comments

Keep code comments short and rare.

Good comments explain:

- a security invariant,
- a business rule that is easy to break,
- a cross-file dependency that is not obvious,
- or a temporary workaround with a removal condition.

Bad comments restate the code or paste product docs into source files.

When a longer explanation is needed, update the relevant `docs/sections/*.md` file instead of adding a large code comment.

## Testing and verification

Run the narrowest useful verification first, then broader checks when the change touches shared behavior.

Common commands:

```bash
npm run typecheck
npm test
npm run build
npm run db:validate
npm run smoke:routes
npm run smoke:security
npm run smoke:no-auth-bypass
npm run smoke:visual
npm run readiness:env
```

Do not claim a command passed unless you ran it. If a command cannot run, state why.

## Final response format

Every agent handoff should include:

- changed files,
- what changed,
- verification commands and results,
- migrations or environment changes,
- remaining risks or TODOs,
- and whether product docs were updated.
