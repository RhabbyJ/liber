Architecture verdict

Implementation record (2026-07-11)

The architecture-boundary recommendations below are implemented in the
modular monolith and deployed through Prisma migration
`20260711082500_close_property_identity_lifecycle`. The authoritative product
and deployment status is maintained in `docs/product/production-decisions.md`;
this original verdict remains as the implementation rationale.

The malware-scanner integration is the sole intentionally deferred item:
OPSWAT MetaDefender Cloud v4 paid private processing is documented, but no
scanner API or provisional clean-result behavior is present until production
credentials and private-processing terms are available. This remains a
public-launch blocker, not a controlled-pilot code dependency.

The architecture is moving in the right direction. Do not rewrite it, and do not split it into microservices. A modular monolith built around Next.js, Postgres/Prisma, Supabase Auth/Storage, RLS, canonical geography, SQL search, and a transactional outbox is appropriate for this product and stage.

However, I would not move directly into ordinary bug fixing yet. There are several architecture-level boundaries that are only partially implemented. Fixing workflow bugs before those boundaries are finalized will cause you to stabilize APIs and database behavior that you will shortly need to change again.

My assessment:

Architectural direction: 8/10
Implementation of the intended boundaries: about 5/10
Over-engineering: low to moderate; mostly organizational or speculative domain concepts, not excessive infrastructure
Recommended release state: controlled pilot, not public beta

Your own docs/product/production-decisions.md:18-29 and :43-88 already identify most of these concerns. That is encouraging: the design intent is strong. The implementation simply has not caught up to the stated architecture yet.

What is already correct and worth keeping

Keep these decisions:

The modular monolith. There is no reason to introduce microservices.
Supabase Auth UUIDs as immutable application identity, rather than email ownership. The implementation in apps/web/server/session.ts and the later identity migrations is directionally strong.
Postgres as the source of truth for authorization, user status, seller access, workflows, and business limits.
Deny-by-default RLS and private verification-document storage.
Canonical Market and ServiceArea records instead of carrying free-form locations throughout the system.
SQL-based seller search with keyset pagination. apps/web/server/seller-search-query.ts is substantially better than loading candidates and filtering in JavaScript.
The database outbox concept. Keep it in Postgres; you do not need Kafka or a separate message broker.
The anonymous homepage preview. apps/web/server/buyer-preview.ts:42-126 is already narrowly projected, uses coarse budget bands, omits identities and IDs, and approximates coordinates. Do not rewrite that portion unnecessarily.

The major problem is not the technology selection. It is that several workflows cross database, Auth, Storage, and email boundaries without a complete state machine or recovery protocol.

Architecture work to complete before routine bug fixing

1. Replace the universal Buyer object with explicit data contracts

This is the clearest privacy-boundary problem.

buyerFromDb() in apps/web/server/contracts.ts:223-323 produces one broad object containing:

The Auth userId
Buyer profile and criteria IDs
Canonical service-area ID and slug
Exact service-area center
Raw lat and lng
All badges
Owner-oriented criteria details

That same object is loaded through the broad buyerInclude at contracts.ts:568-593, used by seller search at :507-532, and passed into client components. BuyerCard also uses userId as an avatar seed. This directly conflicts with the rules in production-decisions.md:53-60.

Fix

Create separate, route-specific read models:

type OwnerBuyerProfileDTO = { /_ full owner-editable fields _/ }
type SellerBuyerSummaryDTO = { /_ card and map fields only _/ }
type SellerBuyerDetailDTO = { /_ authorized seller detail _/ }
type PublicBuyerPreviewDTO = { /_ anonymous approximate preview _/ }
type AdminBuyerDTO = { /_ moderation data _/ }

Each query should use a narrow Prisma select. Do not load a broad internal object and sanitize it afterward.

For seller-facing results:

Do not serialize the Auth UUID.
Do not expose criteria row IDs or service-area UUIDs.
Do not expose exact centers or raw coordinates.
Exclude inactive and expired badges in the query itself.
Generate map coordinates on the server at the required privacy precision.
Use the buyer profile ID, an opaque public ID, or a dedicated avatar seed—not the Auth UUID.
Explicitly join/filter User.status = ACTIVE.

Keep the current anonymous preview implementation, but give it the same explicit active-user check.

