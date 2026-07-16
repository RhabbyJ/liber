# CEO Roadmap

This document captures the CEO/product vision and sequencing. It does not override `docs/product/V1_DEFINITION.md`; v1 scope is controlled there.

## North star

Liber is a buyer-demand directory for real estate.

Instead of forcing sellers to publish a listing first and wait for inbound interest, Liber lets sellers discover buyers who already match the property they may want to sell.

## Core CEO vision

Buyers create searchable profiles that show:

- what they want to buy,
- where they want to buy,
- budget/down-payment context,
- property-type criteria,
- trust badges,
- reviews/history where available.

Sellers search by geography and fit, then invite matched buyers to review a private property.

The CEO demo flow:

```txt
Buyer profile exists
-> Public visitor can preview a small set of privacy-safe buyer demand cards before signup
-> Approved seller opens a map-first buyer-demand page
-> Seller sees numbered buyer-demand pins/clusters by geography
-> Seller filters for property fit and serious/trusted buyers
-> Seller opens buyer profile
-> Seller sees why buyer fits the property
-> Seller creates/selects private listing context
-> Seller sends a short manual invite
-> Buyer and seller continue in one invite-scoped guided conversation
```

## V1 roadmap: prove the marketplace loop

Goal: prove sellers value searchable buyer demand.

V1 must be narrow and trustworthy:

- active buyer profiles,
- limited pre-signup buyer-demand preview cards,
- buyer criteria,
- approved seller access,
- map-first seller search with buyer-demand pins and synchronized buyer cards,
- buyer profile seller-view,
- seller private properties,
- manual invites,
- invite-scoped guided messaging with plain-text fallback, blocking, and reporting,
- notifications/email outbox,
- admin document review,
- admin-controlled trust badges,
- audit logs and rate limits.

Success signal: a seller can find matched buyers, send a relevant private invite, and receive a property-fit response without creating a transaction workflow.

Guided Messaging V1 is approved as a controlled continuation of the manual invite, not as general chat. One invite creates one two-party conversation. PostgreSQL remains authoritative; private Realtime is only an identifier-only update hint. The production flag stays off outside the approved cohort until retention, fair-housing template review, moderation operations, credential cleanup, and messaging security evidence are complete.

Immediate UX priority: make the marketplace value obvious before and after signup. The public homepage is the map itself — a Zillow-style buyer-demand map with anonymized budget pins (buyers, not listings) at approximate locations, a small set of preview cards, and a signup wall; there is no separate marketing landing page. After approved seller access, the seller workspace is the full version of that experience: map first, budget-labeled buyer-demand pins, a clear filter control, and buyer cards tied to the same filtered result set.

The purple-board verification workflow ideas for owner/buyer proof, lender connections, IDs, and multi-day review are not part of this immediate UI priority.

## V1.1 roadmap: make it feel obvious and premium

After the secure core loop works:

- refine homepage and onboarding,
- improve seller search UX,
- improve buyer profile setup checklist,
- improve verification/trust-center UX,
- improve empty states and status language,
- tighten mobile flows,
- add better product telemetry for funnel drop-off.

Do not add major new transaction capabilities in this phase.

## V2 roadmap: transaction coordination, not escrow

Only after v1 has real marketplace usage:

- richer invite status workflow,
- richer structured seller/buyer Q&A beyond the constrained V1 template set,
- request-more-info flow,
- saved searches and alerts,
- property/buyer match explanations,
- stronger review eligibility rules,
- partner/lender evidence workflows if legally approved.

V2 may support offer-preparation coordination, but not automated acceptance or money custody without separate approval.

The first controlled V2 initiative is now the cohort-gated LOI workspace. It
uses owner-private drafts and immutable alternating revisions linked to one
accepted invite. Its terminal success label is "Terms aligned for contract
preparation," not accepted, executed, or signed. Expansion beyond an internal
two-user cohort requires counsel-approved labels, disclaimer, supported fields,
retention, and support-access policy plus database, concurrency, Realtime,
responsive, and accessibility evidence.

## V3 roadmap: regulated workflows only through a legal path

Escrow, earnest-money custody, payment rails, formal offer execution, lender integrations, and closing workflows are regulated and operationally heavy.

These should only ship through:

- licensed partners,
- explicit legal/compliance approval,
- written operational procedures,
- fraud/AML/support planning,
- and an updated product definition.

## Current strategic wedge

Launch as the trusted buyer-demand layer:

> Sellers discover serious buyers before listing publicly.

The LA beta boundary is Los Angeles County, but it may activate only after the reviewed county dataset, deploy-independent geometry, migration proof, and security/release gates pass. Until then, keep availability limited to the currently reviewed service areas so marketplace quality can be manually managed.
