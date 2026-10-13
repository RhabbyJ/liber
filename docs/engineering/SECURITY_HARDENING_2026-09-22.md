# Security and resilience hardening — 2026-09-22

## Scope and status

Goal: reduce concrete confidentiality, abuse, and resource-exhaustion risks in
the existing Next.js/Prisma/Supabase architecture. Preserve database-controlled
authorization, private Storage, canonical messaging, and immutable evidence.

Plan: harden request boundaries and preview privileges; bound uploads and
background work; reduce polling load; verify with regression tests, a production
build and browser checks; stage observable edge rules and record provider gates.
No speculative service split, schema rewrite, live data purge, production
deployment, paid service purchase, or attack/load test against shared providers.

These are local application changes plus an unpublished Vercel firewall draft.
They are not a public-launch approval or a promise of zero security incidents.

## Implemented application changes

| Boundary | Result |
| --- | --- |
| Preview privileges | `VERCEL_ENV=production` always denies preview self-elevation, seller self-approval, wildcard messaging/LOI cohorts and signup auto-confirm. Named preview requires Vercel Preview plus the exact CEO target; local development/test remains supported. Exact UUID production cohorts are retained. Existing elevated database roles are not automatically revoked. |
| Browser execution | Fresh nonce CSP on each page request, matching framework and navigation scripts; no unrestricted inline JavaScript or production eval. Nonce HTML is private/no-store. Mapbox still uses inline styles and blob workers. API routes retain restrictive static security headers and their own authorization; proxy no longer duplicates Auth work or adds cookies to public cacheable geography. |
| Input and request provenance | Streamed login cap 16 KiB, enrichment and upload-session JSON cap 8 KiB; declared and actual lengths enforced. Signup fields are bounded. Same-origin mutations reject malformed/conflicting signals, including logout. Forwarded IPs are trusted only on Vercel and are validated/canonicalized. Unconfigured self-hosted deployments share an unknown-IP bucket until a trusted adapter is implemented. |
| Public provider/database work | Validate malformed geocoding/enrichment input before Auth/database/provider calls. Public geography origin misses share a 120/minute IP quota. Public metadata uses browser 60-second/CDN 300-second caching; existing immutable geometry caching is retained. Quota/provider outages fail closed. |
| Private responses | Upload/image, enrichment/geocoding and seller-directory responses explicitly use private/no-store, including errors. Public responses never include provider/database diagnostic text. |
| Uploads | Finalization 60/minute/account; property-image signing 180/minute/account. Signature inspection reads at most 16 bytes, cancels excess response data, forbids redirects, and times out after 5 seconds. Finalization rechecks account status/role under lock. This is file-type validation, not malware scanning. |
| Confidential documents | Upload, finalization, admin listing/review and application signing are closed on public/unknown deployments until real private malware scanning is implemented. The UI disables file selection with an unavailable message. Development/test and explicitly configured controlled preview may use synthetic documents. Existing signed URLs and direct Storage policies are separate boundaries. |
| Admin documents | Queue pages at 50 records; URLs are issued only when an active administrator requests a specific pending document. Access is audited, signing is limited to 60/minute/account, and URLs expire after 60 seconds. Conditional pending-state updates prevent conflicting reviews from overwriting each other. |
| Expiry maintenance | Each category handles at most 25 rows per transaction, with a 15-second transaction budget. `SKIP LOCKED` and returned transitions drive notifications. Already-minimized mail is skipped. `expiration.hasMore` signals that another bounded invocation may be needed. |
| Messaging recovery | Healthy private Realtime uses a 30–36-second canonical fallback; disconnected threads and inboxes use 5–6 seconds. Requests run sequentially, stop while hidden/offline, back off to 60 seconds on failure, and recover on focus/online. LOI sidecar refreshes separately every 30–36 seconds and after lifecycle changes. |

Database authorization is still authoritative. Rate limits supplement it; they
do not replace membership checks, RLS or private Storage. PostgreSQL-backed
quotas consume database work themselves and cannot absorb a distributed attack.

## Vercel firewall draft

Read-only inspection found no active custom rules or prior draft. Two valid
rules were staged and individually inspected; neither has been published:

1. **Liber API and write traffic observation** — paths beginning `/api/` OR
   any POST, fixed 60-second window, 600 requests/IP, action **log** above the
   threshold. Includes Server Actions. This generous initial value needs real
   usage evidence, including multiple users behind one IP.
2. **Liber common exploit probe observation** — paths containing `/.env`,
   `/.git/config`, `/wp-admin`, or `/phpmyadmin`, action **log**.

Rules: `rule_liber_api_and_write_traffic_observation_I59dFD` and
`rule_liber_common_exploit_probe_observation_8xWVCl`. The reviewed diff is in the
ignored `.artifacts/security-firewall-draft.json` and the project's Firewall UI.