Also move production DTO types out of apps/web/lib/mock-data.ts. Production services should not depend on a fixture module for their contracts.

2. Make buyer publication one atomic command

The current buyer publication workflow commits an active profile before saving criteria:

// apps/web/server/form-actions.ts:44-53
formData.set("visibilityStatus", "ACTIVE");
const { data: buyer } = await updateBuyerProfile(formData);
await upsertBuyerCriteria(formData);

If the second operation fails, the database can contain an active buyer with missing or stale criteria.

There is also no unique constraint on BuyerCriteria.buyerProfileId; the schema only has an ordinary index at packages/db/prisma/schema.prisma:314-339. The current findFirst followed by create/update is vulnerable to concurrent duplicate rows.

Fix

Replace the two public service calls with one command:

saveBuyerProfile({
mode: "DRAFT" | "PUBLISH",
profile: ...,
primaryServiceAreaId: ...,
criteria: ...,
})

Inside one transaction:

Resolve and validate the owner.
Lock or create the buyer profile.
Resolve the active canonical service area.
Upsert exactly one criteria record.
Validate all publication requirements.
Set the profile to ACTIVE last.
Write the audit event.
Commit.

Add a database unique constraint:

model BuyerCriteria {
buyerProfileId String @unique
}

Before adding it, write a migration that detects and resolves any duplicates.

For concurrent edits, use either:

A row lock around the buyer profile, or
Serializable isolation with bounded retry

Do not accept buyerProfileId from the profile form as authority. Resolve the current user’s profile on the server.

A database trigger or deferred invariant for “active buyer must have exactly one primary active area and exactly one criteria row” is reasonable. Keep user-friendly validation in the application, but put the final invariant in the database.

3. Add a real property identity and evidence lifecycle

SellerProperty currently has no identity version or durable lifecycle beyond ownership verification status (schema.prisma:369-404). Address and location fields can be changed without invalidating prior approval, while reviewDocument() aggregates all ownership evidence ever attached to the property (contracts.ts:1650-1666).

That means evidence approved for one address or property identity can remain effective after identity-relevant fields change.

There is another semantic problem: the seller checks ownershipConfirmed, but that assertion is not stored as a durable domain record. It is effectively treated as a form field and audit event.

Fix

Add:

PropertyStatus =
| "DRAFT"
| "READY_FOR_REVIEW"
| "READY_FOR_INVITES"
| "ARCHIVED"

And add an identity version:

identityVersion Int @default(1)
addressFingerprint String?
providerPropertyId String?
authorityAttestedAt DateTime?
authorityAttestedByUserId String?
attestationVersion String?

Every ownership document should be stamped with the property identity version it supports:

propertyIdentityVersion Int?

When an identity-relevant field changes:

Increment identityVersion.
Reset ownership status to PENDING or NOT_SUBMITTED.
Prevent the property from being used for new invites.
Preserve old evidence for audit, but do not count it toward the current version.

Identity-relevant changes should include address, parcel/provider identity, and owner/entity identity. Bedroom count, description, or photos should not reset ownership.

Persist the seller’s assertion as an authority attestation, not as proof that Liber verified ownership. Record the actor, time, and terms/policy version.

The V1 rules require an ID that matches the title owner or entity decision-maker plus address-linked evidence (docs/product/V1_DEFINITION.md:258-264). The current data model cannot fully represent that decision. Add a structured admin decision/checklist tied to the property version rather than relying only on “two documents approved.”

4. Redesign uploads around direct Storage upload and finalization

The application currently passes image and document files through Server Actions:

Buyer verification: apps/web/server/form-actions.ts:87-98
Property images and ownership documents: :101-116
Application limits: 10 MB images and 20 MB documents

That will not work reliably on the intended deployment architecture. Next.js Server Actions default to a 1 MB request body, and Vercel Functions have a 4.5 MB request/response payload limit. Raising the Next.js limit would not remove Vercel’s limit.

Supabase recommends resumable uploads for files above 6 MB and supports signed upload URLs.

Fix

Use this workflow:

Browser requests an upload session from the server.
Server authorizes the user, property/profile, document type, filename, expected size, and MIME type.
Server creates an UploadSession row with a server-selected Storage path.
Server returns a signed upload URL/token.
Browser uploads directly to Supabase Storage.
Browser calls a finalize endpoint.
Finalize verifies:
Session ownership
Expected object path
Actual object size and type
Upload-session expiry
Property/profile identity version
Finalize creates the VerificationDocument or PropertyImage row and marks the session finalized.
A cleanup job removes abandoned sessions and orphaned objects.

Suggested upload-session states:

PENDING
UPLOADED
FINALIZED
REJECTED
EXPIRED

For sensitive documents, add asynchronous malware/content scanning before making them reviewable. The current initial-byte MIME check is useful, but it is not a complete safety boundary.

Do not try to create a distributed transaction between Postgres and Storage. Use a compensating/finalization workflow.

Also add a unique constraint on PropertyImage.storagePath.

Property image privacy

The initial migration creates property-images as a public bucket at packages/db/prisma/migrations/20260519000000_initial/migration.sql:567-583. That conflicts with the product definition that properties are private invite context, not public listings (V1_DEFINITION.md:240-258).

A public Supabase bucket bypasses access controls for retrieving and serving objects; anyone possessing the URL can access the file.

Make the bucket private. Issue short-lived signed download URLs only to:

The property owner
An admin
A buyer with an invite status you explicitly decide should grant access

Do not send raw Storage paths to browser DTOs. If you eventually need public thumbnails, create separately derived, deliberately public thumbnails rather than making private originals public.

5. Make suspension effective across DB, Auth, and Storage

suspendUser() currently updates User.status and buyer visibility, but does not:

Suspend SellerAccess
Revoke or ban Auth sessions
Prevent direct Storage access using an already-issued token
Invalidate outstanding signed URLs

See apps/web/server/contracts.ts:1822-1845.

Revoking refresh tokens alone is insufficient for immediate enforcement because an already-issued Supabase access-token JWT remains valid until it expires.

Fix

The moderation command should:

In one database transaction:
Set User.status = SUSPENDED
Set all buyer profiles to SUSPENDED
Set SellerAccess.status = SUSPENDED
Disable invite/property actions
Write an audit event
Enqueue an Auth-revocation operation
A reliable worker performs the Supabase Auth ban/session revocation with retries.
Storage RLS checks the application user’s current database status for every sensitive operation.

Create a helper such as:

app_private.is_active_app_user(auth.uid())

Use it in verification and property Storage policies. Property image writes should additionally require appropriate seller access.

This database check is what blocks an existing still-valid JWT. Auth revocation is still useful, but it is not the only enforcement mechanism.

Use short expirations for signed document URLs because an already-issued signed URL cannot be recalled before its expiration.

6. Make invite creation and invite transitions concurrency-safe

There are several related issues.

Expiry

respondToInvite() checks stored status but does not atomically require expiresAt > now(). A buyer can potentially respond after expiry if the maintenance job has not updated the status.

Use an atomic state transition:

UPDATE "Invite"
SET status = 'ACCEPTED'
WHERE id = $1
AND "buyerProfileId" = $2
AND status IN ('SENT', 'VIEWED')
AND "expiresAt" > now()
RETURNING \*;

At read time, treat an overdue invite as expired even if the stored status has not yet been updated.

Daily quota

sendInvite() counts recent invites before starting the insert transaction (contracts.ts:1322-1364). The database trigger also performs count-then-check behavior without serializing concurrent requests. Two requests can observe the same count and both insert.

Serialize invite creation per seller using one of:

pg_advisory_xact_lock() keyed by seller ID
A lock on the seller-access row
A dedicated quota-counter row

Then perform validation, count, insert, notification, and outbox creation in one transaction.

The partial unique index preventing multiple active invites for the same seller/property/buyer already exists. Keep it; the application precheck is only for a friendly error.

Also define whether the quota means a rolling 24 hours or a calendar day. The code currently uses a rolling 24-hour window while naming it “today.”

7. Finish the outbox rather than replacing it

The outbox approach is correct. Its worker is not yet safe.

apps/web/server/email-outbox.ts:6-58:

Selects jobs and then marks them SENDING separately.
Allows two workers to select the same job.
Has no lease.
Can leave jobs permanently stuck in SENDING.
Does not store a worker ID or provider message ID.

sendInviteEmail() returns a successful-looking mock result when Resend is unconfigured, and the worker ignores the result and marks the job SENT (email.ts:27-37, email-outbox.ts:30-41).

