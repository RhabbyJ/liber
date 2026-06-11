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
- notifications/email outbox,
- admin document review,
- admin-controlled trust badges,
- audit logs and rate limits.

Success signal: a seller can find matched buyers and send relevant private invites.

Immediate UX priority: make the marketplace value obvious before and after signup. Before signup, visitors may see a small limited set of privacy-safe buyer preview cards. After approved seller access, the seller workspace should feel like a real-estate map search for buyer demand: map first, numbered buyer-demand pins/clusters, a clear filter control, and buyer cards tied to the same filtered result set. The numbers represent buyers or buyer demand signals, not public property listings.

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
- structured seller/buyer Q&A around an invite,
- request-more-info flow,
- saved searches and alerts,
- property/buyer match explanations,
- stronger review eligibility rules,
- partner/lender evidence workflows if legally approved.

V2 may support offer-preparation coordination, but not automated acceptance or money custody without separate approval.

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

Keep the first launch geography narrow enough that marketplace quality can be manually managed.
