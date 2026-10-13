# Public launch verification — 2026-09-21

## Verdict and scope

Liber remains a controlled preview, not a public-launch-ready product. The
modular Next.js/Postgres architecture is appropriate; the immediate gaps are
release configuration, reliable background work, sensitive-upload processing,
and verification of the complete customer journey.

Goal: verify deployed health and actual buyer/seller contact, fix demonstrated
defects, and remove proven-unused code while retaining automated tests.

1. Inspect the deployed app, provider configuration, database policies and logs.
2. Exercise real login, invite and conversation endpoints using newly scoped
   fixture accounts without preview or administrator privileges.
3. Inspect the browser journey and rerun checks for the final local code.
4. Remove only this run's disposable fixtures and record unresolved launch work.

Non-goals: deploying the local changes, deleting existing test data, running
global email/maintenance queues, or changing the shared schema/provider settings.

The user clarified that cleanup means old, unused code, not deleting tests.
Existing database records were identified as test data; they are retained.

## Deployed state

- Production alias: `https://liber-one.vercel.app`.
- Deployment `dpl_7CjQZq1GARG9ur1RZpDsYmjU51zv` is READY at commit
  `59b421367b1f1897a87face438c7968a48d121ab` (August 12). The architecture fixes,
  dependency upgrades and subsequent cleanup in this workspace are not deployed.
- The public homepage, anonymous demand preview, Northridge area search and
  login form loaded successfully in the browser during this audit.
- Runtime error groups include September 15 Supabase DNS/pooler failures
  affecting authentication, geography and rate limiting. Current homepage/search
  success does not prove uninterrupted availability or resolve that incident.
- Vercel production environment metadata contains a Resend API key but no
  `RESEND_FROM_EMAIL`. Invite/unread/LOI delivery requires both values.
- Production also contains preview, automatic-confirmation and feature-cohort
  variable names. Their Secret values are not retrievable through environment
  pull, so this audit does not infer the currently configured flag values.

## Confirmed public-launch blockers

1. **Background work:** zero worker heartbeat rows; one email pending since
   August 12; two expired upload sessions still pending. No cron schedules are
   checked into `vercel.json`. Configure scheduling and prove fresh heartbeats,
   retries, actual delivery and expiry/cleanup.
2. **Preview privileges:** 13 active users retain preview-created ADMIN access.
   Review/revoke preview roles and replace unreviewed seller approvals before
   public access. Disabling flags alone does not undo stored grants.
3. **Sensitive uploads:** the selected private malware scanner is not implemented
   or configured. The approved scanning gate remains open.
4. **Email:** configure a verified sender, verify provider delivery and exercise
   signup confirmation, invitation and unread notification links end to end.
5. **Supabase hardening:** leaked-password protection is disabled. Supabase
   advisors also identify public PostGIS placement, `spatial_ref_sys` without RLS
   and three browser-executable SECURITY DEFINER functions. Resolve through the
   supported extension/provider process.
6. **Release evidence:** protected fresh/upgrade, full-schema concurrency and
   complete Auth/Storage staging gates require disposable environments. Do not
   repurpose their destructive harnesses against the shared project.

The login UI also lacks a self-service forgotten-password/reset flow. Account
identity-collision recovery is a different mechanism and does not fill that gap.

## Database evidence

Read-only snapshot on September 22 UTC (September 21 Pacific), before fixtures:
22 Auth/app users, 13 buyer profiles, 8 properties, 5 invites/conversations,
18 messages and 4 LOIs. All 33 migration names are successfully applied with
zero unresolved rows. The documented retained avatar migration checksum is the
only checked-in/ledger lineage difference.

Private Storage buckets, canonical Auth UUID/email linkage, active buyer
geography selections and the reviewed `app_private` helper ACLs passed catalog
inspection. Realtime policy is participant-only SELECT. These are catalog
checks, not substitutes for signed-in Storage/Realtime behavioral tests.

Seventeen legacy app tables retain unnecessary browser-role table privileges;
RLS with no policies denies ordinary row access. Plan a tested forward grant
cleanup. No Data API row leak was demonstrated. Two property-evidence foreign
keys lack covering indexes; measure before changing indexes. Unused-index
advisories on this small dataset are not evidence for deleting them.

## Verification results

- Final cleanup and Auth-worker checkpoint: `npm test` passed 420 web tests,
  31 validator tests and 40 Node script tests (491 total), with 16
  credential-gated web tests skipped. Static
  migration and supported-baseline checks also passed.
- Type checking, linting and the final production build (including the Auth
  worker fix) passed. Route/security smoke
  checks passed against the local production server, including anonymous route
  protection, private indexing headers and same-origin write enforcement.
- Auth-bypass and secret scans passed; production dependency audit reported zero
  vulnerabilities.
- `npm run readiness:production` correctly failed against local configuration:
  required mail/site/worker secrets are absent and local signup auto-confirmation
  is configured. This local result is not a report of Vercel secret values.

### Real request and browser proof

The local production build used the existing Supabase Auth/database with three
new reserved-domain fixture accounts. All three had ordinary roles; preview
elevation was disabled and feature cohorts contained the exact fixture UUIDs.
Account confirmation, approved seller access and property evidence were fixture
prerequisites. No Storage objects or actual ownership documents were created.

