# Liber LOI V1 — Final Implementation, Audit, and Release Record

**Finalized:** 2026-07-16

**Implementation disposition:** complete in source; exact two-user cohort must remain disabled until the release gates in this document are recorded

**Product classification:** separately gated V2 offer-preparation initiative; it does not expand the core V1 marketplace boundary

## Document authority

This is the sole LOI completion, audit, and release artifact. It supersedes the
temporary implementation blueprint and both dated LOI audit documents that were
used while the feature was being built.

The repository-wide sources of truth still apply:

- `docs/product/V1_DEFINITION.md` owns the product boundary;
- `docs/product/CEO_ROADMAP.md` owns sequencing and expansion approval;
- `docs/engineering/BACKEND_ARCHITECTURE.md` owns shared backend and security
  architecture; and
- `docs/sections/loi-negotiation.md` is the short routing micro-doc for agents.

Those files are not competing LOI audit artifacts. If implementation, this
document, and a higher-priority repository-wide source conflict, stop release and
reconcile the conflict before changing production behavior.

## Final release verdict

The source implementation closes the identified state-machine, transaction,
idempotency, authorization, presentation, migration, and test-harness defects.
It is suitable for continued local and protected disposable-environment proof.
It is **not yet authorized for a real-user cohort** because protected database
proof, authenticated Realtime/browser evidence, scheduled-worker evidence, and
counsel approval remain open. The retained production migration ledger has now
been reviewed and its one comment-only historical checksum variant is preserved
as exact, project-scoped evidence.

Merely wiring a protected workflow is not evidence that the workflow ran. Keep
`LIBER_LOI_V1_ENABLED=false` until every open gate in this document has an
artifact tied to the exact reviewed commit.

## Scope

LOI V1 is a non-binding term-alignment workspace linked one-to-one with an
accepted invite and its canonical private conversation. It lets the two
authoritative invite participants:

- prepare owner-private drafts;
- submit an immutable buyer-authored initial revision;
- alternate immutable counters;
- decline or align on the exact current revision;
- withdraw under the limited rules below; and
- retain an auditable history for later formal contract preparation.

“Terms aligned” means only that the two participants selected one exact proposed
term revision for later document preparation. It is not legal acceptance or a
signature.

### Non-goals

LOI V1 does not:

- create, execute, or accept a purchase agreement or legal offer;
- generate a contract or PDF;
- collect an electronic signature;
- open or instruct escrow;
- appoint an escrow, title, warranty, or lender provider;
- verify earnest money or any deposit;
- provide payment or wire instructions;
- hold or transfer funds;
- invite agents, attorneys, lenders, or other third parties into the workflow;
- support attachments, simultaneous editing, or free-form messaging as
  authoritative LOI state;
- generate legal clauses with AI;
- interpret legal holidays or business-day rules automatically; or
- expose commission terms before product and counsel approve a separate schema
  and copy.

Messaging may link to the workspace and show a safe effective status. Message
bodies never contain authoritative LOI terms and cannot mutate LOI state.

## Participants and start conditions

The immutable LOI participants are the buyer and seller captured when the
negotiation is created. An existing negotiation is authorized against
`LoiNegotiation.buyerUserId` and `LoiNegotiation.sellerUserId`, not a later owner
of the invite's mutable buyer-profile relation. Reassigning a buyer profile
therefore cannot transfer access to an established negotiation.

Only the authoritative buyer may create the negotiation. Creation requires all
of the following:

- an accepted invite;
- its active canonical conversation;
- active buyer and seller users with the expected roles;
- an active buyer profile;
- approved seller access;
- a ready, ownership-approved, unflagged seller property;
- a current invite/property identity version;
- property ownership still bound to the authoritative seller;
- no block in either direction;
- a usable current buyer-account name and invite-time property-snapshot price; and
- both immutable participant UUIDs as the exact enabled two-user cohort.

Runtime gating and production readiness apply the same cohort rule to the raw
comma-separated member list: it must contain exactly two entries and exactly two
case-insensitively unique UUIDs. A duplicate-expanded value such as `A,B,B` is
rejected instead of being silently collapsed to a valid pair.

The buyer-account name and property-snapshot price are needed only to create safe starter
terms. Once a negotiation exists, ongoing eligibility does not depend on later
edits to those starter-only values. Starter purchase price comes from the
immutable invite-time property snapshot, not a mutable current listing price.

## Authoritative state machine

PostgreSQL is authoritative for lifecycle. UI hiding is never an authorization
boundary.

```text
AWAITING_BUYER_SUBMISSION (sequence 0)
  | buyer submits immutable revision 1
  v
AWAITING_SELLER_RESPONSE (odd buyer-authored current revision)
  | seller submits counter
  v
AWAITING_BUYER_RESPONSE (even seller-authored current revision)
  | buyer submits counter
  v
AWAITING_SELLER_RESPONSE ...

Any active state may reach its allowed terminal state:
  TERMS_ALIGNED | DECLINED | WITHDRAWN | EXPIRED | READ_ONLY
```

