# CTO Integration Evidence — 2026-07-10

This evidence records the final local review of code commit `1077175` on branch
`codex/cto-la-launch-integration`. It does not authorize deployment or LA-wide
availability.

## Reviewed scope

- Integrated the Auth/security, buyer atomicity, seller property integrity,
  public/seller DTO privacy, and SQL seller-search workstreams.
- Replaced all LA-launch abuse boundaries with the generic shared limiter and
  added ACTIVE-user row-lock rechecks around publication, property writes, and
  post-upload binding.
- Removed the obsolete in-memory seller search, the unused 327-line fixture
  dataset, and display-string ownership verification decisions.
- Kept legacy profile-photo owner writes disabled, matching the generated-avatar
  V1 architecture.
- Added normal CI, protected disposable proof workflows, and protected
  production environment presence/format validation.
- Reserved but did not promote migration order `00017`–`00022`.
- Reviewed isolated geography commit `0ae12d7`; it remains non-activating and
  intentionally excluded from this integration commit.

## Local verification that passed

The following ran in `C:\Users\rjega\liber-cto-integration` with non-secret,
syntactically valid local/CI placeholders where build-time configuration was
required:

| Command | Result |
| --- | --- |
| `npm run db:generate` | Prisma Client 7.8.0 generated |
| `npm run db:validate` | schema valid |
| `npm run lint` | real ESLint completed with zero warnings |
| `npm run typecheck` | all workspace TypeScript checks passed |
| `npm test` | 4 database-target guard tests passed; 121 web tests passed and 2 guarded suites skipped; all 13 validator tests passed |
| `npm run build` | Next.js 16.2.6 production build passed; 33 routes/pages generated |
| `npm run smoke:no-auth-bypass` | passed |
| `npm run smoke:routes` | passed, including protected-route redirects and Auth error/recovery states |
| `npm run smoke:security` | passed, including security headers, robots behavior, unauthorized provider/search API denial, and bad-origin rejection |
| `npm run readiness:env` | local contract passed; production-only Mapbox, ATTOM, Resend, and cron values correctly remained warnings |
| `node --check` on all six guarded database/Auth harness scripts | passed |
| YAML parse of all three `.github/workflows/*.yml` files | passed |
| `git diff --check` | passed |
| `npm audit --audit-level=high` | exited successfully; no high/critical advisory |

The dependency audit still reports two moderate findings for PostCSS 8.4.31
bundled by Next.js 16.2.6. npm offers only an invalid breaking downgrade to
Next 9.3.3; no forced downgrade or misleading override was applied.

## Gates not run or not closed

- No migration, Auth Admin operation, Storage lifecycle, or application write
  was sent to the shared Supabase project.
- The two guarded web suites skipped locally were the service-area database E2E
  and the synthetic 25K seller-search benchmark. The latter now has a dedicated
  Postgres 17 CI job, but that GitHub job has not run for this commit.
- The protected geography, identity, Auth/Storage, buyer atomicity, and seller
  integrity workflows were not executed because branch-specific disposable
  credentials and human environment approval were not available in this local
  review.
- Exact fresh migration replay remains blocked at historical migration `00005`
  by `spatial_ref_sys` ownership. Upgrade harnesses that execute SQL directly do
  not replace a final `prisma migrate deploy` ledger/checksum rehearsal.
- The production readiness workflow has not run with deployment environment
  values. Even when it passes, it checks presence/format only, not connectivity,
  matching provider keys, Resend domain verification, leaked-password settings,
  deployed migrations, query plans, or Supabase advisors.
- Realistic LA-volume seller-search `EXPLAIN (ANALYZE, BUFFERS)`, final index
  decisions, and post-migration security/performance advisors remain open.

## Migration and environment state

- Shared migration history was observed read-only through `00012`; `00013`–
  `00016` were absent on 2026-07-10.
- Reserved order is `00017` Auth/security, `00018` buyer atomicity, `00019`
  seller integrity, `00020` search indexes, `00021` inactive LA staging, and
  `00022` separate activation. See `MIGRATION_VERSION_PLAN_2026-07-10.md`.
- The integration runtime is schema-ahead and must not deploy before its exact
  dependent proposals are numbered and proven.
- Production requires a 32+ character `AUTH_RATE_LIMIT_PEPPER`; despite its
  historical name, it protects all generic shared-limiter identifiers.
- GitHub must configure protected environments `disposable-geography-proof`,
  `disposable-security-proof`, and `production-readiness` with required
  reviewers, no self-approval, restricted branches, exact reviewed SHA input,
  and the variables/secrets named in their workflow files.

## Geography review disposition

The isolated LA proposal contains a checksummed 661-record inactive dataset and
no activation writes, but it is not integration-ready. It still needs direct
lookup A→B race fixes, an importer denylist union, an explicit transaction and
aborting assertions, complete immutable-field conflict checks, an FK index,
and executable rollback restoration for modified inactive rows. Geography PR1
fresh/upgrade proof remains a prerequisite.

## Release verdict

The integrated application code is ready for review and protected disposable
proof. Liber is not ready for deployment of this schema-ahead branch or for an
LA-wide beta. Keep the controlled pilot until every open database, geography,
environment, plan/advisor, and UI gate in `docs/product/production-decisions.md`
is closed with current evidence.
