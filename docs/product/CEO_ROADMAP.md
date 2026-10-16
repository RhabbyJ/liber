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

The September 25 browser journey uses separate, explicitly labeled buyer and
seller fixtures. Under the existing private-preview gate, `/admin/documents`
may grant/revoke a version-bound property test approval for the exact fixture
seller to invite only the fixture buyer. The UI states that ownership was not
verified; no evidence or financial trust signal is fabricated. This temporary
testing exception must be cleaned up before public launch (see the V1 definition).

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
- mobile-visible unread notification bell and buyer popup for newly received invites,
- admin document review,
- admin-controlled trust badges,
- audit logs and rate limits.

Success signal: a seller can find matched buyers, send a relevant private invite, and receive a property-fit response without creating a transaction workflow.

Guided Messaging V1 is approved as a controlled continuation of the manual invite, not as general chat. One invite creates one two-party conversation. PostgreSQL remains authoritative; private Realtime is only an identifier-only update hint. The production flag stays off outside the approved cohort until retention, fair-housing template review, moderation operations, credential cleanup, and messaging security evidence are complete.

Immediate UX priority: make the marketplace value obvious before and after signup. The customer-facing destination is named Map, and buyer pins stay at their selected target-area centers, with counts for shared centers. The public homepage is the map itself — a Zillow-style buyer-demand map with anonymized budget pins (buyers, not listings) at approximate locations, a small set of preview cards, and a signup wall; there is no separate marketing landing page. After approved seller access, the seller workspace is the full version of that experience: map first, budget-labeled buyer-demand pins, a clear filter control, and buyer cards tied to the same filtered result set.

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

The September 2026 sheet review implements the invite-card and messenger refresh:
private property cards with clear question/tour/LOI responses, dated chat bubbles,
a compact composer, loaded-conversation filters, and expandable property details.
The LOI form follows the sheet's automatic 48-hour response window and structured
funding, representation, costs, and personal-property questions. Provider selection
for ID verification and lender verification/pre-approval still requires partner
details; these integrations are not shipped or implied by
the interface. The row-by-row evidence is maintained in
`docs/engineering/LIBER_LOI_V1.md`.

The September 25 meeting adds condition/feature selection on seller properties,
inside-Liber tour scheduling with reminders and follow-up, seller-owned death
disclosure, and an aligned-revision PDF. The LOI now calculates commissions and
manual closing-cost estimates. Zorik's escrow/title fee schedule is still pending;
automatic provider quotes remain future work. The export remains a non-binding
record for contract preparation, without signatures or transaction execution.
Escrow estimates follow the selected payer in the live cash calculator.
Recommended customary allocation sets transfer-tax and retrofit payers to Seller,
with explicit overrides available when the recommendation is turned off.
Escrow and title insurance use separate payer selectors, with title initially
seller-paid. Each fee estimate follows its own payer in the cash calculator.
Fee inputs are expanded by default, commission labels identify the payer, and
numeric buyer/seller cash equations show the result of each draft change.
Partial Each Own escrow/title quotes remain unknown when choosing one payer.
Sellers have a private loan-payoff box and a full fee breakdown ending in live
Net proceeds. The payoff is not shared or persisted and resets on refresh;
shared LOI summaries and historical calculations retain their existing scope.
Warranty budget maximums, entered tax/retrofit/HOA/additional personal-property
costs, and through-escrow rent-back now feed the party cash estimates. Each-own
allocations use explicit shares; monthly rent-back stays separate from closing
cash. Other costs require confirmation that separately calculated expenses are
excluded. New summaries use calculation version 3 and preserve historical values.
Home warranty offers Buyer, Seller, and Other; Each pays own is removed from
editable warranty choices while historical terms remain readable.
The buyer's live calculator total is labelled Expected cash to close and
updates as draft prices, funding, credits, and allocated expenses change.
Sellers see the first received LOI as Offer from the buyer's submitted
legal/entity name, with revision details retained below.
More options supports named, reusable LOI templates saved per account in the
current browser. Applying one preserves the new transaction's identity, price,
deposit, funding, and disclosures, and requires normal save and review. Account
sync across browsers/devices remains future work.

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
preparation," not accepted, executed, or signed. On 2026-10-16 the product owner
extended the production cohort from one pair to every account existing that day.
Opening it to new signups still requires counsel-approved labels, disclaimer,
supported fields, retention, and support-access policy plus database,
concurrency, Realtime, responsive, and accessibility evidence.

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