### Action rules

| Situation | Authorized actor | Allowed action |
| --- | --- | --- |
| Sequence zero | Buyer | edit/save/reset/submit initial draft, or withdraw |
| Submitted, unexpired current revision | Current author | withdraw only |
| Submitted, unexpired current revision | Counterparty | agree, decline, or create/submit a counter |
| Expired or ineligible | Neither | read only |
| Terminal | Neither | read only |

Revision one is always buyer-authored and has kind `INITIAL`. Every later
revision has kind `COUNTER`, extends the immediately prior revision, and must be
authored by the opposite role. Only the counterparty to the current unexpired
revision may agree or decline.

Pre-submission withdrawal is buyer-only, uses no revision, and is terminal.
Post-submission withdrawal is permitted only to the author of the exact current
unexpired revision. It references that revision, is terminal, and preserves the
immutable history.

### Deadlines and effective status

Each submitted revision has an absolute timestamp with offset. Submission
accepts a response deadline at least one hour and at most 30 days from the
locked server-side check. The current deadline is reloaded under the mutation
lock before draft, submit, decision, and withdrawal transitions that depend on
it.

The canonical read model derives effective status in this order:

1. preserve an already terminal stored outcome;
2. report `EXPIRED` when the exact current deadline has passed; then
3. report `READ_ONLY` when ongoing eligibility is lost; otherwise
4. return the active stored status.

The conversation card uses the same effective status as the workspace. This
prevents a stale “waiting” card while persistence maintenance has not yet run.

Expiry maintenance persists `EXPIRED` with `RESPONSE_EXPIRED`. Eligibility
reconciliation persists `READ_ONLY` with the exact reason, deletes private
drafts, appends a system `FROZEN` event, and cancels pending/failed LOI email.
Neither path overwrites a previously terminal business outcome.

The conversation card remains an optional fail-closed messaging sidecar. The
browser fetches it from the separately authorized
`GET /api/conversations/:conversationId/loi` endpoint with an independent
request guard and timeout; the server page and canonical messaging refresh do
not await it. Its summary path performs no LOI-table lookup for disabled or
invalid cohort configuration, returns only allowlisted link/status fields, and
emits fixed throttled failure telemetry. An unexpected or slow LOI summary can
hide only the card; it cannot delay or fail the authorized conversation read or
prevent a successful message response from rendering immediately.

## Terms schema version 1

All objects are strict and reject unknown fields. Text is trimmed and normalized
to NFC. Money uses integer cents, percentages use integer basis points, and
durations use bounded integer days or months. The maximum monetary value is
10,000,000,000 cents ($100,000,000.00).

| Section | Persisted semantics |
| --- | --- |
| Parties | Buyer legal/entity name; buyer contact name, company, email, and phone; vesting/taking-title note |
| Purchase and funding | Purchase price plus exactly one of cash, financed, or structured seller financing |
| Deposit | Percentage basis in basis points or a fixed amount in cents |
| Timing | Closing, inspection, disclosure, title, optional appraisal, and optional loan-contingency durations |
| Possession | At closing, positive days after closing, seller rent-back, tenant remains, or described other terms |
| Representation | Buyer-represented flag and conditional agent contact |
| Providers and costs | Proposed escrow/title choices, seller credit/note, customary or alternate cost allocation, and optional warranty |
| HOA and personal property | HOA fee-payer choices, conditional included-item list, and excluded items |
| Additional terms | Proposed terms and explicit exclusions |

### Conditional and cross-field rules

- Purchase price is positive.
- Financed terms require down payment not above price, a lender name or company,
  an allowlisted loan type, and a note when loan type is `OTHER`.
- Seller financing requires positive principal; cash down plus principal must
  equal price; annual interest is 0–5,000 basis points; term, amortization, and
  balloon are positive and at most 600 months; amortization cannot be shorter
  than term; balloon cannot exceed term; and interest-only terms must leave
  amortization null.
- Switching a funding union constructs a new compatible object. Switching to
  cash also clears loan contingency.
- A fixed deposit and seller credit cannot exceed price.
- Closing duration is 1–365 days. Other contingency durations are 0–365 days or
  null where optional.
- Days-after-closing and seller rent-back durations are positive. Rent-back also
  records cents and daily, weekly, or monthly frequency.
- Tenant-remains and other possession require narrative detail. Switching the
  possession union clears incompatible fields.
- A represented buyer needs agent name plus email or phone. An unrepresented
  buyer must have all agent fields cleared.