| Flow | Result |
| --- | --- |
| Normal password login | Buyer, seller and unrelated account obtained real Auth sessions through the application login endpoint; buyer/seller also logged in through the browser UI. |
| Seller discovery and contact | Browser directory, buyer profile, invite entry point and inbox loaded. Real rendered invite form submissions persisted one conversation, two participants and the guided opening. |
| Buyer activation and bidirectional messages | Seller follow-up was denied before buyer response. A buyer reply accepted the invite and activated messaging atomically. Both roles sent/read real persisted messages. |
| Concurrent retry | Two simultaneous submissions with one client message ID created one message. |
| Privacy and validation | Anonymous and unrelated reads/sends, cross-origin/missing-origin writes and oversized messages were rejected; participant DTOs omitted private Auth identifiers. |
| Read/mute/report | Read cancelled unread work; mute suppressed unread mail; unmute allowed a fresh batch. A report persisted once with restricted canonical evidence; outsider reporting was denied. |
| LOI | Buyer-only creation, private draft, submission, seller counter, buyer alignment, exact retries and changed-request conflicts passed. The browser displayed Terms aligned, two revisions and the correct price difference. |
| Decline and expiry | Real buyer Decline form preserved read-only history. An expired fixture invite became read-only without invoking maintenance. |
| Browser message delivery | A seller UI message appeared for the buyer, who replied through the UI. Another seller API message appeared in the open buyer thread without reload. This proves automatic refresh, not which Realtime/polling path delivered the hint. |
| Blocking | Both buyer and seller sends returned 409; read-only history and all browser test messages remained readable. Browser history remained visible and the reply composer disappeared. No pending unread work or preview ADMIN grants remained on fixture actors. |

The initial LOI test lacked the fixture's account name; the expiry test initially
violated the database's sent-before-expiry constraint. Both were corrected only
in scoped test data, preserving database constraints. Browser sign-out also
revoked the independently held seller test session; a new real login was needed
to distinguish authentication denial from blocked-conversation denial. Earlier
failed harness artifacts are retained alongside the completed evidence.

Local artifacts: `.artifacts/messaging-http-evidence.json`,
`.artifacts/public-launch-browser-evidence.json`, and
`.artifacts/messaging-browser-api-confirmation.json`. They contain no credentials.
The completed request proof records 23 passing check groups, including resume
and session-refresh checks; this count is not 23 independent customer journeys.

**Unproven boundaries:** signup/verification email delivery, forgotten-password
recovery, actual document upload/scanning/review, direct multi-user Storage and
Realtime authorization, migration rehearsals, external Auth-ban delivery, and
capacity/load testing. No external notification provider or global worker queue
was invoked. Passing these flows is not an A-to-Z public-launch certification.

Follow-up on 2026-09-22: removed the test-only `account-security.ts` and
`invite-integrity.ts` helpers and their mocked suites. Current worker, expiry
and property-integrity tests retain the relevant current-path coverage. Removed
the obsolete 30-day fallback and unused follow-up-count query. Missing/invalid
deadlines on unaccepted invites now fail closed; accepted history is preserved.
The legacy `test-auth-security-staging.mjs` command now exits with an explicit
failure before side effects. A modern disposable proof of suspension, confirmed
Auth ban/session revocation, Storage denial and identity recreation remains a
release gate; the retired harness is not evidence for the current schema.

## Cleanup and code fixes

Removed a never-imported Stat component, obsolete duplicate DTO/domain type
files, an unused admin DTO, a formatter for retired badges and uncalled
geography wrappers. Consolidated the public preview DTO and corrected the
seller API privacy test to use the actual runtime projection.

Public previews now emit only the existing supported condition labels, instead
of arbitrary buyer-supplied text. Regression coverage exercises both anonymous
and signed-in preview paths and preserves all supported labels.

The Auth-ban worker now claims one operation immediately before processing,
renews its owned unexpired lease before contacting Supabase, and fences final
updates by worker, attempt and lease expiry. Counters reflect committed
transitions. Expired eighth-attempt claims become terminal `FAILED` records
instead of remaining stuck in `PROCESSING`. Ten isolated PostgreSQL regressions
cover successful bans, waiting-work availability, stale/expired responses,
bounded retries and final-attempt recovery; seven failed before the fix.
External Auth calls are mocked, and no shared worker queue was executed.

### Fixture cleanup

All three new Auth/application accounts and their exact dependent fixture rows
were removed after verification. Cleanup locked and verified the fixture foreign
key closure, refused external mutable-domain references, and deleted only the
recorded primary keys. Immutable test-history removal used a transaction-local
trigger bypass; no global trigger, schema, migration or policy was changed.
The credential fields were then removed from the ignored fixture manifest.

A subsequent independent read-only Supabase query confirmed the original counts:
22 Auth/app users, 13 buyers, 8 properties, 6 documents, 5 invites/conversations,
18 messages, 4 LOIs and the original one pending email. Zero fixture users remain.
No existing test records or Storage objects were deleted. Temporary browser tabs
and the audit server were closed. Test rate-limit windows expire normally.
Cleanup evidence: `.artifacts/public-launch-fixture-cleanup-results.json`.

Automated tests, migration history and currently used preview controls remain.
The preceding architectural fixes and their validation are documented in
`ARCHITECTURE_AUDIT_2026-09-21.md`.
