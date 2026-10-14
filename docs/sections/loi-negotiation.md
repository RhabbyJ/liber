# Section: LOI Negotiation

## Purpose and source of truth

Owns the cohort-gated, non-binding LOI term-alignment workspace linked to an
accepted invite.

`docs/engineering/LIBER_LOI_V1.md` is the sole LOI completion, audit, release,
deployment, and rollback artifact. Read it before changing LOI behavior. Do not
recreate dated LOI audits or a separate implementation blueprint; update that
one final document and the applicable repository-wide product/architecture
source of truth.

## Main files

- `packages/validators/src/loi.ts`
- `apps/web/server/loi/**`
- `apps/web/app/api/loi/**`
- `apps/web/app/negotiations/**`
- `apps/web/components/loi/**`
- `packages/db/prisma/migrations/20260716030741_add_loi_negotiations/**`
- `packages/db/prisma/migrations/20260716120000_harden_loi_event_semantics/**`
- `packages/db/prisma/migrations/20260717023000_grant_authenticated_app_private_usage/migration.sql`
- `packages/db/prisma/current-baseline/migrations/20260717023000_grant_authenticated_app_private_usage/migration.sql`
- `packages/db/prisma/migrations/20260717033000_harden_app_private_function_defaults/migration.sql`
- `packages/db/prisma/current-baseline/migrations/20260717033000_harden_app_private_function_defaults/migration.sql`
- `scripts/test-loi-migration.mjs`
- `scripts/test-loi-database.mjs`
- `scripts/test-loi-behavior.mjs`
- `scripts/realtime-branch-proof-subscriber.mjs`

## Do not break

- Sellers viewing the first submitted revision see Offer from followed by the
  buyer legal/entity name already included in those terms. Keep version/author/
  submission metadata and owner-private drafts unchanged; render names as text.

- More options saves and applies named reusable LOI templates in browser-local
  storage scoped by the server-verified current user ID. Templates exclude deal
  bindings, buyer/agent identity, price, deposit, funding, seller credit, and
  disclosures; an older template that stored a credit keeps the draft's own on
  apply. Applying respects counter locks, creates unsaved edits, recalculates the live
  snapshot, and requires normal save/review. Corrupt, unsupported, full, or
  unavailable storage must report failure without overwriting saved data.

- Title insurance payer is independent from escrow payer. New drafts explicitly
  seed Seller for title; the optional wire field preserves historical terms and
  calculations. Title fee changes move the provided total without changing escrow.
  Counters may negotiate the title payer, but the server retains the title company
  from the immutable base revision. Preserve the base payer on older client input
  that omits the new field.

- Recommended customary allocation displays Seller for city/county transfer
  taxes and government-required retrofit items in visible locked dropdowns.
  Turning it off enables overrides starting from those Seller defaults. Keep
  the customary wire contract (no contradictory custom payer object).
- Changing the escrow payer moves the provided escrow estimate total to the
  selected party instead of dropping it. Seller costs reduce seller proceeds;
  buyer costs increase cash required. Each-own costs are never automatically
  split. Blank escrow amounts use the supplied schedule; other unknown fees
  remain blank. Historical stored summaries are not
  recalculated.

- Fee estimates are expanded by default. Commission labels identify the payer;
  numeric buyer/seller cash equations derive from the displayed summary and
  update during local edits. Each Own title quotes need both shares for a combined total. Escrow uses
  scheduled amounts for unquoted shares. Null selects the escrow schedule;
  explicit zero is valid. Preserve legacy omitted title payer compatibility.

- Seller-only loan payoff lives in calculator component memory, keyed by
  negotiation, separate from shared LOI terms, template/API payloads, and
  storage. A blank or invalid payoff cannot imply zero. Final Net proceeds
  subtracts the payoff once from the displayed stored seller subtotal, retaining
  negative values. Full fee rows use the existing allocation function and frozen
  commission/warranty figures; explicit residuals preserve stored totals. No
  V3 fees are invented for V2 and no cash subtotal is invented for V1.