- A custom escrow or title provider needs a name or company.
- If customary closing costs are false, alternate allocation text is required;
  when customary costs are true, alternate allocation must be empty.
- An included home warranty requires company, positive maximum, and payer. Payer
  `OTHER` requires an explanatory allocation note; other payer choices forbid
  that note. An excluded warranty must retain the cleared canonical defaults.
- Included personal property requires at least one item. Each item must remain
  nonblank after trimming and is normalized at the validator boundary; blank-only
  entries are rejected. When not included, the included-item array must be empty.
  Up to 50 items of 120 characters each are accepted.
- Contact limits are name/company 160, email 254, and phone 40 characters.
  Buyer legal name is limited to 200; major notes are limited to their explicit
  500, 1,000, 2,000, or 4,000 character schema bounds.

### Versioned calculations

`schemaVersion = 1` and `calculationVersion = 1` are persisted with drafts and
revisions. The server loads the exact saved draft and recomputes the summary; no
route accepts a client-computed summary.

Calculation version 1 derives:

- earnest-money cents;
- earnest-money basis points;
- loan amount;
- loan-to-value basis points;
- remaining down payment after deposit; and
- effective price after seller credit.

Percentage-to-cents and ratio calculations use deterministic integer half-up
rounding. Historical views validate and display the immutable stored summary
with its recorded calculation version; they never silently recalculate an old
revision with newer code.

The editor uses a smaller validated financial projection for live preview, so a
valid money edit can recalculate the snapshot even while an unrelated required
text field is incomplete. Full terms validation still gates save and submit.

## Workspace and decision UI

The client has four explicit modes:

| Mode | Meaning |
| --- | --- |
| `CURRENT` | Exact canonical current revision or sequence-zero state |
| `HISTORICAL` | A deliberately pinned immutable older revision |
| `EDITING` | Owner-private local/server draft |
| `REVIEWING` | Exact clean server-saved draft being prepared for submit |

On a canonical current-sequence, revision, or status change, editing/reviewing
returns to `CURRENT`, action-attempt state and decision dialogs clear, and the
user is told to review the new state. Deliberately pinned history stays pinned,
shows a prominent current-version warning, uses the selected revision for the
sidebar, and hides all current-version mutations until the user returns to
current. A clean draft adopts a newer server draft; dirty local input is
preserved and marked stale until the user explicitly loads the canonical draft.

Initial reset, counter discard, and resume are distinct:

- **Reset initial draft** removes any server draft, recreates starter terms, and
  remains in editing without a page reload.
- **Discard counter draft** removes the private counter and returns to the
  submitted current revision with Counter still available.
- **Resume private draft** restores the exact current owner draft.
- An explicit start/counter action appears whenever editing is authorized.

Submission requires a clean server-saved draft with exact draft ID, draft
version, and basis sequence. Unsaved or stale input disables review/submit.

A versioned presentation registry orders and labels every persisted term,
formats cents and basis points for people, excludes schema metadata, handles
discriminated-union fields, and produces old-to-new semantic diffs. The exact
review and decision surfaces show:

- immutable property identity/address and identity version;
- revision number, author role, submitted timestamp, and exact deadline;
- every applicable persisted term in plain language;
- removed as well as added/changed union fields;
- recalculated values in a separate labelled section;
- the non-binding contract-preparation notice; and
- a confirmation action naming the exact revision.

Recent canonical history is capped at 20 revisions. Older revisions use an
authorized `beforeSequence` page and merge without duplicates. Five-second
visible/online polling and focus recovery remain canonical fallbacks; private
Realtime identifiers only prompt a refetch.

Money inputs retain raw edit text, update preview on every valid value, and
normalize cents on blur. Server term errors are allowlisted, bounded, never echo
submitted values, visually mark the field and section, set `aria-invalid`, and
focus the first exact rendered control. Conditional error routing distinguishes
funding and possession unions and routes aggregate warranty/agent errors to the
actual missing control.

Decision confirmation uses the native modal dialog. The browser supplies modal
focus containment; the implementation sets safe initial focus, handles Escape
and backdrop policy, restores focus, disables dismissal while recording, and
shows mutation failures inside the dialog. Desktop and narrow layouts keep
review, history, summary, deadline, and action controls usable without relying
on color. Authenticated responsive and assistive-technology proof is still a
release gate, not inferred from source.

## Server authorization and privacy

Every route and mutation requires an authenticated authoritative participant and
the exact enabled participant pair. Existing negotiation membership is anchored
to immutable LOI participant IDs. Ongoing eligibility is re-read from
authoritative users, invite, conversation, property, seller access, property
identity, and block state.

Unauthorized, malformed, out-of-cohort, and missing negotiation IDs collapse to
generic unavailable/not-found behavior where required. Authorization happens
before deep term validation, so outsiders cannot use validation differences as
an ID oracle.