Finally, vercel.json runs email processing only as part of a once-daily maintenance cron. An invite email should not wait up to a day.

Fix

Add:

lockedAt DateTime?
leaseUntil DateTime?
workerId String?
providerMessageId String?
idempotencyKey String @unique

Claim rows atomically using FOR UPDATE SKIP LOCKED or an UPDATE ... RETURNING claim query. Reclaim expired leases.

Missing email configuration in a non-development environment must be:

A readiness failure, or
A retryable/terminal job failure

It must never become SENT.

Dispatch email frequently and independently from daily expiration maintenance. Keep expiration as daily if desired; run outbox processing every minute or use a supported queue trigger.

Pass an idempotency key derived from the outbox event ID to Resend. Resend supports idempotency keys specifically so retries do not resend the same email.

You do not need Kafka, RabbitMQ, or a separate worker service to solve this.

8. Tighten badge-to-evidence semantics

This is one meaningful omission I did not see fully captured in the architecture notes.

grantBadge() only verifies that the supplied document:

Belongs to the buyer
Is approved

It does not verify that the document type is compatible with the badge (contracts.ts:1695-1733).

Consequently, an approved identity document or generic OTHER document could technically support a verified-funds or cash-buyer badge.

Fix

Create one authoritative compatibility matrix:

const badgeEvidenceRules = {
PRE_APPROVED: ["PRE_APPROVAL"],
VERIFIED_FUNDS: ["VERIFIED_FUNDS"],
VERIFIED_IDENTITY: ["IDENTITY"],
} as const;

Then make product decisions for the remaining concepts:

Cash buyer: derive from purchase type plus current verified-funds evidence rather than granting a separate unrelated assertion.
Earnest-money deposited: disable until there is an explicit earnest-money evidence type and clear wording. Liber must not imply it holds funds.
Completed transaction: disable until actual platform transaction history exists.
Non-contingent: this sounds more like a buyer preference or reviewed claim than a verified financial badge. Model it separately unless you define qualifying evidence.
OTHER documents: never allow them to support financial badges.

If linked evidence is later rejected, invalidated, superseded, or expired, automatically revoke or expire the associated badge.

This is a good example of code you should remove or disable for now. Leaving unsupported trust signals in the enum and admin interface creates more risk than value.

9. Replace process-local rate limiting

apps/web/server/rate-limit.ts stores counters in a global in-memory Map. On a serverless deployment, different instances and cold starts will have different counters.

Some search/profile limits also use AdminAuditLog as a quota counter. That mixes two responsibilities and still has count-then-write races.

Fix

Use one shared atomic rate-limiter interface backed by either:

A small Postgres rate-limit table/function, which is likely enough at this stage, or
A managed shared counter service

Separate:

Abuse controls: user/IP/action rate limiting
Business invariants: invite quota enforced transactionally in Postgres
Security auditing: append-only audit events

Do not create a general-purpose distributed-policy engine. One small adapter with explicit endpoint policies is sufficient.

10. Establish a real reproducible quality gate

I ran the repository checks.

npm ci completed.
npm run lint exits successfully but does not execute a linter. No workspace currently defines a lint script, and there is no project ESLint configuration.
Type-checking and the full test suite are not reproducibly green from the packet because the generated Prisma client is absent.
Prisma generation could not complete in this sandbox because the Prisma engine download host was unavailable through DNS, so I am not treating all resulting type errors as intrinsic code defects.
Most existing unit tests that did not require the generated client passed, but the clean checkout cannot presently prove the refactor is safe.
There is no .github CI workflow.
Sentry/PostHog appear in environment/readiness references but are not actually instrumented.
Fix

CI should run, in order:

npm ci
Deterministic Prisma generation
Prisma schema validation
Real ESLint
Type-check
Unit tests
Production build
Fresh-baseline migration test
Upgrade test from the exact last deployed migration
RLS and Storage security tests using separate users/connections
Auth identity collision/deletion/reuse tests
Seller-search query-plan threshold tests

Make readiness test actual dependencies, not just environment-variable presence:

Database connection
Expected migration head
Active market and service-area dataset
Required buckets and privacy mode
Critical Storage policies
Email provider configuration
Recent outbox-worker heartbeat