- Financed submission requires the buyer's active pre-approval badge or an uploaded
  pre-approval letter (pending or approved). Show rejected submissions beside the
  fixed actions, with a buyer-profile upload link, and preserve the saved draft.
  Successful submission focuses the current version and exposes Back to messages.
- The explicitly authorized financing test exception is scoped to one buyer UUID,
  one negotiation UUID, and an expiry using `LIBER_LOI_TEST_FINANCING_*` settings.
  It skips evidence only, grants no badge, and records expiry on the submit event.

- Buyer-agent commission and seller-agent commission estimates use explicit
  percent/dollar controls with matching numeric inputs. Unit changes clear the
  amount; do not reinterpret or automatically convert financial values. Store
  the selected unit in the existing commission string and preserve historical
  draft formats, optional blank estimates, and server validation/calculation.
- The draft calculator is live on every keystroke: the workspace computes one
  `previewLoiCalculation` per edit and shares it with the editor, snapshot, fee
  details, and action bar. Cross-field conflicts are shown as issues beside
  figures that follow the entered amounts; never blank the calculator for them.
  Money inputs accept `$` and commas. While editing, the fixed action bar shows
  the viewer's key total (buyer total cash needed; seller net proceeds or cash
  before payoff) on narrow screens, where the snapshot sits below the form.
- New calculation-version-3 summaries include user-entered closing-cost estimates,
  dollar/percent commissions, Expected cash to close for the buyer, and seller
  cash before payoffs. Expected cash to close updates immediately from local
  draft edits; its amount uses polite live announcements. Review/history use
  the same label with stored historical figures.
  Blank fees are unknown, not zero; Zorik's fee schedule is still pending. Keep the
  version-1 and version-2 summary decoders so historical stored figures never change.
  Warranty maximums are budget estimates allocated to the selected payer;
  Warranty offers Buyer, Seller, and Other; Other uses explicit shares. Historical
  Each Own warranty terms remain readable, but editable drafts must choose a
  supported payer. Itemized transfer-tax, retrofit, HOA, and
  additional personal-property expenses follow their payers. Through-escrow
  rent-back debits seller costs and credits buyer cash once; monthly rent-back
  is separate. Other fees must exclude separately calculated costs, with explicit
  confirmation when both are entered. Blank applicable fees remain incomplete.
- Only the authoritative seller can author or change the death-on-property answer.
  Enforce it again at submission, preserve it on buyer counters, and identify
  historical answers whose source was not recorded. Changes require a new exact
  revision for the other participant to review.
- The aligned-summary PDF is a non-binding download for authorized participants,
  using the stored current revision and summary; it is not a purchase agreement.

- An absent/zero asking price does not block an otherwise eligible new LOI. The starter price uses zero only as a missing marker and the Offer price input renders blank with guidance. Financial preview, review, and submission require a positive buyer proposal; private drafts can save without it; existing invite/property snapshots remain immutable. Rate-limited Start LOI recovery instructs the buyer to wait, including after acceptance.
- Immutable participant/property bindings, owner-private drafts, alternating
  immutable revisions, exact-version actions, and non-binding language.
- Server authorization, fixed lock order, request fingerprints, deadline and
  eligibility rechecks, RLS/no-raw-CRUD, and content-free Realtime/email.
- The four immutable migration checksums in the LOI/release chain and the
  protected disposable proof gates. The two cross-cutting private-ACL
  migrations are byte-identical in both roots. The authenticated policy-helper
  access migration has SHA-256
  `1b1f6afbc6a233eea9e10e5c24a5a7998a1cbdbbe4805dcc7c4b0b79a82bcc84`.
  It grants `authenticated` schema `USAGE` without `CREATE` or relation access
  and `EXECUTE` only on `can_join_conversation_topic(text)`,
  `can_join_loi_topic(text)`, `can_read_property_image(text, uuid)`, and
  `can_upload_session_object(text, text, uuid)`. `PUBLIC`, `anon`, and
  `service_role` remain closed and `app_private` remains outside the Data API.
  The follow-up default-ACL migration has SHA-256
  `d1495a84e4f547da535ace05211fe4956624696995da777b83f8cec34cf3615f`
  and closes global plus `app_private`-scoped non-owner PostgreSQL default
  function `EXECUTE` grants.
  Never edit the base migration or claim an unrun protected job passed.