Mutation routes require same-origin request protection and strict JSON. Bodies
are streamed with fatal UTF-8 decoding and capped at 48 KiB even if
`Content-Length` is missing or false. Responses use `Cache-Control: private,
no-store`. Logs contain codes/status/name only, never terms, email contents, or
submitted values.

Authenticated participants may receive up to 24 allowlisted term paths with
bounded messages after authorization. Unsupported paths and submitted values
are not returned.

Shared database-backed rate limits are:

| Operation | Per-user limit |
| --- | --- |
| Create | 10/hour |
| Draft save | 120/hour |
| Draft reset/discard | 30/hour |
| Submit | 20/hour |
| Agree/decline | 20/hour |
| Withdraw | 20/hour |

## Database and Supabase boundaries

All four LOI tables have RLS enabled. Raw CRUD privileges are absent for
`PUBLIC`, `anon`, `authenticated`, and `service_role`; the browser cannot use
the Data API to read or write terms. Application access goes through reviewed
server routes and the server database role.

The single private Realtime receive policy accepts an exact `loi:<uuid>` topic
only through `app_private.can_join_loi_topic(text)` for an authenticated active
participant. Browser insert/broadcast policies remain absent. Database triggers
broadcast identifiers and event type only, never terms, calculations, email,
property snapshot, or private draft content.

Realtime is a delivery hint. Every event, reconnect, focus recovery, and poll
uses an authorized canonical server refetch before changing the UI.

## Concurrency and idempotency

Canonical workspace reads use one repeatable-read snapshot and resolve the
current revision by `currentRevisionId`. Mutations use serializable transactions
and a fixed lock order:

1. the existing buyer/seller pair advisory lock shared with messaging;
2. invite row;
3. conversation row; and
4. negotiation row when it exists.

The service then re-reads access and eligibility, locks the mutable draft when
needed, re-reads the immutable current revision, and compares expected sequence,
draft ID/version, and revision ID.
Prisma `P2034` serialization/write conflicts retry up to three transaction
attempts; exhaustion returns a privacy-safe `409` rather than a generic `500`.

`LoiEvent` enforces one `clientActionId` per negotiation. Create, submit,
agree, decline, and withdraw compute a versioned SHA-256 fingerprint from
canonical JSON containing actor, action, negotiation, and every request field
that changes meaning. Submit additionally persists a versioned fingerprint of
the exact saved draft ID, version, negotiation, and normalized terms.

- Same key + same actor/type/revision/fingerprint returns the existing result.
- Same key + any changed semantic input returns `409`.
- A retry never trusts client-provided hashes or summaries.

Revision and event database triggers reject updates/deletes. Event-shape checks
and the actor-validation trigger bind participant/system actor presence, role,
current revision, author/counterparty semantics, and sequence-zero cases to the
event type. The actor user foreign key uses `ON DELETE RESTRICT` so event
retention is explicit.

## Notifications and email

Each committed submit, decision, or post-submit withdrawal creates an in-app
notification and a content-free `LOI_UPDATE` outbox job for the counterparty.
The outbox payload is empty and the template contains only an authenticated
workspace link and generic update text. It never contains terms, prices,
deadlines, property address, or provider choices.

Delivery idempotency is `loi-update:<immutable-event-id>:<recipient-user-id>`.
A response cancels pending/failed mail to the actor; a newer update cancels an
older pending/failed job to the recipient. Immediately before provider send, the
worker revalidates:

- the event UUID parsed from the exact idempotency key;
- that event's negotiation, current revision, type, actor, status, and recipient
  relationship;
- immutable participants and active roles;
- accepted invite and active conversation;
- approved seller access;
- property ownership, readiness, approval, and identity version;
- no participant block; and
- the exact two-user cohort.

Ineligible jobs are cancelled rather than sent. These checks do not replace the
open live-provider and scheduled-worker release evidence.

## HTTP and page surface

| Method and route | Purpose |
| --- | --- |
| `POST /api/loi/negotiations` | Buyer creates/gets the one invite negotiation with action UUID |
| `GET /api/loi/negotiations/:id` | Canonical participant read model with recent history |
| `PUT /api/loi/negotiations/:id/draft` | Create/update exact owner draft with expected version/sequence |
| `DELETE /api/loi/negotiations/:id/draft` | Reset/discard exact owner draft with expected version/sequence |
| `POST /api/loi/negotiations/:id/submit` | Submit exact saved draft and deadline |
| `POST /api/loi/negotiations/:id/agree` | Align on exact current revision |
| `POST /api/loi/negotiations/:id/decline` | Decline exact current revision |
| `POST /api/loi/negotiations/:id/withdraw` | Withdraw sequence zero or exact current authored revision |
| `GET /api/loi/negotiations/:id/revisions?beforeSequence=N` | Fetch the next authorized 20-revision history page |

