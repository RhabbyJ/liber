# Dependency Audit — 2026-07-11

Command: `npm audit --omit=dev`

Result: six findings (one high, five moderate). No automatic fix was applied because the proposed forced fixes downgrade Prisma to 6.19.3 or Next to 9.3.3 and would be breaking/unsafe.

- `hono` and `@hono/node-server` are transitive dependencies of the Prisma CLI's `@prisma/dev` package. They are build/migration tooling, not imported by the Liber runtime. Upgrade when Prisma publishes compatible patched transitive versions; keep CLI execution off public request paths.
- Next 16.2.6 bundles PostCSS 8.4.31, which is flagged for unsafe CSS stringification. Liber does not stringify user-controlled CSS. No override was applied in the July 11 review; the July 14 update below supersedes that decision after a compatible same-major override was verified.

Re-run the audit before public launch and after Prisma/Next upgrades. A high-severity finding that reaches a public runtime path blocks launch.

## Production-hardening update — 2026-07-14

Commands:

- `npm audit`
- `npm audit --omit=dev`

Result: zero findings in both the full and production-only dependency trees.

Next 16.2.6 still pins PostCSS 8.4.31 internally. The root lockfile now forces
PostCSS 8.5.19 across the workspace, which is within the same supported major
version and contains the `GHSA-qx2v-qp2m-jg93` fix. The production build and
complete repository test suite must pass with this override. Keep it pinned
until a tested stable Next release carries PostCSS 8.5.10 or newer directly,
then remove the override rather than maintaining it indefinitely.

CI now rejects moderate-or-higher dependency advisories. Do not use
`npm audit fix --force`; review and test every dependency or override change.