Completed LOIs remain accessible to both authorized participants as read-only final terms. Chat offers View completed LOI after Terms aligned. Completion closes any open editor/review state and hides draft, template-apply, submit, counter, and decision controls; historical revisions remain readable. Private seller payoff estimates remain separate from shared terms.


Once both parties align on the exact current revision, a Download PDF section appears at the end of the completed LOI for both authorized participants. The private export includes all final shared terms and their stored calculations, excludes drafts and private seller payoff input, and is unavailable before alignment or while viewing history. The server rechecks participant access and aligned status for every download; no public PDF URL or stored export is created.


The prominent buyer cash card shows Estimated total cash needed including the earnest-money deposit, with separate deposit and Expected cash to close (remaining balance) rows. Buyers who already paid the deposit use the remaining balance. Deposit is included once and credited once. Existing stored V2/V3 amounts, negative credits and incomplete-estimate messaging are preserved; V1 receives no invented closing total.

LOI layout, October 6, 2026: The right-hand deal snapshot keeps purchase price, loan amount, earnest money and Expected cash to close with deposit credit. Seller view retains a compact private loan payoff and Net proceeds calculator. Commissions, closing-cost estimates, warranty/itemized/rent-back rows, full equations and seller fee deductions move to a full-width Fees and calculation details section below the draft/review, before the completed PDF. A sidebar link jumps to the details. Both seller totals share one negotiation-scoped payoff value in workspace component memory; it stays out of shared terms, templates, storage and API payloads. Local edits update both sections; historical saved calculations, incomplete estimates, completed read-only behavior and final PDF placement are preserved. No financial formulas, server, schema, dependency or environment changes.

Buyer cash budget, October 6, 2026: The prominent LOI cash card shows Estimated total cash needed, including the earnest-money deposit. Separate rows show the deposit and Expected cash to close (remaining balance). The total equals the stored/local remaining closing balance plus the deposit exactly once. Buyers who already paid the deposit are told to use the remaining balance. This is a display change; stored calculation versions, negative modeled credits, estimate incompleteness and V1 unavailable totals remain unchanged. Fees remain below the draft, with the key cash figures on the right. No bank-balance data, new fields, financial formulas, server, schema, dependencies or environment changes.

Escrow calculator estimates, October 6, 2026: The bottom financial details explicitly show buyer and seller escrow fees using the existing payer allocation. Dollar estimate inputs are grouped under Escrow fee estimates; official percentages remain pending and no rates are prefilled. Buyer fees increase cash needed and seller fees reduce proceeds once through the existing closing-cost totals. Blank quotes display Not estimated; explicit zero remains valid. Historical V1 reports escrow unavailable without recalculating stored amounts. The compact cash card includes the deposit and entered closing fees; fees stay below the draft. No financial formula, shared terms, server, schema, dependency, migration or environment changes.

Party-specific LOI calculators, October 6, 2026: The authenticated negotiation viewer role selects the calculator in the sidebar, bottom financial details and decision summary. Buyer sees deposit, loan amount, total cash needed, remaining cash to close, their allocated fee shares and buyer cash equation. Seller sees purchase price, private loan payoff and final net proceeds, with only their fee deductions in bottom details; buyer deposit/down-payment/cash-to-close rows are absent from the seller calculator. Seller-financed principal remains relevant to seller proceeds. Buyer ledger displays each fee share (including escrow), unknown quotes as Not estimated, other-party charges as zero, and preserves frozen historical residuals. The redundant two-party escrow component is removed. Shared offer terms and the final PDF remain readable by both parties; this is a presentation change, not a new data-access boundary. All existing calculations, historical versions, private payoff state, fee inputs, official-rate-pending policy and completed immutability are retained. No server, schema, migration, environment or dependency changes.