`/negotiations/:id` is the participant-only workspace and is registered with
the shared authenticated-page route guard. The accepted
conversation contains only a safe status/link card and buyer-only start action
when creation eligibility is present.

## Data model and database invariants

### `LoiNegotiation`

- one row per invite and per canonical conversation;
- immutable buyer, seller, property, identity-version, and property-snapshot
  bindings;
- exact current revision foreign key and monotonic sequence;
- active versus terminal sequence rules, including valid sequence-zero
  `WITHDRAWN`/`READ_ONLY`; and
- exact status, `closedAt`, and `closedReason` mapping.

### `LoiDraft`

- unique per negotiation/owner;
- owner and owner role must match immutable participants;
- exact basis sequence/revision relationship;
- positive optimistic `draftVersion`; and
- strict versioned terms owned only by the current drafting participant.

### `LoiRevision`

- unique monotonic sequence per negotiation;
- revision one has no parent and is buyer-authored `INITIAL`;
- later revisions point to the immediately prior revision and alternate roles;
- deadline is later than submission time;
- versioned terms and version-matched computed summary; and
- immutable update/delete trigger.

### `LoiEvent`

- unique action UUID per negotiation;
- immutable update/delete trigger;
- retained actor foreign key;
- participant events bind to authoritative participant and current revision;
- system expiry/freeze events have no actor; and
- event-shape and trigger checks enforce creation, submission, decision,
  withdrawal, expiry, and freeze semantics.

### Outbox and maintenance

`EmailOutbox` stores LOI negotiation, revision, and recipient foreign keys with a
short delivery lookup index. Messaging block and maintenance paths freeze LOIs
inside their existing authoritative transactions. This is why LOI migrations
must deploy before application code even when the feature flag remains off.

## Migrations and checksum policy

Two additive migrations are authoritative in both the normal migration root and
the locked current-baseline forward root. The copies are byte-identical.

| Migration | Purpose | SHA-256 |
| --- | --- | --- |
| `20260716030741_add_loi_negotiations` | Base models, constraints, triggers, RLS/grants, Realtime helper/broadcast, outbox integration | `27ece835990b92f9e035af019a615ae8196260244e8b0214d3828d6f22d31245` |
| `20260716120000_harden_loi_event_semantics` | Forward closed-state mapping, retained actor FK, event shape, and authoritative actor/revision validation | `bdc6e7b88c02b71b27b907de14601b0dfacdde937f11ff56ad7262dbc614ba86` |

The base migration bytes above are now immutable. The semantic cleanup is a
separate forward migration specifically so retained environments never require
an in-place history edit.

A read-only inspection during this implementation session found the configured
database latest at `20260715215000_reconcile_email_outbox_lease` with neither LOI
migration recorded. The workspace release archive contained the same base bytes
shown above. This evidence applies only to that inspected target and archive; it
does **not** prove every retained, shared, staging, or production database.

Before any deploy, compare every retained environment's successful,
non-rolled-back `_prisma_migrations` rows and checksums with the reviewed local
files. If any environment records a different base checksum, stop. Do not edit
the local history again and do not use `prisma migrate resolve` merely to silence
the mismatch. Preserve the real lineage and prepare a reviewed reconciliation or
forward repair.

The retained Liber Supabase project `qfjcrhkjlczvzakxives` records checksum
`14b7876154c7f480d2d4d481edfed2ce0a74f70cc99065b58c7e585af7a38004`
for `20260707000009_add_avatar_variant`. The exact applied bytes are archived
under `packages/db/prisma/retained-lineage`; their executable SQL is identical
to the canonical migration and only full-line comments differ. Production
readiness accepts that checksum only when the API and direct database URLs both
resolve to that exact project, both archived and canonical bytes retain their
pinned checksums, and comment-stripped SQL remains identical. Every other
target and migration still requires the canonical checksum. No ledger row is
rewritten and `prisma migrate resolve` is not used.

Migration SQL line endings are explicit in `.gitattributes`. Both LOI forward
copies are forced to LF so byte-identity checks pass on Windows and Linux. The
one older migration that production originally recorded with CRLF remains
explicitly CRLF; the locked baseline generator normalizes pre-cutoff source
line endings before enforcing its source digest.

The guarded upgrade harness requires the immediate pre-LOI state whose latest
migration is `20260715215000_reconcile_email_outbox_lease`. A proof-only Prisma
config stages the reviewed chain through the base LOI migration, verifies its
checksum and pre-repair catalog, seeds a valid two-revision/four-event aligned
negotiation, and then applies the forward repair through the normal migration
root. It proves the exact terms, summary, revision chain, events, actors, and
terminal outcome survive before testing the repaired constraints. The guarded
fresh harness resets through `prisma.baseline.config.ts`. Both final states
assert the two exact ledger checksums plus tables, RLS, raw grants, immutable
triggers, terminal sequence rules, deadline and event-shape checks,
closed-reason mapping, retained actor FK, outbox index, and the single bounded
private Realtime policy.