[Review the firewall](https://vercel.com/roberts-projects-2c330010/liber/firewall).
From the linked repository, inspect `npx vercel firewall diff`, then the operator
publishes with `npx vercel firewall publish --yes`. First observe legitimate
traffic, then test enforcement on Preview before applying production limits.
Log-only rules do not block attacks. Limits are per region, not one global
counter, and allowed traffic may incur charges. No plan upgrade was purchased.

Vercel supplies automatic platform DDoS mitigation on all plans; application
abuse still needs edge rules, bounded handlers, quotas and alerting.
Sources: [DDoS mitigation](https://vercel.com/docs/vercel-firewall/ddos-mitigation),
[WAF rate limiting](https://vercel.com/docs/vercel-firewall/vercel-waf/rate-limiting),
[Next.js CSP](https://nextjs.org/docs/app/guides/content-security-policy).

## Required launch work

- Deploy the reviewed application and roll out the firewall draft. Current
  production continues to run the older deployment until then.
- Complete exact-object/hash malware scan persistence and clean-only review
  with the approved private scanner, credentials, retention and region terms.
  See `UPLOAD_MALWARE_SCANNING.md`. There is no environment switch that may
  simply declare public documents clean.
- Remove/review synthetic profiles, trust signals and preview-granted ADMIN
  roles, and approve genuine seller access. This pass did not change existing
  shared records or assume which real account should retain administration.
- Configure per-minute outbox/Auth workers and bounded expiry invocations, with
  CRON_SECRET authentication, heartbeats, backlog age/error alerts and retries.
  Drain `expiration.hasMore` using subsequent invocations, not an unbounded loop
  inside one HTTP request. A daily single expiry call is insufficient at scale.
  Verify real email delivery and the sender configuration.
- Verify Supabase Auth leaked-password protection, account recovery, MFA for
  administrators, secure provider-team access and session revocation. MFA
  enrollment/step-up and recovery are not implemented by this change.
- Resolve the recorded Supabase-owned PostGIS security advisors and excessive
  legacy application-table privileges through a reviewed forward migration;
  do not mutate applied migrations or take ownership of managed extensions.
- Prove backup restore, retention and incident response; confirm monitoring,
  spend alerts and database/connection capacity. Run a bounded load rehearsal
  on an isolated environment before claiming a supported concurrency level.
- Repeat real multi-account Storage/Realtime denial and suspension/session
  lifecycle proofs on the current schema. Unit/isolated SQL tests cannot
  establish provider configuration or multi-connection behavior.

Signed-in homepage previews still load all eligible buyers by the explicit V1
contract. A paginated product flow is needed before that unbounded dataset
becomes large. Authenticated read quotas and indexing/query plans should be
measured alongside that change. No microservices rewrite is justified here.

## Verification

- `npm test`: **612 passed** (541 web, 31 validators, 40 script tests);
  **16 credential-gated tests skipped**. Baseline and static messaging/LOI
  migration checks in that command passed. The obsolete harness assertion was
  replaced by a real child-process check of its safe failure; that suite was
  rerun after the final TypeScript-only fixture-environment correction.
- `npm run typecheck`, `npm run lint`, production `npm run build`, route and
  security smoke checks, forbidden-auth-bypass and repository-secret scans
  passed. Production dependency audit reported zero known vulnerabilities.
- `npm run readiness:env` passed for local development, with missing-production
  configuration warnings for the local pepper, cron secret, email credentials/
  sender and canonical site URL. This is not a report of deployed secret values
  or a production-readiness pass.
- The security smoke checks verify fresh per-response nonces, every rendered
  script's matching nonce, no unrestricted inline-script policy, no-store HTML,
  anonymous private-route denial and cross-origin/missing-origin write denial.
- The local production build used `VERCEL_ENV=production` and a generated local
  quota pepper. Browser proof covered the public Mapbox map, area autocomplete,
  Northridge boundary selection, mobile navigation at 390×844, client navigation
  to role-prefilled signup and advancement to the account form. No warnings or
  errors were observed. The temporary tab/viewport and server were cleaned up.
- New regression coverage includes streamed body overflow/cancellation, request
  origin/IP validation, fail-closed quotas, document access and conflicting
  reviews, bounded signature streams, preview-production refusal, malformed
  invite deadlines, maintenance backlogs/rollback, and polling recovery.

Evidence logs are in ignored `.artifacts/security-hardening-*` files, including
`security-hardening-browser.json`. Prior actual buyer/seller messaging HTTP and
browser evidence is separately scoped in `PUBLIC_LAUNCH_VERIFICATION_2026-09-21.md`;
the authenticated lifecycle was not rerun during this follow-up browser pass.

No shared roles, existing records, Storage objects, migrations or deployed app
were changed by this follow-up. Normal read verification and quota bookkeeping
use the configured database. Confidential files were not sent to a scanner.
Live provider/session/Storage proofs, isolated concurrency/load testing and
restoration drills remain outstanding; passing unit tests is not proof of those
boundaries.