Private LOI draft price, October 7, 2026: Offer price is optional while saving an owner-private draft, including a counter draft. An unset offer uses zero as an internal missing marker, renders blank, and has no financial preview. Price-dependent comparisons wait until an offer price is present; other existing draft validations remain enforced. Saved drafts reload through the draft-only decoder. Review and server submission require a positive offer price and retain all funding, credit, commission, eligibility and immutable-revision checks. No migration, shared data, dependency or environment changes.


Escrow fee schedule, October 7, 2026: New LOI calculations use version 4. Each side defaults to $300 plus $1.75 per $1,000 of the positive offer price, calculated proportionally and rounded half-up to cents independently for each side. At $1,000,000 the fee is $2,050 per side. Each Own allocates one fee to each party; Buyer or Seller allocates both fees to that party. Blank escrow estimates select the schedule; entered quotes override the allocated amount, including explicit zero for no charge. Other blank fees remain unknown. Price changes reprice automatic fees; a payer switch preserves quoted amounts and uses the scheduled amount for an unquoted share. Title quotes still need both shares to establish a combined total. Buyer escrow increases buyer closing cash; seller escrow reduces seller proceeds once. A blank offer price may still be saved privately, but cannot calculate escrow or be submitted. V4 stores the per-side scheduled fee and the actual allocated buyer/seller escrow amounts in the immutable summary; review, history and final PDF use those frozen amounts. V1/V2/V3 decoders and historical summaries are unchanged. No database migration, dependency or environment change. Rollback after a V4 revision exists must retain V4 decoding. Earlier fee-schedule-pending notes describe their dated releases and are superseded by this contract.


LA City transfer-tax estimates, October 7, 2026: Calculation version 5 adds an optional, explicit City of Los Angeles July 2026–June 2027 schedule. The default remains entered combined transfer-tax quotes; neither an LA mailing address nor the existing property snapshot establishes city jurisdiction. Selecting the schedule confirms the estimate is for a taxable full-price transfer inside city limits in this rate period. County base tax is $0.55 per $500 and city base tax is $2.25 per $500, each rounded up to the next increment, for consideration above $100. ULA is 4% of the entire offer price strictly above $5,400,000 and below $10,900,000; 5.5% of the entire price at or above $10,900,000. Exactly $5,400,000 has no ULA. The base-tax payer remains negotiable; ULA is always seller-paid and is included once in seller itemized costs and proceeds. LA rate mode ignores retained manual transfer-tax quotes; returning to quoted mode restores those inputs. Other cities, exemptions, special taxable values and other closing periods use a quote including any ULA. Exempt/not-applicable base taxes require quoted mode. Review shows the chosen schedule and county/city/ULA amounts; the fee ledger separates base transfer tax and seller ULA. V5 freezes the schedule, tax components and allocated totals; V1/V2/V3/V4 decoding and immutable summaries remain unchanged. Counteroffers may negotiate the schedule and price; omitted schedule from older clients retains the current revision's choice. Reusable templates cannot carry a city-jurisdiction assertion into another property. The terms JSON keeps schemaVersion 1 with an optional validated field; no database migration, environment or dependency change. After V5 revisions exist, rollback must retain V5 decoding.

Rate sources verified October 7, 2026: [Los Angeles Office of Finance — Real Property Transfer Tax and Measure ULA FAQ](https://finance.lacity.gov/faq/measure-ula), [Los Angeles County Recorder — Documentary Transfer Tax](https://www.lavote.gov/home/recorder/property-document-recording/documentary-transfer-taxes). These rates are estimates for the selected taxable-price assumption; Liber does not determine jurisdiction, exemptions or actual closing tax liability.

- The buyer's LOI view carries `buyerFinancingEvidence` (`BADGE`, `DOCUMENT`, or `NONE`) from the same badge/letter check that gates financed submission; seller views receive `null` and never learn the buyer's private letter status. The financed review shows "Pre-approval on file" instead of the upload requirement when evidence already exists.