## Audit closure

| Finding | Final treatment |
| --- | --- |
| No real PostgreSQL LOI workflow/race proof | Added sentinel-guarded fresh, upgrade, and service behavior harnesses; wired both targets into the protected exact-SHA workflow. Execution remains a release gate. |
| Root test failed because secret-scan test was absent | Restored the secret-scan test and retained it in the root test chain. |
| Terminal sequence-zero state could reopen an editor | Starter terms require exact active initial status, buyer role, eligibility, and `EDIT`; terminal reads expose neither starter nor draft. |
| Initial discard trapped the buyer | Added distinct reset-in-place, counter discard, and start/resume flows. |
| Refresh mixed displayed and actionable revisions | Added explicit modes, deterministic reconciliation, historical banner/sidebar, hidden history actions, stale-draft handling, and current-change dialog reset. |
| Review was mechanically formatted/incomplete as a decision surface | Added the versioned presentation registry, exact property/deadline metadata, complete semantic old-to-new diffs, separate recalculations, exact-version dialogs, and cents/basis-point formatting. |
| Idempotent keys did not prove request equality | Added canonical versioned request fingerprints for create/submit/agree/decline/withdraw and exact saved-draft fingerprints for submit. |
| Migration had an unsafe edit-history question | Froze the base checksum, added a separate forward hardening migration, and made all retained-environment checksums a deployment gate. |
| Retained production checksum differed from canonical history | Preserved the exact applied bytes, proved the executable SQL differs only by comments, and added an exact-project readiness exception that fails closed for every other checksum or target. |
| Windows checkout broke byte-identical LOI migration proof | Pinned both normal and current-baseline LOI SQL paths to LF and retained the historically applied CRLF exception explicitly. |
| Expiry and eligibility loss could persist different terminal outcomes depending on timing | Mutation and block paths now preserve expiry precedence; blocking still deletes private drafts and cancels queued delivery without rewriting an effectively expired terminal state. |
| Money preview updated too late or vanished on unrelated validation | Added controlled raw money input and a validated financial-only live preview. |
| Conversation card could show stale stored status | Reused canonical effective expiry/eligibility status. |
| Long-form validation did not guide users | Added participant-authorized bounded field maps, exact conditional focus routing, visual field/section errors, and schema-matched controls. |
| Material semantics were ambiguous | Added positive possession durations, warranty `OTHER` note, alternate closing-cost allocation, tenant narrative, union clearing, cash contingency clearing, and hidden-field canonicalization. |
| Dialog accessibility behavior was incomplete | Replaced the custom dialog surface with native modal behavior plus explicit initial focus, Escape/backdrop policy, focus restoration, busy protection, compact exact-version summary, and in-dialog errors. |
| History was unbounded | Capped canonical history at 20 and added authorized incremental pagination. |
| Draft deletion was not rate limited | Added the shared 30/hour discard/reset limit. |
| Visible mojibake | Replaced corrupt source strings and added a regression check. |
| Event FK/shape semantics were incomplete | Added `ON DELETE RESTRICT`, exact closed-state mapping, event-shape constraint, and authoritative actor/current-revision trigger in the forward migration. |

Independent review also fixed issues not explicitly isolated in the dated audit:

- existing membership now uses immutable LOI participant IDs;
- serializable `P2034` conflicts retry and end in a safe conflict;
- starter-only creation eligibility is separate from ongoing eligibility;
- starter price uses the immutable snapshot;
- deep term validation runs only after participant/cohort authorization;
- aggregate field errors target the actual missing control;
- decision failures remain visible inside the modal;
- contact control lengths match the shared schema;
- personal-property included items reject blank-only values at the shared
  validator boundary;
- seller-financing cash down at or above purchase price reports the precise
  `funding.cashDownPaymentCents` error while preserving positive principal;
- the comma-list control accommodates all 50 permitted 120-character items plus
  separators;
- production readiness rejects duplicate-expanded LOI cohort values with the
  same exact-two-entry and exact-two-unique-member rule as the runtime gate;
- delivery-time email revalidation is bound to the immutable event, preventing
  a claimed stale submission/counter job from becoming deliverable after agree,
  decline, or withdrawal changes the status on the same revision;
- `/negotiations` now uses the shared authenticated-page segment guard, so a
  signed-out workspace request follows the normal login redirect without
  imposing one participant role;
- successful messaging replies now render from the authorized POST response,
  malformed blank/timestamp-less responses fail closed, overlapping canonical
  refreshes coalesce through a behavior-tested trailing-refresh coordinator,
  and optional LOI enrichment uses a separately authorized request that cannot
  delay, hide, or fail the underlying conversation; and
