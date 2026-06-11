# Section: Testing and Smoke Checks

## Purpose

Owns unit tests, route smoke tests, visual smoke tests, security smoke tests, and readiness checks.

## Main files

- `apps/web/**/*.test.ts`
- `scripts/route-smoke.mjs`
- `scripts/security-smoke.mjs`
- `scripts/forbidden-auth-bypass-smoke.mjs`
- `scripts/visual-smoke.mjs`
- `scripts/readiness-check.mjs`
- `package.json`

## Invariants

- No auth-bypass strings should be reintroduced.
- Protected routes should redirect/reject unauthenticated users.
- Visual smoke is for public/non-auth pages unless test auth is explicitly available.
- Do not weaken tests to make a bad change pass.

## Agent notes

Report exactly what ran and what did not. Do not claim a smoke check passed if the local browser/server was unavailable.