Until this gate exists, smaller debugging will be harder because you will not know whether a local fix broke a different workflow.

What I would remove or simplify
Remove now

packages/config

It is effectively empty. Delete it until there is genuinely shared configuration.

packages/ui in its current form

It appears to contain only a cn helper and is not providing meaningful shared UI. Inline or move that helper into the web application. Reintroduce a UI package when a second application or a real component system exists.

Production dependencies on mock-data.ts

Move shared contracts into feature DTO modules. Keep mock data strictly for fixtures, stories, and tests.

Unsupported badge concepts

Disable earnest-money and completed-transaction badges for now. Move non-contingent out of the verified-evidence badge system unless evidence rules are defined.

Refactor, do not remove

apps/web/server/contracts.ts

At roughly 1,900 lines, it contains buyer queries, buyer commands, seller search, properties, documents, badges, invites, and admin moderation. Its size is not just cosmetic—the broad DTO privacy issue came from this concentration.

Split by feature:

server/
buyer/commands.ts
buyer/queries.ts
seller-search/query.ts
properties/commands.ts
properties/queries.ts
uploads/service.ts
invites/service.ts
verification/service.ts
admin/moderation.ts

Do not introduce a repository framework, command bus, dependency-injection container, or generic CQRS machinery. Plain feature modules and explicit transactions are enough.

Migration history

If any migration has reached a shared environment, never rewrite it. Test an additive upgrade path.

If the shared preview environment is disposable and the latest migration series has genuinely never been deployed—as the documentation says—consider creating a clean baseline in a fresh project instead of carrying every prototype-era migration indefinitely. Supporting both a clean baseline and a known upgrade path is valuable; preserving unused migration archaeology is not.

Do not build

Do not add:

Microservices
Kafka or a general event bus
A separate search engine
A generic repository abstraction
Event sourcing
Temporal tables merely to stabilize seller pagination
Multi-region database architecture
A distributed transaction coordinator for Storage and Postgres

For seller pagination, the current cursor’s snapshotAt only freezes creation eligibility and badge-expiry comparisons; profile budgets and sort fields can still change between pages. Either describe it honestly as live keyset pagination or, only if exact paging becomes necessary, temporarily cache the ordered ID set. Do not build a temporal data platform for this.

Items that can follow after the core fixes

These matter before a broad public launch but should not distract from the lifecycle work above:

Replace production CSP 'unsafe-eval' and ideally 'unsafe-inline' with nonce/hash-based policy where Next.js and Mapbox permit it (apps/web/next.config.mjs:15-39).
Change exact-address property enrichment from GET query parameters to a POST body with private, no-store; exact addresses should not appear in URLs and access logs.
Add bounded timeouts and explicit retry policies to ATTOM, Mapbox, Resend, and other external calls.
Move service-area suggestion filtering into SQL or a versioned per-market cache once the full LA dataset makes loading every active area inefficient.
Make the audit table append-only for the application role and add retention rules.
Add outbox payload minimization and cleanup after an appropriate retention period.
Triage dependency audit findings before public launch.
Add structured logging, request IDs, error reporting, outbox-age alerts, upload-finalization alerts, and seller-search latency metrics.
Recommended implementation order
Schema and invariant migration
Unique buyer criteria
Property identity version and status
Evidence version fields
Upload sessions
Outbox lease/idempotency fields
Property-image path uniqueness
Split DTOs and query projections
Owner, seller summary, seller detail, public preview, admin
Remove Auth UUIDs and internal IDs from browser responses
Replace upload flow
Direct signed upload
Finalization
Cleanup
Private property bucket
Finish enforcement
Suspension across user, seller access, Auth, and Storage
Property re-verification after identity changes
Badge/evidence compatibility
Make workflows atomic
Buyer publication
Invite creation and transitions
Outbox claiming and retry
Install the quality gate
Generation, lint, typecheck, tests, build, migrations, RLS/Storage integration
Then begin normal workflow debugging and smaller fixes

So the conclusion is: keep the new architecture, but treat it as an unfinished architecture migration rather than a completed foundation. The large structural choices are sound. Close the transaction, privacy, upload, property-evidence, suspension, invite, and outbox boundaries first; after that, ordinary bug fixing is the correct next phase.