- runtime and production-readiness LOI cohort parsers reject empty comma
  segments, including doubled or trailing separators; and
- expired current revisions cannot be overwritten with `READ_ONLY` when an
  eligibility loss or participant block happens at the same time.

## Verification record

### Verified locally in the 2026-07-16 implementation session

- `npm run lint` passed with zero warnings.
- `npm run typecheck` passed for the web app and validator package.
- `npm test` passed: database-target 5/5, readiness 15/15, demo-buyer 4/4,
  secret-scan 9/9, web 340 passed with 16 protected tests skipped across 81
  passing and 4 skipped files, and validators 30/30. The locked baseline check
  covered 26 sources plus five forward migrations with digest
  `e1adcdc2370a7dd66127fc8c1c30f139afd0f4b63c6e7580e6f8db3041b56eb3`.
- `npm run db:validate` and `npm run db:generate` passed with Prisma 7.8.0.
- `npm run build` passed with Next.js 16.2.6 and emitted the LOI API,
  independently authorized conversation-sidecar API, and
  `/negotiations/[negotiationId]` routes.
- `npm run smoke:routes`, `npm run smoke:security`,
  `npm run smoke:no-auth-bypass`, `npm run smoke:visual`, and
  `npm run smoke:secrets` passed. The public visual smoke covered desktop and
  mobile home/login/signup surfaces; it did not substitute for authenticated
  LOI evidence.
- No authenticated browser session was available for the exact buyer-reply
  journey. That regression is covered by route, response-normalization,
  refresh-coordinator, and source-contract tests, but an authenticated staging
  browser check remains a release-evidence step.
- `npm run readiness:env` passed locally while correctly warning that
  `AUTH_RATE_LIMIT_PEPPER`, `CRON_SECRET`, `RESEND_API_KEY`,
  `RESEND_FROM_EMAIL`, and `SITE_URL` are not configured in the local
  environment.
- The proof-only staging Prisma config validated, all three LOI proof scripts
  passed syntax checking, both copies of each LOI migration are byte-identical,
  and the static LOI migration audit passed.
- The database-backed service suite remains skipped unless its explicit
  disposable URL, 16+ character sentinel, write opt-in, exact migration
  checksums, and shared-target deny list are all present.

### Additional release-preparation verification on 2026-07-16

- `npm run lint`, `npm run typecheck`, `npm run db:validate`, and
  `npm run db:generate` passed.
- `npm test` passed: database-target 5/5, readiness 19/19, demo-buyer 4/4,
  secret-scan 9/9, web 349 passed with 16 protected tests skipped, and
  validators 30/30. The LOI migration audit and locked-baseline check passed on
  Windows after the cross-platform line-ending rules were added.
- Focused LOI and messaging expiry-precedence tests passed 21/21.
- `npm run build`, `npm run smoke:routes`, `npm run smoke:security`,
  `npm run smoke:no-auth-bypass`, `npm run smoke:secrets`, and the default
  `npm run smoke:visual` desktop/mobile capture passed for its public
  home/login/signup surfaces. On the Chromium path, the harness selects
  Chromium first on Windows, uses explicit SwiftShader rendering, and applies a
  five-second virtual-time budget. This is not authenticated LOI UI evidence.
- Readiness verifies exact-project retained-lineage acceptance and rejection on
  every other project.
- A read-only production preflight confirmed PostgreSQL 17.6, the immediate
  pre-LOI ledger boundary, absent LOI relations/types, compatible Realtime
  policy shape, and no blocking `EmailOutbox` data.
- The production migrations were not applied in this pass. A direct migration
  attempt was stopped before execution because explicit production-database
  approval is required; the LOI flag and real-user cohort must remain disabled.

### Implemented and wired, but not executed here

- `npm run db:test-loi:upgrade`
- `npm run db:test-loi:behavior` on the upgrade target
- `npm run db:test-loi:fresh`
- `npm run db:test-loi:behavior` on the fresh target
- the `disposable-loi-proof` job in `.github/workflows/release-proof.yml`

Those commands intentionally require protected disposable targets. No local or
configured shared database was reset or written to provide substitute evidence.

### Open real-user cohort gates

- Record both protected fresh and immediate-pre-LOI upgrade runs against the
  exact reviewed commit, including the lifecycle/race suite on each target.
- Prove two independent database connections for submit/submit, submit/block,
  submit/expiry, exact retry, and same-key/different-request cases.
- Record participant versus outsider HTTP, raw Data API, and private Realtime
  behavior using real authenticated sessions.
- Record identifier-only Realtime payloads and reconnect/focus/poll recovery.
- Record in-app/outbox exactly-once, supersession, cancellation, delivery-time
  revalidation, and configured provider delivery.
