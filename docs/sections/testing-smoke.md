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
- Demo/test buyer data may be used for smoke and CEO demo verification only when clearly seeded and removable.
- Tests and smoke scripts must not depend on fake data being present in true production.
- After auth, nav, or protected-route changes, run a focused browser auth pass covering signed-out CTAs, buyer signup/login/logout, buyer-to-seller intent, seller signup/access gating, both-role signup when supported, and mobile nav/logout.
- Browser auth QA failures or inconclusive results should include a screenshot or compact state dump with URL, relevant DOM attributes, visible text excerpt, and console errors.

## Agent notes

Report exactly what ran and what did not. Do not claim a smoke check passed if the local browser/server was unavailable.