The LA beta boundary is Los Angeles County. The reviewed v2 geography was
activated on July 12: 88 cities, 304 approximate Census ZCTA areas and three
reviewed neighborhoods. Every County community (Granada Hills, Sherman Oaks,
Altadena and the other 266) became selectable with the October 13 community
release. Product availability remains controlled preview until
the outstanding security, operational and release gates pass. Geography
activation alone is not a public-launch approval; keep availability within the
reviewed service areas so marketplace quality can be manually managed.


Completed LOIs remain accessible to both authorized participants as read-only final terms. Chat offers View completed LOI after Terms aligned. Completion closes any open editor/review state and hides draft, template-apply, submit, counter, and decision controls; historical revisions remain readable. Private seller payoff estimates remain separate from shared terms.


Once both parties align on the exact current revision, a Download PDF section appears at the end of the completed LOI for both authorized participants. The private export includes all final shared terms and their stored calculations, excludes drafts and private seller payoff input, and is unavailable before alignment or while viewing history. The server rechecks participant access and aligned status for every download; no public PDF URL or stored export is created.


Buyer setup uses a two-handle purchase-budget slider with the Zillow list-price scale: $0, $50k, then $25k steps to $500k, $50k to $1M, $100k to $2M, $250k to $5M and $1M to $10M. Required editable Min/Max boxes retain exact custom, decimal, zero and high saved budgets; slider indices are never submitted. New profiles remain blank until chosen. Moved handles cannot cross; reversed typed values show an inline hint. Down-payment and size controls retain their existing increments.

The prominent buyer cash card shows Estimated total cash needed including the earnest-money deposit, with separate deposit and Expected cash to close (remaining balance) rows. Buyers who already paid the deposit use the remaining balance. Deposit is included once and credited once. Existing stored V2/V3 amounts, negative credits and incomplete-estimate messaging are preserved; V1 receives no invented closing total.


## Limited name identity

Buyer, seller, and combined-role signup collect a full name (first and last required; up to 160 characters). Public identity is first name + last initial + a stable 12-character uppercase hexadecimal account code, for example Julie P. #7C4E2A91B6D0. The code is a truncated SHA-256 digest of the immutable random Auth UUID with a Liber namespace; it is not authentication proof or a database uniqueness constraint. Codes do not reveal the UUID and have no current-account collisions in the release read-only check. Both new and existing accounts use this limited identity in profiles, public previews, approved seller search, invites, and both sides of messaging. Legacy invalid/nameless accounts show Member plus code. Full surnames and contact information stay private except existing authorized LOI party disclosures. Raw account names and UUIDs remain server-side; only the limited label enters public DTOs. Signup shows an initials preview; the final code is assigned from the created account identity. DiceBear Initials (CC0) renders locally with @dicebear/core 10.7.0 and @dicebear/styles 10.6.0; no name is sent to an external avatar service. Existing avatarVariant tokens remain a backward-compatible color preference, with eight muted colors in the picker. Public labels/codes cannot be edited or shuffled by clients. No schema, role, authorization, RLS, document, or frozen LOI calculation changes.

The October 6 testing workflow adds Admin → Badges self-service test pre-approval for buyer admins in the enabled CEO demo. It expires after 24 hours and is clearly labeled unverified across buyer, seller and limited public preview views. Real financing verification remains evidence-backed.

LOI layout, October 6, 2026: The right-hand deal snapshot keeps purchase price, loan amount, earnest money and Expected cash to close with deposit credit. Seller view retains a compact private loan payoff and Net proceeds calculator. Commissions, closing-cost estimates, warranty/itemized/rent-back rows, full equations and seller fee deductions move to a full-width Fees and calculation details section below the draft/review, before the completed PDF. A sidebar link jumps to the details. Both seller totals share one negotiation-scoped payoff value in workspace component memory; it stays out of shared terms, templates, storage and API payloads. Local edits update both sections; historical saved calculations, incomplete estimates, completed read-only behavior and final PDF placement are preserved. No financial formulas, server, schema, dependency or environment changes.

Buyer cash budget, October 6, 2026: The prominent LOI cash card shows Estimated total cash needed, including the earnest-money deposit. Separate rows show the deposit and Expected cash to close (remaining balance). The total equals the stored/local remaining closing balance plus the deposit exactly once. Buyers who already paid the deposit are told to use the remaining balance. This is a display change; stored calculation versions, negative modeled credits, estimate incompleteness and V1 unavailable totals remain unchanged. Fees remain below the draft, with the key cash figures on the right. No bank-balance data, new fields, financial formulas, server, schema, dependencies or environment changes.