- Verify every retained environment's migration names and checksums.
- Apply both LOI migrations to the retained Liber project through the normal
  Prisma migration path after explicit production-database approval.
- Repeat and record root lint, typecheck, tests, production build, database
  validation, route/security/no-auth-bypass smoke, and readiness checks if the
  exact release commit differs from the verified implementation tree.
- Capture authenticated desktop/mobile responsive, zoom, keyboard, native
  dialog, focus-return, screen-reader, and error-recovery evidence.
- Obtain product/counsel approval for supported fields, provider/cost language,
  action labels, non-binding disclaimer, deadline meaning, retention, support
  access, and the two-user pilot.
- Confirm the scheduled email-outbox worker and operational monitoring before
  enablement.

## Deployment runbook

1. Keep `LIBER_LOI_V1_ENABLED=false` and the cohort empty in all retained
   environments.
2. Select and review one exact 40-character commit SHA.
3. Audit migration ledgers/checksums for every retained environment. A reviewed
   retained-lineage checksum is valid only through the exact-project verifier;
   never turn it into a global alternate or edit `_prisma_migrations`.
4. Run the normal non-database CI and resolve every lint, type, test, build,
   security, baseline, and readiness failure.
5. Configure the protected `disposable-loi-proof` environment with separate
   upgrade and fresh URLs/sentinels. Ensure `DATABASE_URL` and `DIRECT_URL`
   identify shared targets only for deny matching, never as proof targets.
6. Dispatch the protected release proof with the reviewed SHA and exact
   `DISPOSABLE_ONLY` confirmation. Retain both migration and behavior outputs.
7. Deploy `20260716030741_add_loi_negotiations` followed by
   `20260716120000_harden_loi_event_semantics` before any application version
   that references LOI tables.
8. Run production readiness and verify both exact checksums in the deployed
   ledger.
9. Deploy the reviewed application with the flag still off. Confirm messaging,
   maintenance, outbox, and ordinary marketplace paths remain healthy.
10. After every open gate is approved, set
    `LIBER_LOI_V1_COHORT_USER_IDS` to exactly the reviewed buyer and seller UUIDs
    and set `LIBER_LOI_V1_ENABLED=true` in one controlled change.
11. Verify both participants can access only their negotiation, while an
    outsider receives generic unavailable behavior. Monitor conflicts,
    rate-limit responses, freeze/expiry events, outbox cancellation/failure,
    Realtime joins, and support reports.

## Rollback and incident response

The first rollback action is to set `LIBER_LOI_V1_ENABLED=false`. The exact
cohort gate then fails closed for workspace reads/mutations and delivery-time
email eligibility while preserving committed history.

Do not drop LOI tables, delete revisions/events, rewrite migration history, or
erase terminal outcomes during an application rollback. The migrations are
additive and shared messaging/maintenance code references the tables. A schema
defect must be repaired with a reviewed forward migration.

If a current negotiation becomes unsafe or ineligible, use the existing
authoritative block/invite/property/access path so the normal transaction or
maintenance sweep persists `READ_ONLY`, deletes private drafts, records the
reason, and cancels pending delivery. Do not edit user-supplied JSON or metadata
to manufacture authorization.

If a checksum mismatch appears, stop deployment and preserve the database and
repository bytes for comparison. If Realtime fails, canonical polling and focus
refresh remain the fallback; do not loosen the private policy. If email fails,
leave content-free jobs retryable/cancellable under the leased worker rather
than sending terms through an ad hoc channel.

Committed immutable revisions and events remain retained until counsel/product
publish an approved LOI retention and support-access rule.

## Primary implementation map

- Terms, calculations, and request schemas: `packages/validators/src/loi.ts`
- State policy, feature gate, service, and HTTP boundary:
  `apps/web/server/loi/**`
- Routes: `apps/web/app/api/loi/**`
- Workspace page and UI: `apps/web/app/negotiations/**` and
  `apps/web/components/loi/**`
- Messaging link/status integration: `apps/web/server/messaging/**` and
  `apps/web/components/messaging/**`
- Email and maintenance: `apps/web/server/email.ts`,
  `apps/web/server/email-outbox.ts`, and `apps/web/server/maintenance.ts`
- Schema and migrations: `packages/db/prisma/schema.prisma`,
  `packages/db/prisma/migrations/20260716030741_add_loi_negotiations/**`, and
  `packages/db/prisma/migrations/20260716120000_harden_loi_event_semantics/**`
- Static/disposable proof: `prisma.loi-stage.config.ts`,
  `scripts/test-loi-migration.mjs`, `scripts/test-loi-database.mjs`,
  `scripts/test-loi-behavior.mjs`, and
  `apps/web/server/loi/service.database.test.ts`
- Protected proof workflow: `.github/workflows/release-proof.yml`
