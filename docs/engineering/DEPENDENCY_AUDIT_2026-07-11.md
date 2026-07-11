# Dependency Audit — 2026-07-11

Command: `npm audit --omit=dev`

Result: six findings (one high, five moderate). No automatic fix was applied because the proposed forced fixes downgrade Prisma to 6.19.3 or Next to 9.3.3 and would be breaking/unsafe.

- `hono` and `@hono/node-server` are transitive dependencies of the Prisma CLI's `@prisma/dev` package. They are build/migration tooling, not imported by the Liber runtime. Upgrade when Prisma publishes compatible patched transitive versions; keep CLI execution off public request paths.
- Next 16.2.6 bundles PostCSS 8.4.31, which is flagged for unsafe CSS stringification. Liber does not stringify user-controlled CSS. Upgrade through a supported patched Next release rather than overriding Next's internal dependency or downgrading the framework.

Re-run the audit before public launch and after Prisma/Next upgrades. A high-severity finding that reaches a public runtime path blocks launch.