Escrow calculator estimates, October 6, 2026: The bottom financial details explicitly show buyer and seller escrow fees using the existing payer allocation. Dollar estimate inputs are grouped under Escrow fee estimates; official percentages remain pending and no rates are prefilled. Buyer fees increase cash needed and seller fees reduce proceeds once through the existing closing-cost totals. Blank quotes display Not estimated; explicit zero remains valid. Historical V1 reports escrow unavailable without recalculating stored amounts. The compact cash card includes the deposit and entered closing fees; fees stay below the draft. No financial formula, shared terms, server, schema, dependency, migration or environment changes.

Party-specific LOI calculators, October 6, 2026: The authenticated negotiation viewer role selects the calculator in the sidebar, bottom financial details and decision summary. Buyer sees deposit, loan amount, total cash needed, remaining cash to close, their allocated fee shares and buyer cash equation. Seller sees purchase price, private loan payoff and final net proceeds, with only their fee deductions in bottom details; buyer deposit/down-payment/cash-to-close rows are absent from the seller calculator. Seller-financed principal remains relevant to seller proceeds. Buyer ledger displays each fee share (including escrow), unknown quotes as Not estimated, other-party charges as zero, and preserves frozen historical residuals. The redundant two-party escrow component is removed. Shared offer terms and the final PDF remain readable by both parties; this is a presentation change, not a new data-access boundary. All existing calculations, historical versions, private payoff state, fee inputs, official-rate-pending policy and completed immutability are retained. No server, schema, migration, environment or dependency changes.


Escrow fee schedule, October 7, 2026: New LOI calculations use version 4. Each side defaults to $300 plus $1.75 per $1,000 of the positive offer price, calculated proportionally and rounded half-up to cents independently for each side. At $1,000,000 the fee is $2,050 per side. Each Own allocates one fee to each party; Buyer or Seller allocates both fees to that party. Blank escrow estimates select the schedule; entered quotes override the allocated amount, including explicit zero for no charge. Other blank fees remain unknown. Price changes reprice automatic fees; a payer switch preserves quoted amounts and uses the scheduled amount for an unquoted share. Title quotes still need both shares to establish a combined total. Buyer escrow increases buyer closing cash; seller escrow reduces seller proceeds once. A blank offer price may still be saved privately, but cannot calculate escrow or be submitted. V4 stores the per-side scheduled fee and the actual allocated buyer/seller escrow amounts in the immutable summary; review, history and final PDF use those frozen amounts. V1/V2/V3 decoders and historical summaries are unchanged. No database migration, dependency or environment change. Rollback after a V4 revision exists must retain V4 decoding. Earlier fee-schedule-pending notes describe their dated releases and are superseded by this contract.


LA City transfer-tax estimates, October 7, 2026: Calculation version 5 adds an optional, explicit City of Los Angeles July 2026–June 2027 schedule. The default remains entered combined transfer-tax quotes; neither an LA mailing address nor the existing property snapshot establishes city jurisdiction. Selecting the schedule confirms the estimate is for a taxable full-price transfer inside city limits in this rate period. County base tax is $0.55 per $500 and city base tax is $2.25 per $500, each rounded up to the next increment, for consideration above $100. ULA is 4% of the entire offer price strictly above $5,400,000 and below $10,900,000; 5.5% of the entire price at or above $10,900,000. Exactly $5,400,000 has no ULA. The base-tax payer remains negotiable; ULA is always seller-paid and is included once in seller itemized costs and proceeds. LA rate mode ignores retained manual transfer-tax quotes; returning to quoted mode restores those inputs. Other cities, exemptions, special taxable values and other closing periods use a quote including any ULA. Exempt/not-applicable base taxes require quoted mode. Review shows the chosen schedule and county/city/ULA amounts; the fee ledger separates base transfer tax and seller ULA. V5 freezes the schedule, tax components and allocated totals; V1/V2/V3/V4 decoding and immutable summaries remain unchanged. Counteroffers may negotiate the schedule and price; omitted schedule from older clients retains the current revision's choice. Reusable templates cannot carry a city-jurisdiction assertion into another property. The terms JSON keeps schemaVersion 1 with an optional validated field; no database migration, environment or dependency change. After V5 revisions exist, rollback must retain V5 decoding.

Rate sources verified October 7, 2026: [Los Angeles Office of Finance — Real Property Transfer Tax and Measure ULA FAQ](https://finance.lacity.gov/faq/measure-ula), [Los Angeles County Recorder — Documentary Transfer Tax](https://www.lavote.gov/home/recorder/property-document-recording/documentary-transfer-taxes). These rates are estimates for the selected taxable-price assumption; Liber does not determine jurisdiction, exemptions or actual closing tax liability.
