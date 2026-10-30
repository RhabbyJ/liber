# Liber LOI V1 — Final Implementation, Audit, and Release Record

**Finalized:** 2026-07-17

**Last reviewed:** 2026-09-27 (meeting follow-ups: closing-cost estimates, seller disclosure, and aligned-summary export; original cohort launch gates remain recorded below)

**Implementation disposition:** complete in source; enabled in production on 2026-10-16 for an explicit reviewed cohort of every account existing that day (product-owner decision). Opening it to new signups still requires the release gates in this document

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
The four reviewed migrations in the LOI/release chain are applied in production,
and an isolated disposable Supabase branch proof recorded authenticated Realtime
and raw Data API evidence for the exact buyer/seller boundary. It is **not yet
authorized for a real-user cohort** because protected exact-SHA fresh/upgrade
database proof,
authenticated UI/browser evidence, scheduled-worker/provider evidence, and
counsel approval remain open. The retained production migration ledger has been
reviewed and its one comment-only historical checksum variant remains preserved
as exact, project-scoped evidence.

Merely wiring a protected workflow is not evidence that the workflow ran. Keep
`LIBER_LOI_V1_ENABLED=false` until every open gate in this document has an
artifact tied to the exact reviewed commit.

## Scope

Private draft offer-price release verification, October 7, 2026: User clarified that offer price is required before submission. Owner-private initial and counter drafts may now save and reload an unset price; zero remains an internal missing marker and renders blank. No financial preview is calculated until positive. Other draft validations remain; comparisons to purchase price defer only while it is unset. Review and server submission retain positive-price validation with explicit field guidance. Submitted revisions, funding/credit calculations, eligibility, optimistic draft versions, RLS and notifications are unchanged. Source checks passed 77 validator tests, 92 web tests, typecheck and lint. Exact isolated live-baseline release passed 162 focused tests, typecheck, lint, production build and no-auth-bypass smoke. Browser verified blank-price Save draft for later and reload; review blocked with a price message, and entering $750,000 reached submission review with $22,500 deposit. Mocked service verified persistence and blocked submission without revision or notification writes for initial/counter drafts. Deployment dpl_3HfzjeGak43TQqRPNNCsTa4KFyHc is READY; both aliases verified, protected login 200, anonymous LOI API 401 and live route/security smoke passed. Immediate error/fatal log scan returned no groups; drains/ongoing monitoring were not inspected. No production offer or invitation changed for verification and no disposable SQL harness ran. Existing dependency audit warnings remain in the unchanged live lockfile. Product/architecture/section docs updated. No migrations or environment changes. Snapshot .artifacts/loi-draft-price-release-1791393867116/site; verification .artifacts/loi-draft-price-release-1791393867116/verification.json; rollback dpl_6dUbSHN6SMZiibcYYj5EVTAc8cNU. Site https://liber-one.vercel.app/. Proof .artifacts/invite-feedback-fixture/draft-price-required-before-submit.png.

Invite/LOI recovery release verification, October 7, 2026: The affected accepted invite was inspected read-only; its immutable property snapshot had price 0 and no negotiation. Eligible accepted invites now start LOI with absent/zero asking price. Offer price starts blank, the deposit waits for a proposed price, and draft save/submission retain positive-price validation. Malformed, negative and out-of-range asking prices still fail closed. Rate-limited Start LOI tells the buyer to wait. Previously verified inline seller-invite recovery also ships, preserving property/terms selections, duplicate protection and authorized recovery links; unknown failures expose only a support digest. Source focused tests passed 91 cases. The exact isolated live-baseline release passed 96 focused tests, typecheck, lint, production build, synthetic browser price/deposit checks, no-auth-bypass smoke and live route/security smoke. Deployment dpl_6dUbSHN6SMZiibcYYj5EVTAc8cNU is READY; both existing aliases verified. Protected login returns 200, messages 307 and anonymous LOI API 401. Immediate deployment error/fatal log scan returned no groups; drains were not inspected. No production invite/offer was sent or changed by verification; authenticated CEO retry and disposable SQL integration were not exercised. Existing dependency audit warnings remain in the unchanged live lockfile. No migration or environment changes; product and section docs updated. Snapshot .artifacts/loi-recovery-release-1791392845250/site; verification .artifacts/loi-recovery-release-1791392845250/verification.json; rollback dpl_GmMDaaXXoTvJetPMBnRhDHyhW9Tu. Site https://liber-one.vercel.app/. Proof .artifacts/invite-feedback-fixture/loi-missing-price-recovery.png.

Party calculator release verification, October 6, 2026: Source focused tests passed 42 cases. The isolated live-baseline release passed 279 LOI/PDF/server/route tests with 9 credential-gated SQL cases skipped, repository typecheck, web lint and the Next 16.2.6 production build. Both-role synthetic previews at 390px/1440px have no horizontal overflow. Buyer escrow changes $1,000 to $1,500 increase total cash $992,000 to $992,500; seller escrow changes reduce net with the retained private $600,000 payoff from $336,800 to $336,300. Seller sidebar has purchase price, loan payoff and net; no buyer down-payment/cash card. Bottom sections show the respective fee allocation only; seller decision summary uses seller fees/equation. Shared revision terms remain complete. Deployment dpl_GmMDaaXXoTvJetPMBnRhDHyhW9Tu is READY; both aliases assigned, protected login and public route smoke checks passed. Live authenticated historical V1 remains completed/read-only with final PDF, no invented seller cash and no buyer calculator card. No shared live terms changed, migrations or environment requirements. Snapshot .artifacts/party-calculator-release-1791351225249/site; rollback dpl_pMvW7LtCUptZBFTL1GfDRNLkP6KR. Site https://liber-one.vercel.app/. Proof .artifacts/mobile-preview/party-calculator-seller-laptop.png and party-calculator-buyer-phone.png.

Party-specific LOI calculators, October 6, 2026: The authenticated negotiation viewer role selects the calculator in the sidebar, bottom financial details and decision summary. Buyer sees deposit, loan amount, total cash needed, remaining cash to close, their allocated fee shares and buyer cash equation. Seller sees purchase price, private loan payoff and final net proceeds, with only their fee deductions in bottom details; buyer deposit/down-payment/cash-to-close rows are absent from the seller calculator. Seller-financed principal remains relevant to seller proceeds. Buyer ledger displays each fee share (including escrow), unknown quotes as Not estimated, other-party charges as zero, and preserves frozen historical residuals. The redundant two-party escrow component is removed. Shared offer terms and the final PDF remain readable by both parties; this is a presentation change, not a new data-access boundary. All existing calculations, historical versions, private payoff state, fee inputs, official-rate-pending policy and completed immutability are retained. No server, schema, migration, environment or dependency changes.

Escrow estimate release verification, October 6, 2026: Source focused tests passed 32 cases. The isolated live-baseline release passed 281 LOI/PDF/server/route tests with 9 credential-gated SQL cases skipped, repository typecheck, web lint and the Next 16.2.6 production build. Synthetic 390px/1440px previews have no horizontal overflow. Raising buyer escrow $1,000 to $1,500 increased total cash $992,000 to $992,500; switching Each Own to Seller moved the full $2,500 quote and buyer cash to $991,000. Blank and zero stayed distinct. Raising seller escrow $1,000 to $1,500 lowered net proceeds with a private $600,000 payoff from $336,800 to $336,300. No shared live terms were changed. Deployment dpl_pMvW7LtCUptZBFTL1GfDRNLkP6KR is READY; both existing aliases assigned, public route smoke checks and protected unique login passed. Authenticated completed historical V1 stays read-only with escrow calculations unavailable and PDF at the end. No migration or environment requirements. Snapshot .artifacts/escrow-fees-release-1791350870907/site; rollback dpl_Eia2koFEV2Tcc39EuvqgNLDm23Lk. Public site https://liber-one.vercel.app/. Proof .artifacts/mobile-preview/escrow-fees-phone.png and escrow-fees-laptop.png.

Escrow calculator estimates, October 6, 2026: The bottom financial details explicitly show buyer and seller escrow fees using the existing payer allocation. Dollar estimate inputs are grouped under Escrow fee estimates; official percentages remain pending and no rates are prefilled. Buyer fees increase cash needed and seller fees reduce proceeds once through the existing closing-cost totals. Blank quotes display Not estimated; explicit zero remains valid. Historical V1 reports escrow unavailable without recalculating stored amounts. The compact cash card includes the deposit and entered closing fees; fees stay below the draft. No financial formula, shared terms, server, schema, dependency, migration or environment changes.

Buyer cash budget, October 6, 2026: The prominent LOI cash card shows Estimated total cash needed, including the earnest-money deposit. Separate rows show the deposit and Expected cash to close (remaining balance). The total equals the stored/local remaining closing balance plus the deposit exactly once. Buyers who already paid the deposit are told to use the remaining balance. This is a display change; stored calculation versions, negative modeled credits, estimate incompleteness and V1 unavailable totals remain unchanged. Fees remain below the draft, with the key cash figures on the right. No bank-balance data, new fields, financial formulas, server, schema, dependencies or environment changes.

The isolated deposit-inclusive display release passed 276 relevant LOI web tests (9 credential-gated SQL cases skipped), repository typecheck, lint and production build. Synthetic phone/laptop checks verified no overflow and live totals: ,000 = ,000 deposit + ,000 remaining; changing purchase price to .2M gives ,192,000 = ,000 deposit + ,156,000 remaining. Historical stored negative credits remain visible and are not recalculated. Deployment dpl_Eia2koFEV2Tcc39EuvqgNLDm23Lk is READY with both stable aliases assigned. Public home/login return 200, messages 307, notifications 401, and protected login 200. Authenticated existing completed LOI uses new assets and preserves read-only terms, lower fee details and final PDF. Its V1 cash totals remain unavailable; the richer display is verified in a synthetic V3 fixture. No live terms changed. No migration/environment changes. Snapshot: .artifacts/deposit-total-release-1791350392421/site. Rollback: dpl_9NRLoi3qR1ajA2H7wcmJDt3fgQV2. Public site: https://liber-one.vercel.app/. Phone proof: .artifacts/mobile-preview/deposit-total-phone.png.

LOI layout, October 6, 2026: The right-hand deal snapshot keeps purchase price, loan amount, earnest money and Expected cash to close with deposit credit. Seller view retains a compact private loan payoff and Net proceeds calculator. Commissions, closing-cost estimates, warranty/itemized/rent-back rows, full equations and seller fee deductions move to a full-width Fees and calculation details section below the draft/review, before the completed PDF. A sidebar link jumps to the details. Both seller totals share one negotiation-scoped payoff value in workspace component memory; it stays out of shared terms, templates, storage and API payloads. Local edits update both sections; historical saved calculations, incomplete estimates, completed read-only behavior and final PDF placement are preserved. No financial formulas, server, schema, dependency or environment changes.

The isolated LOI layout release passed 276 relevant web LOI tests (9 credential-gated SQL cases skipped), repository typecheck, lint and production build. Synthetic phone/laptop checks verified no overflow, a bottom fee section and working jump link, buyer cash updates, private payoff retention through edits, consistent net totals and negative proceeds. Deployment dpl_9NRLoi3qR1ajA2H7wcmJDt3fgQV2 is READY with both existing aliases assigned. Public home/login return 200, anonymous messages 307, notifications/PDF 401, and protected login 200. The authenticated existing synthetic completed LOI remains read-only with PDF after the bottom details; its historical V1 correctly reports no closing/proceeds calculation. No live terms were changed. Snapshot: .artifacts/loi-layout-release-1791349936122/site. Rollback: dpl_7v7zJSmCgorYS16G64DHZANc7sCu. No migration/environment requirements. Public site: https://liber-one.vercel.app/. Screenshots: .artifacts/mobile-preview/loi-layout-laptop.png and loi-layout-bottom-phone.png.

Prominent cash-to-close and deposit breakdown, October 6, 2026: Expected cash to close uses a prominent larger card showing the saved remaining closing balance, total cash including the earnest-money deposit, and the deposit credit in the same card. Deposit is included once and credited once. Existing stored V2/V3 amounts, negative credits and incomplete-estimate messaging are preserved; V1 receives no invented closing total. Display only; no shared financial formula, server, migration or environment changes.

The combined isolated release passed 225 web budget/LOI/PDF/buyer-command tests, repository typecheck, web lint, and the final Next 16.2.6 production build. Regression verifies progressive 57-stop scale, blank required amounts, zero/custom/decimal/high values, handle clamping, meaningful accessible controls, reversed input, and saved historical cash/deposit figures including negative credits. The local labelled synthetic browser preview confirms keyboard steps ($800,000/$950,000), exact $731,249/$987,654 preservation through a synthetic validation error, pointer dragging to $350,000, and 390px/1440px layouts without horizontal overflow. The prominent card shows $962,000 remaining due, $992,000 including deposit and a $30,000 earnest credit at 26px/850 font weight on phone. Screenshots: .artifacts/mobile-preview/budget-slider-phone.png and cash-deposit-phone.png. The final build includes the corrected range CSS. No new dependency, shared financial formula, server, schema, migration or environment changes; pending tours/disclosure code remains excluded. Deployment dpl_3MSMxPzX1PWkctFsUc838jP4MYYW is READY; both existing aliases assigned and public home/login 200, messages 307, notifications 401, anonymous PDF 401. Protected unique login returns 200. Live authenticated read-only browser preserves completed LOI and PDF access; richer cash display verified in synthetic V3 preview because that older live record has V1 calculations. Production terms were not changed. Rollback: dpl_4oZSfFqNFUREGZRhf26r2NBV6vVs. Public site: https://liber-one.vercel.app/.

Completed LOI PDF download, October 6, 2026: Once both parties align on the exact current revision, a Download PDF section appears at the end of the completed LOI for both authorized participants. The private export includes all final shared terms and their stored calculations, excludes drafts and private seller payoff input, and is unavailable before alignment or while viewing history. The server rechecks participant access and aligned status for every download; no public PDF URL or stored export is created. Pinned server-only pdf-lib 1.17.1 and fontkit 1.1.1 plus the licensed DejaVu Sans font support generation and Unicode text. The font is explicitly included in function tracing. No database, migration, environment, shared financial formula or seller-disclosure changes.

The isolated PDF release passed 250 web LOI/chat/policy/PDF tests, repository typecheck, web lint, and the Next 16.2.6 production build. Both-role download rendering and route tests cover alignment, missing current revision, auth failure, private attachment headers, and rate limiting. A separate synthetic export preview passed; all five pages were rendered with Poppler and inspected, with accented names, fee estimates, and commissions readable. Extracted text confirms private draft exclusion. The production PDF function trace explicitly includes DejaVuSans.ttf. Only PDF dependencies were added to the pinned production lockfile; existing dependencies remain unchanged. Deployment dpl_4oZSfFqNFUREGZRhf26r2NBV6vVs is READY with both existing aliases assigned. Public smoke checks pass; anonymous PDF access is denied and protected login returns 200. The authenticated seller browser downloaded the existing labelled synthetic aligned revision successfully and confirmed the bottom download button; the PDF was reopened and parsed as the exact current revision. Buyer behavior is covered by regressions, not a second production login. No shared LOI terms were mutated. No migration or environment changes. Rollback: dpl_FXVrykWAfccHt9XXy1rfYN8ottVh. Public site: https://liber-one.vercel.app/.

Completed LOI read-only access, October 6, 2026: Completed LOIs remain accessible to both authorized participants as read-only final terms. Chat offers View completed LOI after Terms aligned. Completion closes any open editor/review state and hides draft, template-apply, submit, counter, and decision controls; historical revisions remain readable. Private seller payoff estimates remain separate from shared terms. No server, database, migration, environment, calculation, or dependency changes.

The isolated release passed 289 tests (222 web LOI/chat/server-policy and 67 validator), repository typecheck, web lint, and the Next 16.2.6 production build. Server audit confirms both immutable participant identities retain access to aligned submitted revisions, with no draft/action exposure and terminal mutation denial. Both-role client regressions cover stale draft/actions, initial/editor/review transitions, and suppression of all shared-term mutations. Deployment dpl_FXVrykWAfccHt9XXy1rfYN8ottVh is READY; both existing aliases point to it. Anonymous home/login return 200, messages 307, notifications 401; protected unique login returns 200. Authenticated read-only browser verified completed labels, chat reopening, immutable final revision, historical access, and absence of editing/decision controls. No shared LOI terms were mutated during verification; browser activity used an existing labelled synthetic record. Rollback: dpl_GDxfqDSNsNcdKFSBt7Zihfea8MUy. Public site: https://liber-one.vercel.app/.

Seller loan payoff and itemized net proceeds, October 6, 2026: seller-side
calculator includes a private Seller loan payoff box and lists the seller's
share of every fee before the final Net proceeds amount. Buyer agent commission,
seller agent commission, escrow, title, Other closing costs, warranty, taxes,
retrofit, three HOA fees, personal-property charges, and closing rent-back are
each listed. Buyer-paid shares display zero and missing applicable amounts remain
Not estimated. Credits and the payoff are separate deductions. Net proceeds
subtracts the entered payoff once from the displayed seller cash subtotal;
negative proceeds remain visible. Blank or invalid payoffs do not imply zero.

Payoff input is seller-only component memory keyed by negotiation, retained
across local review/draft view changes, and reset on refresh/navigation. It never
enters LOI terms, draft/API payloads, templates, storage, or server summaries.
No server authorization, database, migration, environment, dependency, or
calculation-version contract changes. Only the existing allocation function is
exported for shared fee-display logic; financial formulas are unchanged. Stored
V2/V3 totals stay authoritative with an explicit adjustment if detail differs.
V2 excludes unsupported V3 expense semantics, and V1 reports Not calculated.

32 focused regression tests passed for full named-fee reconciliation, frozen
historical figures, warranty payer/Other shares, odd-cent splits, stale inactive
quotes, null-versus-zero, payoff parsing/ranges, negative proceeds, seller
financing, unchanged buyer/term/template data, actual component rendering,
seller-only gating, and unavailable financial summaries. The labelled synthetic
browser preview confirmed a $600,000 payoff gives $336,800 net proceeds;
moving an $800 warranty to Buyer gives $337,600 and Other shares of $250 buyer /
$550 seller give $337,050. A $1,000,000 payoff retains -$62,950; invalid payoff
shows Check payoff. Input changes update while focused, the payoff persists
across local counter editing, buyer view has no payoff/calculator nodes, and
390px/1440px layouts have no horizontal overflow. Screenshots are
`.artifacts/mobile-preview/seller-proceeds-phone.png` and
`seller-proceeds-laptop.png`. The isolated release passed 248 LOI tests
(67 validator and 181 web), repository typecheck, web lint, and the Next 16.2.6
production build. The final hint text was confirmed in built client/SSR assets.
Scope guards preserve server, schema, financing exception, templates, actions,
dependencies, and operational settings; the validator change is only the
allocation export alias. The fixture server is stopped and temporary tab closed.
Deployment `dpl_GDxfqDSNsNcdKFSBt7Zihfea8MUy` is READY and both existing aliases
point to it. Public site: https://liber-one.vercel.app/. Protected unique login
returned 200; anonymous public home/login returned 200, messages 307, and
notifications 401. The authenticated read-only browser confirmed new deployment
assets and the private seller payoff box with the final hint. The existing
synthetic legacy calculation-version-one record correctly shows Net proceeds
Not calculated; no saved draft or revision was mutated. New-version cash and
warranty/payoff interaction evidence uses the isolated fixture above.
Snapshot: `.artifacts/seller-proceeds-release-1791345285600/site`.
Rollback: `dpl_8TThmkFPxjrsErxms3we9VpbGYYn`.

Payer cash equations and commission visibility, October 6, 2026: fee estimates
are expanded by default, buyer-agent commission identifies who pays, and both
parties have numeric cash equations beside the live totals. Equations use the
displayed summary, preserving historical version-two figures; version-one
summaries do not invent unsupported cash values. Buyer costs add to cash to
close; seller costs reduce proceeds. Through-escrow rent-back is displayed once
per party and monthly rent-back remains separate. Seller cash changes also have
polite live announcements.

The audit confirmed all commission, escrow, title, warranty, transfer-tax,
retrofit, HOA, personal-property, credit, and rent-back fields already feed the
calculator. It identified and fixed incomplete explicit Each Own escrow/title
quotes becoming full totals during payer switches. Both shares must be known
before they combine; null remains unknown, while explicit zero is valid. Legacy
omitted title payers retain existing compatibility. No calculation-version,
server, database, migration, environment, or dependency change is required.

Source focused UI/equation tests passed (38), plus 24 comprehensive payer-math
regressions covering percent/dollar commission, price changes, every payer,
odd-cent splits, Other warranty shares, partial quotes, credits, deposit,
rent-back, and incomplete unrelated party fields. A labelled synthetic browser
preview verified immediate commission changes while the input remained focused,
all payer selectors, incomplete fee handling, and 390px/1440px layouts without
overflow. Buyer commission switched from seller to buyer moved $25,000 from
seller costs to buyer costs; the equations matched $987,000 buyer cash and
$961,800 seller cash. Screenshots are
`.artifacts/mobile-preview/payer-equation-phone.png` and
`payer-equation-laptop.png`. The isolated release passed 216 LOI tests
(67 validators and 149 web), repository typecheck, web lint, and the Next 16.2.6
build. The local build used dummy localhost database URLs, without credentials
or database operations. Scope guards preserve server, validator, schema,
financing exception, templates, and operational configuration. The preview
server is stopped and its temporary tab closed.

Deployment `dpl_8TThmkFPxjrsErxms3we9VpbGYYn` is READY and both existing aliases
point to it. Public site: https://liber-one.vercel.app/. The protected unique
login returned 200; anonymous public checks returned 200 for home/login, 307
for messages, and 401 for notifications. The authenticated read-only live
browser confirmed new deployment assets and retained the existing synthetic
historical LOI view; no saved draft or revision was mutated. Browser cash
interaction evidence uses the isolated labelled synthetic fixture above.
Release snapshot: `.artifacts/payer-equation-release-1791344869800/site`.
Rollback target: `dpl_HFwcxoPfbKhhjRrruCHGmBX93H55`.

Seller first-offer heading, October 6, 2026: a seller viewing the first
submitted revision sees Offer from followed by the buyer legal/entity name
already shared in that immutable LOI, with buyer as the blank-name fallback.
Version, author role, submitted time, and deadline remain in review metadata.
Buyer views and later revisions retain their existing headings. Historical
revision-one views retain their history banner and use the same offer heading.
Names render as inert React text and wrap even when 200 characters are unbroken.
Private drafts, authorization, response actions, and stored terms are unchanged.
The only runtime file changed is `loi-workspace.tsx` (heading and wrapping).
Product, roadmap, and section notes are updated; no migration, dependency,
environment, or production record change is required.

Five existing source workspace tests passed. A labelled synthetic preview
verified the seller's Offer from North Shore Buyer LLC heading, retained
version/author/time/deadline metadata and response actions, buyer revision-one
and seller counter headings, and phone/laptop layouts. A maximum-length
unbroken name wrapped without horizontal overflow at 390px. Screenshots are
`.artifacts/mobile-preview/offer-heading-phone.png` and
`offer-heading-laptop.png`. The isolated release passed 38 existing workspace,
state, and presentation tests, repository typecheck, web lint, and the
Next 16.2.6 production build. Scope guards confirm only two workspace lines
changed from the cash-to-close release.

Deployment `dpl_HFwcxoPfbKhhjRrruCHGmBX93H55` is READY. Both existing aliases
point to this release; the public site is https://liber-one.vercel.app/.
The protected unique deployment returned 200 for login. Anonymous public
checks returned 200 for home/login, 307 for messages, and 401 for notifications.
Read-only live browser verification on the existing synthetic negotiation
confirmed the new deployment assets and Offer from Liber Demo Buyer Journey
0925 on seller revision one; returning to current revision two restored its
existing heading. No real record was mutated. The local fixture server is
stopped and its temporary tab closed. The isolated snapshot is
`.artifacts/offer-heading-release-1791344439043/site`; rollback remains
`dpl_2TTP22BPnLFm2uuzbHGnEFdsZWKA`.

Expected cash to close presentation, October 6, 2026: the buyer's live cash
total in the deal snapshot and calculated review rows now uses this label.
The existing draft calculator updates immediately from valid price, funding,
credit, commission, and allocated expense inputs; the amount has polite,
atomic live announcements for assistive technology. Formulas, calculation
versions, saved historical figures, and submission gates remain unchanged.
Unknown fees remain excluded with the existing incomplete-estimate explanation.
Changed runtime files are `loi-workspace.tsx` and `loi-presentation.ts`.
Product, roadmap, and LOI section notes are updated. No migration, dependency,
environment, or production record change is required.

Source verification: 34 existing workspace/presentation/editor-values tests
passed. A labelled synthetic phone/laptop preview verified the total changes
while inputs remain focused: $1,100,000 price minus $33,000 deposit plus $1,200
buyer warranty minus $10,000 seller credit produced $1,058,200; changing price
to $1,150,000 immediately produced $1,106,700. No real draft was edited or saved.
Screenshots: `.artifacts/mobile-preview/cash-to-close-phone.png` and
`cash-to-close-laptop.png`. The isolated release passed 67 validator and 33 web
tests (100 total), typecheck, lint, and the Next 16.2.6 production build. Scope
guards prove exactly two runtime lines changed from the latest template release,
with the existing financial formulas, templates, and financing exception intact.
Vercel build passed and `dpl_2TTP22BPnLFm2uuzbHGnEFdsZWKA` is READY on both
production aliases, including `https://liber-one.vercel.app/`. Protected login
returned 200; anonymous public home/login returned 200, messages 307 to login,
and notification activity 401. The authorized synthetic aligned workspace
loaded read-only, and its observed current-deployment assets include the new
label. An immediate browser reload initially retained the previous deployment
during alias propagation; a subsequent reload confirmed the new deployment ID.
The fixture tab/server were stopped. The isolated snapshot is
`cash-to-close-release-1791344163058/site`; previous template deployment
`dpl_5fwqEp91qKxgRxZTZQqE3W6aHRDp` is the rollback target for both aliases.

LOI template feature, October 6, 2026: More options now offers Save LOI template
and Use saved template. Native, accessible dialogs name, update, apply, and
confirm removal of browser-saved templates. Storage is scoped to the verified
current account, bounded to 20 templates and 128 KiB, and validated with schema
version 1. Corrupt, unsupported, unavailable, or full storage reports failure
without silently replacing data. This first version does not sync across devices.

Only explicitly whitelisted reusable terms are saved. Purchase price, deposit,
funding and lender details, buyer/agent identity, deal/property binding, and
seller disclosures remain on the target LOI. Counter application respects the
server's locked title company, warranty inclusion/company, possession limits,
and additional terms. It resets Other-cost exclusion confirmation and marks
terms unsaved, requiring the existing exact saved-draft review before submit.
The live calculator uses the target deal price after application. Existing
historical revisions and authorization gates are unchanged.

Changed runtime files are `loi-template-values.ts`, `loi-template-storage.ts`,
`loi-template-dialog.tsx`/CSS, `loi-action-bar.tsx`, `loi-workspace.tsx`, and the
authorized negotiation page. Product, roadmap, section, and backend contract
notes are updated. No migration, dependency, environment, template API, shared
production record, or financing-exception change is required.

Verification: source 67 focused model/storage/action/state/workspace tests and
repository typecheck passed. The isolated release passed 67 validator tests
and 182 web LOI tests (249 passed; nine guarded database tests skipped),
typecheck and lint. Actual workspace components in a labelled synthetic local
preview passed browser save, reload, same-name update, new-deal apply, field
focus, and phone/laptop layout checks. No real draft, decision, or submission
was mutated. The final Next 16.2.6 local and Vercel builds passed. Deployment
`dpl_5fwqEp91qKxgRxZTZQqE3W6aHRDp` is READY on both production aliases,
including `https://liber-one.vercel.app/`. Protected deployment and public
alias checks returned home/login 200, messages/LOI 307 to login, and notification
activity 401. The signed-in seller opened More options and the Save LOI template
dialog on the existing synthetic aligned revision; no template or draft was
saved there. Screenshot: `.artifacts/mobile-preview/loi-template-live.png`;
synthetic responsive evidence: `loi-template-phone.png` and
`loi-template-laptop.png`. The temporary fixture tab/server were stopped.

Release used the isolated `loi-template-release-1791343754881/site` snapshot,
preserving the warranty V3 calculator, historical decoders, financing test
exception, and submission/navigation fixes. Pending tours, PDF export, seller
disclosure provenance, cron changes, and unrelated dirty source were excluded.
The verified previous deployment `dpl_GooVBp421JibDxGXA18qFahAezky` is the
rollback target for both aliases; rollback requires no data or schema changes.

Commission entry uses explicit Percent (%) / Dollar amount ($) selectors with
a matching amount input. Switching units clears the previous numeric entry;
existing drafts restore the saved unit. This presentation change preserves the
existing percent/dollar string contract, calculation versions, submission
validation, optional unknown estimates, and immutable historical revisions.

Presentation release verification, October 6, 2026: 41 focused LOI tests,
repository typecheck, web lint, and the isolated production build passed.
The actual selector component was exercised in a labelled local synthetic
fixture at 390px and 1440px using the deployed baseline's validator. Checks
covered percent/dollar restoration after saving and remounting, clearing on
unit changes, invalid percentages and conflicting pasted symbols, zero values,
disabled fields, 48px tap targets, and no horizontal overflow. Production build
`dpl_Br5mM2m8RQPusT9nrQzUmtmUB4XC` is READY on `https://liber-one.vercel.app/`.
Anonymous home/login returned 200, private messages/LOI pages 307 to login, and
notification activity 401. The signed-in seller's existing synthetic aligned
LOI loaded read-only; its state has no editable commission field, so production
draft mutation was not exercised. No migration, dependency, environment,
authorization, calculation, or product-scope change is required. Product docs
were unchanged for this presentation request. The narrow live release updates
the existing buyer-agent commission field; the same component also serves the
pending local seller estimate field, whose broader feature was not released.
Fixture proof is `.artifacts/mobile-preview/commission-selector-phone.png`
and `commission-selector-laptop.png`; fixtures were excluded from deployment.

Escrow allocation release, October 6, 2026: changing the escrow payer preserves
the provided escrow total and assigns it to Buyer or Seller; choosing Each Own
does not infer a split. Seller costs reduce seller cash before payoffs, while
buyer costs increase cash required at closing. Recommended customary allocation
shows locked Seller selections for city/county transfer taxes and government
retrofit items. Turning it off enables overrides starting from Seller defaults.
No tax rates or provider fees are inferred.

The narrow release adds the existing source's closing-estimate inputs, version-2
calculator/presentation, counter estimate passthrough, and dual V1/V2 stored
summary decoding to the prior live application. Changed implementation files
are `loi-editor.tsx`, `loi-editor-values.ts`, validator `loi.ts`, service
`service.ts`, `loi-presentation.ts`, and the workspace Summary component, with
editor/value/service regression tests. Product V1 definition, CEO roadmap, and
LOI/UI section notes were updated. Unrelated tours, disclosure attribution, and
PDF work remain excluded.

The concurrently released submission/error-feedback fix and existing scoped
financing test exception from `dpl_BwdGKMKTAgQr6EFJRXQWY4h181MR` were preserved
in the combined release. No exception scope, expiry, environment, or permission
was changed by this escrow task. Final production deployment
`dpl_LYMWgA8cgPEjs394fpcqSBgcFWwf` is READY and assigned to both existing aliases;
the direct site remains `https://liber-one.vercel.app/`.

Verification: 84 focused release web tests and 43 validator tests passed; two
additional Buyer/Seller counter-estimate regressions passed against both the
current source and the combined release service. Repository and release
typechecks and web lint passed, as did the final production build. The actual
patched editor and Summary were exercised in an isolated synthetic fixture at
390px and 1440px: $3,000 seller escrow reduced seller cash to $997,000 on a
$1,000,000 cash purchase; moving it to Buyer raised buyer cash after the 3%
deposit to $973,000. Fee edits updated immediately, saved state restored on
remount, recommended allocation reset custom selections to Seller, and turning
it off enabled overrides without horizontal overflow. Proof screenshots are
`.artifacts/mobile-preview/escrow-phone.png` and `escrow-laptop.png`.
Live anonymous home/login returned 200, messages/LOI pages 307 to login, and
notification activity 401. An existing signed-in synthetic aligned historical
LOI reopened with its stored version intact. Actual production drafts were not
edited/submitted. No migration or new dependency is required; manual unknown
fees remain blank and excluded from explicitly incomplete subtotals.

Independent title payer release, October 6, 2026: the editor now presents
separate Who pays escrow and Who pays title insurance selectors. Both support
Buyer, Seller, and Each Own. New starter terms explicitly select Seller for
title insurance. Changing title's payer preserves the entered title total,
moves it to that party's estimate, and leaves escrow alone. Counter revisions
can negotiate the title payer while the server retains the immutable base title
company; omitted fields from older clients preserve the base payer.

Implementation changes are in shared validator `loi.ts`, `loi-editor.tsx`,
`loi-editor-values.ts`, `loi-presentation.ts`, and server `service.ts`, with
validator/editor/value/counter regression tests. The optional title payer field
does not default during historical parsing; historical terms and previews match
the prior deployed calculator exactly, including old two-party title estimates.
Existing V1/V2 stored-summary decoding and the scoped submission fix remain
intact. V1 definition, CEO roadmap, and LOI/UI section notes were updated.

Final production deployment `dpl_HMsXZDzLugyDxAo6PwFDt7DAJuXW` is READY on both
existing aliases; the public site is `https://liber-one.vercel.app/`. The isolated
release passed 79 focused web tests and 44 validator tests, typecheck, lint, and
production build. The historical compatibility verifier passed. Actual patched
editor/Summary interactions at 390px and 1440px confirmed independent payer
changes, live fee allocation, saved-choice restoration on remount, and no
horizontal overflow. Fixture proof is `.artifacts/mobile-preview/title-payer-phone.png`
and `title-payer-laptop.png`. Public home/login returned 200, private messages/LOI
pages redirected to login, and notification activity returned 401 anonymously.
An existing signed-in historical aligned synthetic LOI reopened successfully.
Interactive draft checks used synthetic local data; production terms were not
edited or submitted. No migration, dependency, or environment change is required.

Warranty and out-of-pocket release, October 6, 2026: the warranty maximum is a
budget estimate charged to its selected payer; Each Own/Other use explicit
shares capped by that maximum. Entered transfer taxes, retrofit, HOA fees, and
additional personal-property charges follow their payers. Through-escrow
rent-back reduces seller cash and credits buyer cash once; monthly rent-back
is shown separately. Other-cost exclusion confirmation prevents duplicate
estimates. Unknown shares remain unknown during payer changes. New calculations
use V3; immutable V1/V2 summaries retain their stored amounts and decoding.

Changed files: `packages/validators/src/loi.ts` and regression tests;
`apps/web/components/loi/loi-editor.tsx`, `loi-editor-values.ts`,
`loi-presentation.ts`, `loi-workspace.tsx`, and related tests;
`apps/web/server/loi/service.ts` and behavior tests. V1 definition, CEO roadmap,
and LOI section contract were updated. No migration, dependency, or environment
change is required. The live financing test exception, submit/navigation fix,
and other previously released features are preserved; pending tour/PDF/disclosure
provenance work is excluded. Once V3 records exist, rollback requires V3 decoding.

Production deployment `dpl_7dvWzwJvjgQH4PX1UhafEMaFqUCz` is READY and assigned to
both existing aliases, including `https://liber-one.vercel.app/`. Isolated release
verification passed 66 validator +85 focused web tests (151 total), typecheck,
lint, and production build. After the final currency display fix, Summary tests,
typecheck, and lint passed again. Source verification additionally passed 148
focused LOI/server tests. Actual released editor/Summary interaction at 390px
and 1440px confirmed $800 warranty allocation moves correctly, $250/$450 explicit
shares restore from saved synthetic state, itemized tax/retrofit/HOA/additional
item expenses update cash, odd-cent split remains conserved, monthly rent-back
stays separate, customary payers move amounts to Seller, and editing Other resets
its confirmation. Currency amounts remain unbroken, with no horizontal overflow.
Proof: `.artifacts/mobile-preview/warranty-phone.png` and `warranty-laptop.png`.

Protected anonymous LOI access returned 307; public home/login returned 200,
private messages/LOI returned 307, notifications returned 401. A signed-in
historical aligned synthetic LOI reopened successfully without edits. All
interactive draft tests used isolated synthetic local state; no actual drafts,
revisions, shared database records, or environment settings were changed.
Actual provider rates, mortgage payoffs, and prorations remain outside these
entered estimates. Unknown costs are excluded and visibly marked incomplete.

Warranty payer correction, October 6, 2026: home warranty now offers Buyer,
Seller, and Other. Each pays own is removed from the warranty dropdown and
rejected by editable draft/counter validation. Legacy terms retain historical
parsing/calculation; reopening a legacy draft displays Choose who pays without
silently assigning its costs. Other retains explicit shares and its allocation
note. Escrow, title, and HOA choices are unaffected. Changed
`apps/web/components/loi/loi-editor.tsx`, `packages/validators/src/loi.ts`,
and their tests; the server counter fixture now uses Other. Focused source
verification passed 67 validator and 61 web tests, workspace typecheck, and
changed-file lint. Narrow-release verification passed 67 validator and 43 web
tests (110 total), workspace typecheck, and web lint. The actual released editor
at 390px showed exactly Buyer/Seller/Other with no horizontal overflow; changing
Seller to Buyer moved the $800 synthetic warranty estimate to buyer costs.
Proof: `.artifacts/mobile-preview/warranty-payer-phone.png`.
Production build passed; deployment `dpl_GooVBp421JibDxGXA18qFahAezky` is READY
on both existing aliases, including `https://liber-one.vercel.app/`. Protected
anonymous LOI access returned 307; live home/login returned 200 and private LOI
returned 307. Browser interactions used isolated synthetic state; no real draft
or revision was changed. Historical each-own allocations require an explicit
supported payer when editing; stored immutable summaries retain their values.
Updated product/section contracts; V1 definition, CEO roadmap, and LOI section notes
were updated. No migration or environment changes are required.

LOI V1 is a non-binding term-alignment workspace linked one-to-one with an
accepted invite and its canonical private conversation. It lets the two
authoritative invite participants:

- prepare owner-private drafts;
- submit an immutable buyer-authored initial revision;
- alternate immutable counters;
- decline or align on the exact current revision;
- record proposed buyer-agent commission amount and payer when represented;
- estimate buyer/seller closing costs from manually supplied fees and commissions;
- let the seller supply the death-on-property disclosure;
- download a non-binding summary PDF of the exact aligned version;
- withdraw under the limited rules below; and
- retain an auditable history for later formal contract preparation.

“Terms aligned” means only that the two participants selected one exact proposed
term revision for later document preparation. It is not legal acceptance or a
signature.

### Non-goals

LOI V1 does not:

- create, execute, or accept a purchase agreement or legal offer;
- generate a purchase agreement or contract (the aligned-summary PDF is a non-binding record);
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
- interpret legal holidays or business-day rules automatically.

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
- a usable current buyer-account name; and
- both immutable participant UUIDs on the explicit reviewed cohort list.

Runtime gating and production readiness apply the same cohort rule to the raw
comma-separated member list: it must contain exactly two entries and exactly two
case-insensitively unique UUIDs. A duplicate-expanded value such as `A,B,B` is
rejected instead of being silently collapsed to a valid pair.

The buyer-account name is needed only to create safe starter terms. A positive,
supported invite-time price seeds the proposed price from that immutable
snapshot, never the mutable current listing price. An absent or zero asking
price does not block creation: the starter-only missing-value marker is zero,
rendered as a blank Offer price with guidance to enter the buyer's proposed
amount. No financial preview is calculated until that amount is positive.
Private drafts may save without a price. Review and revision submission retain
their strict positive-price validation. Existing immutable snapshots and revisions are unchanged.
Once a negotiation exists, ongoing eligibility does not depend on later
edits to starter-only values.

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

Each new submitted revision receives an absolute response deadline exactly 48
hours after the locked server-side submission time. The editor explains this
window; the client does not choose it. Idempotent retries return the original
revision and deadline. Historical revisions retain their stored deadlines,
including retries from the previous client request shape. The current deadline
is reloaded under the mutation lock before draft, submit, decision, and
withdrawal transitions that depend on it.

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
| Purchase and funding | Purchase price plus exactly one of cash, financed, or structured seller financing; the explicit Other financed loan UI choice maps to financed with loan type `OTHER` |
| Deposit | New drafts are 3% of price; historical revisions may still store a fixed amount |
| Timing | Closing 1–90 days on new drafts; inspection, disclosure, title, explicit appraisal Yes/No with conditional days, and optional loan-contingency durations |
| Possession | At closing, positive days after closing, seller rent-back paid through escrow or monthly, tenant remains, or described other terms |
| Representation | Buyer-represented flag, conditional agent contact, and when represented a commission amount plus payer |
| Providers and costs | Proposed escrow/title choices, escrow fee payer, explicit seller-credit choice with conditional amount/note, customary or specific alternate cost payers, and optional warranty with special inclusions |
| Closing-cost estimates | Optional explicit buyer/seller escrow, title policy, and misc. fee estimates; seller-agent commission amount or percentage (seller view only); estimate note. Blank escrow, title, and buyer misc. use scheduled estimates; other blanks mean unknown; 0 means no charge. |
| HOA and personal property | HOA fee-payer choices (document fee is buyer, seller, or not applicable on new drafts), conditional included-item list with payer, and excluded items |
| Disclosures | Seller-authored death-on-property answer, condition, and conditions of sale. Buyer counters cannot change the seller's death disclosure. Historical answers without attribution remain identified as source not recorded. |
| Additional terms | Proposed terms and explicit exclusions |

### Conditional and cross-field rules

- Purchase price is positive.
- Financed terms require down payment not above price, a lender name or company,
  an allowlisted loan type, and a note when loan type is `OTHER`.
  Other financed loan uses this same union and retains the lender and
  pre-approval submission checks; it is not an unstructured funding bypass.
- Seller financing requires positive principal; cash down plus principal must
  equal price; annual interest is 0–5,000 basis points; term, amortization, and
  balloon are positive and at most 600 months; amortization cannot be shorter
  than term; balloon cannot exceed term; and interest-only terms must leave
  amortization null. Initial non-interest-only drafts require an amortization
  schedule. A dedicated counter validator permits missing historical
  amortization only because the service copies funding from the immutable
  current revision; the client cannot replace those locked funding terms.
- Switching a funding union constructs a new compatible object. Switching to
  cash also clears loan contingency.
- A fixed deposit and seller credit cannot exceed price.
  An explicit seller-credit Yes requires a positive amount; No requires zero
  amount and an empty reason. Optional choice metadata keeps historical
  revisions readable, with older credit amounts determining the displayed
  choice. No clears both amount and reason in the editor.
- Closing duration is 1–90 days on new drafts. Stored historical revisions may
  still show 1–365 days. Other contingency durations are 0–365 days or null
  where optional.
- Days-after-closing and seller rent-back durations are positive. New rent-back
  drafts use through-escrow or monthly frequency; daily/weekly remain readable
  on historical revisions.
- Tenant-remains and other possession require narrative detail. Switching the
  possession union clears incompatible fields.
- A represented buyer needs agent name plus email or phone. An unrepresented
  buyer must have all agent fields cleared. New drafts also require commission
  amount and payer when represented.
- A custom escrow or title provider needs a name or company.
- If customary closing costs are false, editable drafts require a payer for
  city/county transfer taxes and a payer for government-required retrofit,
  smoke-detector, and CO-detector items. Each choice is buyer, seller, split
  equally, or not applicable; supplemental allocation text is optional.
  When customary costs are true, specific payer metadata must be absent and
  alternate text must be empty. Historical free-text-only allocations remain
  readable; editing requires the missing specific selections to be reviewed.
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

`schemaVersion = 1` remains the terms format; new revisions persist
`calculationVersion = 7`. Existing calculation-version-1 through version-6 records retain their
original stored summary and version-specific decoder. Optional JSON fields preserve the existing
terms schema and require no database migration. The server loads the exact saved
draft and recomputes the summary; no route accepts a client-computed summary.

Calculation version 1 derives:

- earnest-money cents;
- earnest-money basis points;
- loan amount;
- loan-to-value basis points;
- remaining down payment after deposit; and
- effective price after seller credit.

Calculation version 2 retains these values and additionally derives:

- buyer-agent commission cents from the proposed dollar amount or percentage;
- seller-agent commission cents from the manually entered estimate, always seller-paid;
- buyer/seller closing-cost subtotals, adding only entered fee amounts and the
  commissions allocated to that party;
- buyer remaining cash at closing: down payment (full price for cash funding)
  minus deposit, plus buyer closing costs, minus seller credit;
- seller cash before mortgage payoffs: price minus seller closing costs and
  seller credit, minus seller-financed principal when that funding type applies;
- whether all applicable fee and commission estimates have been supplied.

Escrow allocations follow the proposed payer: each-own allows separate buyer and
seller fees; an exclusive payer hides and clears the other party's estimate.
Title and other costs are explicit allocations that must match the proposed
terms. Historical version-2 Other fee estimates include applicable loan, tax,
HOA, warranty, and recording fees; version 2 did not count warranty maximums.
Calculation version 3 adds the entered home-warranty maximum as a clearly labeled
budget estimate for Buyer/Seller; Each Own/Other uses explicit shares whose sum
cannot exceed the maximum. It adds entered transfer-tax, retrofit, HOA, and
additional personal-property costs according to each payer. Split Equally assigns
an odd final cent to the buyer; Each Own never infers a split. Not Applicable and
excluded items ignore stale estimates. Through-escrow rent-back is the entered
total debited from seller proceeds and credited to buyer cash once; monthly
rent-back is a separate future monthly amount with no guessed prorating.
Version-3 Other estimates cover additional fees only. When both Other and separately
calculated costs are positive, editable terms require confirmation that Other
excludes those costs. Historical combined Other figures cannot be automatically
deduplicated. Missing applicable fees or custom shares keep the estimate incomplete.
Calculation version 6 resolves a blank title estimate to one title policy at
0.25% of the price for the title payer (Each Own splits it, odd cent to the
buyer) and a blank buyer misc. closing-cost estimate to 0.2% of the price. It
stores the scheduled amounts, the resolved buyer/seller title and misc amounts,
and separate buyer and seller completeness flags; the combined flag is their
conjunction. Version 6 keeps blank seller misc. costs unknown; calculation
version 7 also resolves them to 0.2% of the price, so the stored seller misc.
amount is always known. Closing costs exclude property tax, homeowners
insurance, and lender fees.
New revisions store version 7; historical version 1–6 summaries retain their stored
values and decoders. No migration is needed. Once version-7 revisions exist,
rollback targets must retain version-7 decoding.
Escrow uses the supplied per-side schedule below. Other costs use entered
quotes; mortgage balances are not inferred.
Unknown amounts are excluded from subtotals and visibly flagged as incomplete.
Mortgage payoffs and prorations are excluded. Negative buyer cash is retained as
a modeled credit balance, subject to lender/escrow approval, rather than silently
clamped to zero. These figures are neither a lender Loan Estimate nor a Closing
Disclosure. A price counter recalculates percentage commissions from the new
price; immutable old summaries are never recalculated.

Death-on-property ownership is checked during both draft save and submission
using the authoritative buyer/seller role. Initial buyer terms always store
`UNKNOWN` without seller attribution, regardless of submitted JSON. Seller
counters stamp `deathOnPropertyProvidedBy: SELLER`; buyer counters preserve the
base revision's answer and attribution. The buyer editor displays that answer
read-only. Sellers receive an explicit disclosure prompt before alignment and
can propose an answer in a counter for the buyer to review. Agreement still
targets one exact immutable revision and cannot amend an answer implicitly.

Percentage-to-cents and ratio calculations use deterministic integer half-up
rounding. Historical views validate and display the immutable stored summary
with its recorded calculation version; they never silently recalculate an old
revision with newer code.

The editor uses a smaller financial projection for live preview
(`previewLoiCalculation`), so every money edit recalculates the snapshot even
while an unrelated required text field is incomplete. Cross-field financial
conflicts (down payment or seller credit above price, seller-financing amounts
not summing to price, warranty shares above the maximum) do not blank the
calculator: figures follow the entered amounts and the conflicts are returned as
`issues`, shown at the field and in the snapshot. A financed loan amount never
goes below zero; valid terms are never clamped. Full terms validation still
gates save and submit, and the server recomputes from saved terms only.
Money inputs accept a leading `$` and thousands separators, keep typed text
while focused, and reformat on blur. Editing seller-financed principal sets the
cash down payment to price minus principal (and vice versa).

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
version, and basis sequence. Save and review validates and saves dirty input,
then opens review from that returned canonical draft; it never submits. A
clean draft goes directly to review. A late save response cannot reopen review
after the basis revision, negotiation status, edit eligibility, or saved draft
identity has changed. Inputs are disabled while mutations are pending.
Background reads started before a completed mutation are ignored and retried,
so a delayed poll cannot replace a newly saved review with older draft terms.

The Draft → Review → Submit guide and one main next action replace competing
draft buttons. Review exposes Back to edit and the version-named Submit LOI or
Submit counter button. More options contains save for later, reset/discard, and
withdraw; reset/discard uses a native confirmation dialog. Submitted versions
start collapsed while drafting/reviewing, and no empty timeline is shown before
submission. Stale input blocks saving/review/submission and remains marked stale
even after further typing, until the user loads the latest canonical draft.

Main actions have at least 48px targets, visible keyboard focus, and dark text
on the existing brand-green primary background. The mobile bar remains fixed
and page padding keeps the final fields reachable. Moving between editing and
review focuses and scrolls the visible view heading. Validation failures return
to editing and focus the exact field; reset/discard cancellation restores focus.

Submission failures appear beside the fixed action buttons so they remain visible
from the bottom of a long review. Missing financing evidence exposes a buyer-profile
upload link and preserves the saved draft. Financed review repeats the evidence
requirement and explains that a pending uploaded pre-approval letter qualifies.
Successful submission focuses and scrolls the current submitted version, with the
existing Back to messages action available.

The October 6 Stone Door testing exception uses the three server-only settings
`LIBER_LOI_TEST_FINANCING_BUYER_ID`, `LIBER_LOI_TEST_FINANCING_NEGOTIATION_ID`, and
`LIBER_LOI_TEST_FINANCING_EXPIRES_AT` (canonical ISO UTC timestamp). Only the exact
buyer/negotiation pair may submit financed terms without evidence before that
expiry. Missing, malformed, mismatched, or expired configuration fails closed.
It does not grant a badge, change documents, bypass lender validation, or alter
other LOI eligibility checks. Its expiry is recorded in the submission event and
shown during review. Remove the three settings to revoke immediately. No migration
is required.

### October 6, 2026 Stone Door submission repair

Read-only account inspection confirmed an unsubmitted financed draft with no active
pre-approval badge or eligible uploaded letter. The user authorized a temporary
exception for this test. Production settings bind it to that one buyer and one
negotiation, expiring `2026-10-08T03:00:00.000Z` (October 7 at 8 p.m. Pacific).
No badge, document, draft, or revision was fabricated or edited to enable it.

Deployment `dpl_BwdGKMKTAgQr6EFJRXQWY4h181MR` was built from the exact source file
references of `dpl_Br5mM2m8RQPusT9nrQzUmtmUB4XC`, replacing only the LOI service,
workspace, action bar, and DTO type and adding the exception helper. The remote
build reached READY and was promoted; the canonical alias was verified against
that deployment ID. Unrelated local work was excluded from the release.

Verification: 160 LOI service/component tests passed (9 database tests skipped),
43 validator tests passed, workspace TypeScript passed, and targeted ESLint passed.
A controlled synthetic browser fixture verified financed draft review, successful
submission/current-view focus/Back to messages, and visible financing rejection
with upload recovery. Stone Door's actual LOI was not submitted by the agent.

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

LOI submission timestamps and response deadlines display in
`America/Los_Angeles` with the applicable PST/PDT label, matching the launch
market and invite deadlines. Server rendering and browser hydration use that
same explicit zone; stored absolute timestamps and deadline enforcement do not
change. Invalid timestamps display `Date unavailable`.

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

`authenticated` has `USAGE` but not `CREATE` on the private `app_private`
schema. That traversal privilege grants no relation or function access by
itself: raw private relations remain closed, and direct function execution is
limited to the four helpers that current RLS policies actually depend on:
`can_join_conversation_topic(text)`, `can_join_loi_topic(text)`,
`can_read_property_image(text, uuid)`, and
`can_upload_session_object(text, text, uuid)`. `PUBLIC`, `anon`, and
`service_role` receive no private-schema traversal or helper execution. The
schema is not exposed through the Data API, so selecting an `app_private`
profile remains denied even for an authenticated participant.

PostgreSQL's global and `app_private`-scoped default function privileges grant
no non-owner `EXECUTE`. Future `postgres`-owned private functions are therefore
owner-only unless a reviewed migration opts them in explicitly.

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
- an unexpired current response deadline for submission/counter notices,
  independently of whether expiry maintenance has persisted `EXPIRED`;
- immutable participants and active roles;
- accepted invite and active conversation;
- approved seller access;
- property ownership, readiness, approval, and identity version;
- no participant block; and
- both participants on the explicit reviewed cohort list.

Ineligible jobs are cancelled rather than sent. These checks do not replace the
open live-provider and scheduled-worker release evidence.
Committed agreement, decline, and withdrawal notices preserve their terminal
outcome and remain deliverable after the old response deadline. The isolated
PostgreSQL cases in `email-outbox.sql.test.ts` exercise the actual worker query
at the deadline boundary and after a terminal action; they do not claim
full-schema, RLS, or live-provider coverage.

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

Four additive migrations are authoritative in the LOI/release chain in both the
normal migration root and the locked current-baseline forward root. The last two
are cross-cutting Realtime/Storage ACL hardening, and every corresponding copy is
byte-identical.

| Migration | Purpose | SHA-256 |
| --- | --- | --- |
| `20260716030741_add_loi_negotiations` | Base models, constraints, triggers, RLS/grants, Realtime helper/broadcast, outbox integration | `27ece835990b92f9e035af019a615ae8196260244e8b0214d3828d6f22d31245` |
| `20260716120000_harden_loi_event_semantics` | Forward closed-state mapping, retained actor FK, event shape, and authoritative actor/revision validation | `bdc6e7b88c02b71b27b907de14601b0dfacdde937f11ff56ad7262dbc614ba86` |
| `20260717023000_grant_authenticated_app_private_usage` | Authenticated private-schema traversal with no create/relation access and an exact four-helper RLS execution allowlist | `1b1f6afbc6a233eea9e10e5c24a5a7998a1cbdbbe4805dcc7c4b0b79a82bcc84` |
| `20260717033000_harden_app_private_function_defaults` | Owner-only global and `app_private`-scoped PostgreSQL default function execution | `d1495a84e4f547da535ace05211fe4956624696995da777b83f8cec34cf3615f` |

The base migration bytes above are now immutable. The semantic and both
private-ACL repairs are separate forward migrations specifically so retained
environments never require an in-place history edit.

An earlier read-only inspection found the configured database latest at
`20260715215000_reconcile_email_outbox_lease`, before any LOI migration was
recorded. With explicit production approval, all four reviewed migrations were
later deployed through the normal Prisma migration path to the retained Liber
project. Its ledger now contains 33 successful migrations and matches the four
checksums above. A post-deploy catalog proof confirms the intended
private-schema, relation, function, and default-function ACLs. This
project-specific evidence does **not** prove every other retained or shared
environment.

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

Migration SQL line endings are explicit in `.gitattributes`. All four
release-chain migration copies are forced to LF so byte-identity checks pass on
Windows and Linux. The one older migration that production originally recorded
with CRLF remains explicitly CRLF; the locked baseline generator normalizes
pre-cutoff source line endings before enforcing its source digest.

The guarded upgrade harness requires the immediate pre-LOI state whose latest
migration is `20260715215000_reconcile_email_outbox_lease`. A proof-only Prisma
config stages the reviewed chain through the base LOI migration, verifies its
checksum and pre-repair catalog, seeds a valid two-revision/four-event aligned
negotiation, and then applies all three forward repairs through the normal
migration root. It proves the exact terms, summary, revision chain, events,
actors, and terminal outcome survive before testing the repaired constraints and
ACLs. The guarded fresh harness resets through `prisma.baseline.config.ts`. Both
final states assert all four exact ledger checksums plus tables, RLS, raw grants,
immutable triggers, terminal sequence rules, deadline and event-shape checks,
closed-reason mapping, retained actor FK, outbox index, the single bounded
private Realtime policy, the exact `app_private` schema/function allowlist, and
closed global and schema-specific default function privileges.

## Audit closure

| Finding | Final treatment |
| --- | --- |
| No protected exact-SHA PostgreSQL LOI lifecycle/race proof | Added sentinel-guarded fresh, upgrade, and service behavior harnesses and wired both targets into the protected exact-SHA workflow. The isolated application-equivalent SQL lifecycle completed; protected fresh/upgrade and two-connection race execution remain release gates. |
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
| Authenticated private Realtime joins denied both real participants | The policy helpers had `EXECUTE`, but `authenticated` lacked `USAGE` on their `app_private` schema. A forward migration now grants traversal without `CREATE` or relation access, derives the exact four current policy-helper dependencies from the catalog, grants only that execution allowlist, and keeps all other browser/service roles closed. |
| Schema-specific defaults could reopen future private helper execution | A separate forward migration revokes and asserts owner-only PostgreSQL default function privileges both globally and for `app_private`; existing function execution remains the exact four-helper allowlist. |

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
- An earlier read-only production preflight confirmed PostgreSQL 17.6, the
  immediate pre-LOI ledger boundary, absent LOI relations/types, compatible
  Realtime policy shape, and no blocking `EmailOutbox` data.
- At that point the production migrations had not yet been applied. The
  authorized deployment and post-deploy evidence below supersede that earlier
  migration state; the LOI flag and real-user cohort remain disabled.

### Production deployment and disposable authenticated proof on 2026-07-17

- The retained Liber project `qfjcrhkjlczvzakxives` has all four authoritative
  migrations in this release chain applied through the normal Prisma migration
  ledger. The ledger has 33 successful migrations, and each of the four release
  checksums matches the reviewed bytes in this document.
- Post-deploy catalog checks proved that `authenticated` has `USAGE` but not
  `CREATE` on `app_private`, has no raw private-relation access, and can execute
  only the four current policy helpers. `PUBLIC`, `anon`, and `service_role`
  remain closed. Global and `app_private`-scoped PostgreSQL default function
  privileges expose no non-owner `EXECUTE`. An actual `SET ROLE authenticated`
  call reached all four helpers and failed closed on invalid identifiers instead
  of failing schema resolution.
- An isolated disposable Supabase branch used exactly two marked real Auth
  accounts with reserved `.invalid` email addresses, one buyer and one seller.
  No credentials, passwords, or tokens are retained in this artifact.
- The branch persisted the opening invite, a buyer guided quick reply that
  accepted the invite and activated the canonical conversation, seller guided
  replies, content-free unread outbox rows, and matching audit evidence. It also
  persisted the complete LOI path: buyer initial submission, seller counter,
  and buyer terms alignment, with two immutable revisions, the exact event
  chain, cleared drafts, notifications, and content-free outbox state.
- Both real participants subscribed successfully. Each received exactly two
  messaging hints containing only `id`, `type`, `messageId`, and
  `conversationId`, and exactly three LOI hints containing only `id`, `type`,
  `eventId`, `revisionId`, and `negotiationId`. An unrelated private topic and
  an anonymous subscription were denied.
- With both buyer and seller JWTs, raw Data API reads of `Message` and
  `LoiNegotiation` returned `403`; requesting the `app_private` profile returned
  `406`, confirming that the private helper schema remains outside the exposed
  Data API.
- The primary persisted buyer/seller and LOI lifecycle was executed as
  application-equivalent SQL because a safely scoped preview application
  database connection was unavailable. The exact HTTP routes remain covered by
  route, authorization, and service tests; this run is not represented as an
  authenticated browser or Next.js HTTP journey. For LOI, trigger-created hint
  persistence and live Realtime transport were proved separately after the
  initial subscriber expired, not as one uninterrupted timing run.
- `scripts/realtime-branch-proof-subscriber.mjs` is the secret-free subscriber
  harness for repeating the two-participant, unrelated-topic, anonymous, and
  identifier-only payload checks on an explicitly disposable target. Run it
  separately once for a conversation topic and once for an LOI topic.
- After the proof completed, deleting the paid branch removed the two temporary
  Auth identities, fixtures, and scoped database role. Local proof artifacts
  were deleted separately. Only the production `main` Supabase branch remains.

### Final exact-tree verification on 2026-07-17

- `npm run lint`, `npm run typecheck`, `npm test`, `npm run build`,
  `npm run db:generate`, `npm run db:validate`, and
  `npm run db:baseline:check` passed. The full test run included database-target
  5/5, readiness 19/19, demo-buyer 4/4, secret-scan 9/9, both static migration
  audits, web 349 passed with 16 protected tests skipped, and validators 30/30.
  The locked baseline matched 26 sources plus seven forward migrations with
  digest `e1adcdc2370a7dd66127fc8c1c30f139afd0f4b63c6e7580e6f8db3041b56eb3`.
- Route, security, forbidden-auth-bypass, repository-secret, and public visual
  smoke checks passed. The visual harness captured all seven desktop/mobile
  surfaces after being launched outside the process sandbox; two sandboxed
  Edge attempts had failed on the Windows GPU/profile cache before rendering.
- Local readiness passed while correctly warning that
  `AUTH_RATE_LIMIT_PEPPER`, `CRON_SECRET`, `RESEND_API_KEY`,
  `RESEND_FROM_EMAIL`, and `SITE_URL` remain production-only configuration
  prerequisites. These results do not substitute for the protected database or
  authenticated LOI UI gates below.

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
- Record the exact buyer quick reply and seller response plus LOI participant
  versus outsider application behavior through real authenticated Next.js HTTP
  and browser sessions.
- Record authenticated reconnect/focus/poll recovery against canonical server
  reads; the identifier-only private Realtime transport boundary is proved.
- Record in-app/outbox exactly-once, supersession, cancellation, delivery-time
  revalidation, and configured provider delivery.
- Verify every retained environment's migration names and checksums.
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
   On an explicitly disposable authenticated target, also run
   `scripts/realtime-branch-proof-subscriber.mjs` once for
   `conversation:<uuid>` and once for `loi:<uuid>`; each invocation uses both
   participants. Retain the content-free results without credentials or tokens.
7. For any retained environment that is not current, deploy
   `20260716030741_add_loi_negotiations`,
   `20260716120000_harden_loi_event_semantics`,
   `20260717023000_grant_authenticated_app_private_usage`, and
   `20260717033000_harden_app_private_function_defaults` in order before any
   application version that references LOI tables or private Realtime helpers.
8. Run production readiness and verify all four exact checksums in the deployed
   ledger, plus the `app_private` schema, relation, function, and default ACLs.
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

## Google Sheet requirements review — September 25, 2026

Source: [Liber LOI Questions](https://docs.google.com/spreadsheets/d/1k6p-6RVr3IHfgZnjK6i4Buz4yGj_7If0wlU_z_OWy6M/edit).
The owner confirmed that **Site corrections** is the progress checklist and
**LOI questions** is the form specification. The September 25 live recheck was
saved locally as `.artifacts/loi-live-recheck-20260925.json`. It contains 26 task
rows plus the header in Site corrections and 32 populated rows in LOI questions.
Site corrections is unchanged from the earlier snapshot. The refreshed LOI
snapshot additionally includes column I in row 10 (seller-financing term, rate,
amortization, and interest-only treatment) and row 24 (agent company name).
Sheet status cells were not edited or used as proof of implementation.
The remaining configured grid was also checked: Site corrections A61:Z1015
and LOI questions A66:AB1018 returned no values, so no later rows were omitted.

The earlier audit incorrectly treated the homepage MAP heading as satisfying
the name change while permitting navigation to remain Demand map. That
exception is withdrawn. The recheck also found a legacy editable HOA option
that the previous audit incorrectly described as restricted to historical
display. Open or partially met requirements below must not be reported as
completed because another field or a broadly related workflow exists.

The tables distinguish **code evidence**, **recorded browser evidence**, and
**open business/product requirements**. Code evidence does not imply that every
option was exercised in a browser or deployed. Browser references are limited
to the specific local fixture or production journey recorded below; neither
proves external partner integrations. File paths are relative to `apps/web`
unless they start with `packages/` or `docs/`.

### Site corrections

| Sheet row | Requirement | Current code / open work | Verification boundary |
| --- | --- | --- | --- |
| 1 | Checklist headings | Header only; no software requirement. | Accounted for in the live source. |
| 2 | Demand search truncation | `app/globals.css` bounds the search to 520px on desktop, allows its input to shrink, and switches to full width on narrow screens. | Code reviewed; the earlier search-width release is recorded. No new search browser check is implied here. |
| 3 | Replace Demand map with MAP | Recheck corrected the missed labels: `components/primary-nav-items.ts`, `interactive-buyer-map.tsx`, and `static-buyer-map.tsx` now say Map; `app/page.tsx` already used MAP. | Code reviewed; 24 targeted map tests and TypeScript passed. Browser confirmed Map in navigation and both map headings. The earlier homepage heading alone was insufficient. |
| 4 | LOI questions | All 39 source rows are accounted for below, including blank rows and unresolved requirements. | This umbrella row is not a blanket completion claim. |
| 5 | ID-verification partner | Open business dependency: partner selection, credentials, and the agreed verification workflow. `app/buyer/badges/page.tsx` and admin review support private ID evidence only. | No partner integration or partner verification was performed. |
| 6 | Email partner lender for verification badge | Open business dependency: identify the recipient and verification process. `server/email.ts` contains invite, unread-message, and LOI-update email, not lender verification. | No third-party lender email was sent; manual evidence review is not completion of this task. |
| 7 | New avatar options | `lib/avatar-variant.ts` allowlists 32 generated animal variants; `app/buyer/profile/page.tsx` has the picker; `server/contracts.ts` validates and persists selection. | Code reviewed. No fresh browser pass across all 32 options. |
| 8 | Earnest-money deposit fixed at 3% | `packages/validators/src/loi.ts` enforces 300 basis points on editable terms and calculates the amount; `components/loi/loi-editor.tsx` displays the derived deposit. | Production cash journey verified $26,400 at $880,000 and $26,700 after a $890,000 counter. Historical revisions retain their recorded values. |
| 9 | Escrow limited to 90 days | `LOI_MAX_ESCROW_DAYS` constrains editable schema and closing-days input. | Validator coverage exists; production journey used 30 and 25 days, not the 90-day boundary. |
| 10 | Rent-back paid through escrow or monthly | Editable validation permits these two choices and rejects daily/weekly; editor normalizes legacy draft frequency. | Code/validator evidence. Rent-back was not replayed in the production cash journey. |
| 11 | Separate buyer agent, contacts, commission amount/payer | Dedicated editor/review section has conditional agent name, company, license, email, phone, commission amount, and payer. Editable validation requires valid commission/payer when represented. | Code evidence; no production agent-represented branch was exercised. Contact fields being available does not mean every field is mandatory. |
| 12 | Recommend customary closing costs | Editor recommends customary allocation and `starterTerms` defaults it on. When off, editable validation requires specific transfer-tax and retrofit payers; an additional allocation note is optional. | Code evidence; no production alternative-cost branch was exercised. |
| 13 | Remove Each pays own from HOA document fee | Recheck removed the legacy editable `EACH_OWN` option from `hoaDocumentFeeOptions`. A legacy value displays Choose who pays without silently assigning a payer; editable validation still rejects it until corrected. Immutable history remains readable. | Current code reviewed; new test/browser results are recorded separately. Existing rejection at the server was insufficient proof of the old UI. |
| 14 | Automatic 48-hour response deadline and buyer note | `server/loi/service.ts` derives each submitted revision deadline from server submission time plus 48 hours. Editor/review explain the window; idempotent retries retain it. | Production version 1 timestamps were exactly 48 hours apart. Shared validator/service tests cover the rule; invite cards also display their separate 48-hour window. |
| 15 | Restricted counter fields plus disclosures | `mergeLoiCounterTerms` accepts price, commission, credit, cost allocation/payers, timing, allowed possession/rent changes, escrow company/payer, warranty payer/amount, items/payer, and disclosures. Party/funding identity, title/warranty company, and unrelated terms stay from the current revision. | Server allowlist and editor locks reviewed; tests cover preservation/recalculated principal. Production counter checked price, closing days, HOA transfer, and locked party/funding fields, not every counter field. |
| 16 | Seller sends invite and goes straight to chat | Seller compose contains property selection and the required authority confirmation, with one server-selected opening. `submitInvite` redirects to the canonical conversation when available. | Production seller invite opened chat. Disabled/unavailable messaging still falls back to Sent invites; this does not bypass rollout gates. |
| 17 | Buyer decline, bounded private question, tour, LOI | `components/buyer-invite-card.tsx` exposes all four responses, a 500-character question and privacy reminder; `server/buyer/invite-response.ts` derives ownership/conversation and validates the limit. | Local fixtures checked limits and failed-request retention; production journey exercised question → chat and Start LOI. Tour/decline are code/test evidence, not production-browser proof. |
| 18 | Replace Private property with Seller's property for buyer | Invite card and buyer-facing chat Details use Seller's property. | Code reviewed; production invite/chat screens were inspected. |
| 19 | Both sides can block profiles | Buyer invite and shared chat expose block; seller buyer-profile page exposes Block this buyer. `server/messaging/service.ts` authorizes and permanently closes the pair in both directions. | Code/service evidence. No destructive production block was performed in the recorded journey. |
| 20 | Seller reminder that listings are private and invite-only | `app/seller/properties/page.tsx` states listings are not public; owner edit page repeats invite-only sharing. | Code reviewed; production property screens were used, without a separate copy-specific browser assertion. |
| 21 | Financed submission requires badge OR uploaded pre-approval plus lender info | Submission calls `assertBuyerFinancingEvidence`; it accepts an active unexpired pre-approval badge or pending/approved uploaded pre-approval. Shared schema requires lender name or company for financed terms; the editor links to private upload. | Tests cover badge/document/both/neither/missing lender. No production financed submission was performed. This is not lender-issued verification integration. |
| 22 | Celebratory graphic and congratulations for both parties at alignment | Shared workspace renders the checkmark and Congratulations when Terms aligned, without limiting it to one role. | Both production accounts saw the celebration, including mobile and reload. |
| 23 | More notes from Z; daily site use | Open ongoing owner feedback, not a specified software acceptance criterion. | No code change or completion is claimed. |
| 24 | Find lender for streamlined pre-approval | Open business dependency: lender selection and agreed integration details. | No partner selection or lender integration is claimed. |
| 25 | Meet escrow about fee calculator | September 27 meeting follow-up implements editable fee estimates and versioned commission/closing-cost math. Zorik will supply a fee schedule later. | User-entered estimates are implemented; no provider fee schedule/API or supplied rates are claimed. |
| 26 | Demand Map → MAP | Duplicate of row 3; navigation and interactive/static map headings were corrected, in addition to the existing homepage MAP heading. | Same current-code evidence as row 3; do not count the earlier heading-only change as full completion. |
| 27 | Homepage Admin workspace → Send invite | `app/page.tsx` prioritizes seller intent, including seller/admin accounts, and links Send invite to the gated seller directory. Buyer-only users retain their buyer action; admin-only users receive Your profile. | Signed-in seller/admin homepage showed Send invite in the recorded production review. No seller authorization is added to admin-only accounts. |

### LOI questions

Implementation evidence below refers to `components/loi/loi-editor.tsx` (editor),
`components/loi/loi-presentation.ts` (review), `server/loi/service.ts` (service),
and `packages/validators/src/loi.ts` (schema/calculations), with the particular
field or behavior identified. References use the sheet's one-based rows. Blank
rows 1, 3, 5, 7, 13, 15, and 28 contain no acceptance criteria and are explicitly
accounted for here.

| Sheet row | Question | Current code / open work | Verification boundary |
| --- | --- | --- | --- |
| 2 | Auto-populated legal name; final vesting may change in escrow | Service starter terms use the buyer's saved name/email; editor allows legal/entity name and vesting note and shows the escrow guidance. The user must confirm the legal name. | Production cash draft saved/reloaded buyer identity; local validation check focused an empty required name. No claim of legal identity verification. |
| 4 | Auto-populated property address | Recheck added `PropertyIdentity` immediately above the draft editor, using the immutable accepted-invite property snapshot already shown in review. | Current code reviewed. Earlier production review/reload and owner ZIP-preservation checks did not prove address visibility while drafting. |
| 6 | Offer price | Editor money input stores validated cents; service/calculations derive the summary. | Production $880,000 initial price and $890,000 counter persisted. |
| 8 | Cash / financed / Other funding; verification | Recheck adds an explicit Other financed loan choice mapping to existing `FINANCED` / loan type `OTHER`, with a description, lender information, and the financed-evidence gate. Cash and structured seller financing remain available. Unstructured/barter funding is still not implemented. | This is a bounded interpretation of Other, not arbitrary funding support. No production Other-financed submission was exercised; the existing cash journey cannot prove this branch. |
| 9 | Lender name, email, phone, company | Financed editor exposes all four contact fields. Schema requires a name or company, validates a supplied email, and does not require every contact field. | Code evidence; the previous claim that all four fields were mandatory is corrected. No production financed branch was exercised. |
| 10, including I10 | Conventional/FHA/rehab/Other; seller financing with term years, rate, amortized/interest-only, amortization years | Recheck adds seller financing within loan-type selection and an explicit Fully amortized / Interest only choice. Initial non-interest-only terms require an amortization schedule; interest-only clears it. Term/schedule inputs use years with whole-month storage; counters preserve locked historical funding. | Current code reviewed. Earlier local fixture verified 2.5 years → 30 months; it did not prove the new choice controls. No production seller-financing submission was exercised. |
| 11 | Down-payment amount | Financed down payment and seller-financed cash down payment have schema price bounds. | Code/schema evidence, not production-browser coverage of either financed branch. |
| 12 | Loan amount calculated automatically | Calculations subtract down payment from price; seller-financed counter principal uses the new price and locked cash down payment. | Deterministic calculation/service tests; cash production summary is not financed-branch proof. |
| 14 | Deposit automatically calculated at 3% | Editor displays derived deposit; editable schema enforces 300 basis points. | Production initial/counter deposit amounts checked; immutable historical values remain readable. |
| 16 | Buyer contingencies heading | Dedicated timing/contingency editor and review sections. | Code evidence; this row is a section heading rather than an extra field. |
| 17 | Escrow days | Required closing duration with editable maximum 90. | Production 30/25-day terms; boundary supported by schema tests. |
| 18 | Inspection, disclosures, title review days | Separate `inspectionContingencyDays`, `sellerDisclosureReviewDays`, and `titleReviewDays` fields persist and render in review. | Code/schema evidence; not every duration was changed in the production journey. |
| 19 | Loan contingency days | Nullable `loanContingencyDays` field with financing-aware validation; cash funding clears it. | Code/schema evidence; financed browser branch remains unverified in production. |
| 20 | Appraisal contingency Yes/No | Recheck adds an explicit Yes/No control. No stores null; Yes exposes the duration, retaining a current duration or supplying the existing 17-day default. | Current code reviewed; implicit blank/value behavior was insufficient evidence of the requested control. New browser evidence is separate. |
| 21 | Number of appraisal-contingency days | `appraisalContingencyDays` stores validated days and is visible only when appraisal contingency is Yes. | Current code/schema evidence; the conditional UI is part of this recheck. |
| 22 | Possession at closing, days after closing, rent-back, tenant remains; rent amount and lender limits | Editor has these possession modes, rent amount/duration/frequency, and the lender-limit notice. Site corrections row 10 explicitly permits through escrow or monthly, superseding this row's older escrow-only wording. | At-closing cash path used in production; rent-back and tenant branches have code evidence only. The frequency conflict is stated, not silently treated as two simultaneously satisfied rules. |
| 23 | Tenant estoppel certificate Yes/No | Tenant possession conditionally exposes `estoppelRequired`; checked/unchecked records the choice, with tenant details. | Code/schema evidence; no production tenant branch. |
| 24, including I24 | Agent Yes/No, name, license, phone, email, company | Dedicated buyer-agent section conditionally exposes every listed contact field, including the refreshed column I company name. | Code evidence. Availability is not a claim that every contact field is required or externally verified. |
| 25 | Commission payer: seller or buyer | Conditional `commissionPayer` select; editable validation requires buyer/seller when represented. | Code/schema evidence; no production agent-represented branch. |
| 26 | Commission dollars or percentage | `commissionAmount` accepts validated nonnegative currency or percentage up to 100% for editable drafts. | Validator coverage; historical commission text is not rewritten. |
| 27 | Proposed/custom or Liber-preferred escrow; each party pays own | Editor/provider schema supports custom/preferred choice and fee payer; service starter defaults to `EACH_OWN`. | Code/service evidence. Liber-preferred is a proposed term, not an appointed or integrated provider. |
| 29 | Proposed/custom or Liber-preferred title; seller pays title insurance | Editor provides company choice and explicit seller-paid title-insurance guidance; September 27 adds manually entered title fee allocations to the estimated totals. | Code evidence. No title provider appointment, integration, or automatic fee quote is claimed. |
| 30 | Warranty Yes/No and company | Conditional warranty inclusion/company fields; schema requires company when included. | Code/schema evidence; no production warranty branch. |
| 31 | Warranty payer, recommended seller, maximum, special inclusions | Starter/editor default seller payer; conditional maximum and special-inclusions fields exist. | Code/schema evidence. Existing payer note/Other support does not itself represent negotiated provider terms. |
| 32 | Recommended customary costs; alternative taxes/retrofit allocation | Recheck adds explicit transfer-tax and government-required retrofit/smoke/CO payer fields when customary costs are off. Editable terms require each payer; supplemental allocation details are optional. Review renders the selections. | Current editor/schema/service/review evidence. Earlier generic-note validation did not prove these questions. No escrow fee calculator or external fee schedule is implied. |
| 33 | Seller credit Yes/No, amount, optional reason | Recheck adds explicit Yes/No. Yes reveals a positive amount and optional reason; No clears both. Optional JSON choice metadata preserves old revisions; legacy credit amounts determine the initial displayed choice. | Current editor/schema/review evidence. A zero amount alone did not match the previously requested control; new browser evidence is separate. |
| 34 | HOA document preparation payer | Buyer/seller/not-applicable choices. Recheck removes legacy Each pays own from the editable select and shows Choose who pays until the user corrects it; schema blocks the legacy value. | Current code reviewed; see Site corrections row 13. Historical revision display remains preserved. |
| 35 | HOA certificate payer | `hoa.certificateFeePayer` editor/schema/review field. | Code evidence; Site corrections row 13 removes each-own from document preparation only. |
| 36 | HOA transfer payer | `hoa.transferFeePayer` editor/schema/review field. | Production counter changed seller-paid to each-own; both versions retained their respective values. |
| 37 | Personal property Yes/No; attached fixtures and TVs | Conditional inclusion field and attached-fixture/TV guidance in editor. | Code evidence; no production included-items branch. |
| 38 | List requested items | Comma-separated field retains an in-progress separator; included/excluded lists persist separately. | Local browser/helper checks cover typing; not a production item-negotiation proof. |
| 39 | All common-item suggestions | `loi-editor-values.ts` lists video doorbell, cameras, stove/oven, washer/dryer, dishwasher, microwave, pool/spa, charger, plants, and mirrors; editor exposes selectable suggestions. | Local fixture inspected suggestions; not every item was saved in a production LOI. |

### Live recheck verification status

The row map above was compared programmatically with the refreshed source:
all 27 Site corrections rows (including its header), all 32 populated LOI
questions, and all seven blank LOI rows are represented. `git diff --check`
passed for this documentation update. This completeness check verifies row
coverage, not implementation behavior.

The map correction has 24 passing targeted tests and a passing TypeScript
check. Its broader location fix removes selected-search-center overrides and
synthetic coordinate jitter, groups buyers at their actual canonical area
centers, and keeps group highlighting tied to the cards. A read-only database
check found all 395 active canonical centers inside their current polygons,
with no missing/outside centers. That proves the checked data invariant, not
browser pin placement. WebGL failure now uses the real Mapbox static street
image when available; missing configuration shows an unavailable map while
keeping cards usable. Browser checks confirmed the selected 91367 polygon and
pin placement, ZIP suggestion selection, a two-buyer grouped popup with both
profile links, group highlighting from a matching preview card, a loaded real
static map image, and the no-token unavailable state. No production data was
changed for these checks.

The LOI corrections add backward-compatible optional JSON fields rather than
a SQL migration. The current editor/schema/service/review code is mapped
above. The full suite passed: 486 web tests and 52 validator tests, plus the
database-target, baseline, readiness, demo-tool, secret-scan, and static
migration checks. Sixteen disposable-database tests remained skipped.
TypeScript and lint passed. A development-only synthetic browser harness
verified appraisal No hides its days, seller-credit Yes reveals amount/reason
and No hides them, noncustomary costs reveal both payer selectors, Other
financed loan retains lender/pre-approval controls, and selecting Seller
financing from loan type opens its section. Interest only hides amortization;
Fully amortized restores it. These checks do not claim a new financed
production submission. The browser viewport override did not change the
background page width, so this recheck's visual evidence is desktop only.
Partner rows 5, 6,
24, and 25 and ongoing owner feedback in row 23 remain open.

Application `24fe781ba2b1f413f5dbefd6eb12e855b3445648` built successfully
and was promoted as `dpl_CBo4pEXZNxkBCHFqfA2LHoWEs4Qy`, READY
([immutable deployment](https://liber-rdifwbc5p-roberts-projects-2c330010.vercel.app)).
All 21 canonical production route checks and the security smoke passed.
Fresh signed-in production browser checks confirmed Map navigation, the Send
invite homepage CTA for the seller/admin account, 91367 autocomplete and
boundary with its centered marker, and the seller map's matching 91367 result.
The existing version-2 Terms aligned LOI still rendered and its primary Back
to messages link opened the same conversation with its recorded history.
No console errors appeared on these production pages. The deployment-specific
Vercel error-log query (`--level error --since 15m --limit 20`) returned no logs;
this is a bounded spot check, not ongoing monitoring.

All 39 scoped files were merged into the original checkout, resolving two
documentation overlaps while retaining unrelated hardening and the original
live DTO contracts. Original-checkout TypeScript, lint, 124 relevant web tests,
and 30 LOI validator tests passed. No migration or environment changes were
required. The temporary synthetic UI review route was removed before deployment.
The dependency hardening already in progress in the original checkout was
not included in this UI/behavior release; Vercel's install audit still reported
19 dependency advisories. No new production accounts or submissions were
created during this recheck.

### Earlier review verification and limits

The app changes require no database migration or new environment variable.
UI checks use explicitly labeled local synthetic fixtures and never manufacture
production account, invitation, or negotiation activity. External partner rows
remain open pending owner input. Existing production seller/account, property
evidence, participant, and feature gates remain enforced. Automated results and
release evidence for this review are recorded here.

- `npm test`: 425 web tests and 49 validator tests passed, including 23 new
  invite-response tests; 16 database tests skipped because disposable database
  credentials were not supplied. Database-target, baseline, readiness-unit,
  demo-tooling, secret-scan-unit, and static messaging/LOI migration checks passed.
- `npm run typecheck`, `npm run lint`, and the production build passed.
- `npm run smoke:security` and `npm run smoke:no-auth-bypass` passed. The security
  smoke exercised anonymous route guards, origin rejection, and headers locally.
- Browser checks at 390px and 1440px verified invitation/chat/inbox layout without
  horizontal overflow, question and chat draft retention on failed requests,
  question max length, Details and quick replies, loaded-conversation filtering,
  item suggestions, and a 2.5-year term persisting as 30 months. Fixtures were
  removed before release. The local browser extension injected a body attribute
  and produced its pre-existing development hydration warning.
- No authenticated two-account production invite-to-alignment journey or new
  disposable database/Realtime proof was performed in this review. The UI fixture
  checks do not claim those missing proofs.

### Deployed review release

Application commit `f9d5044cafae833e7bcd69af27c79277bccbfb9f` was built and
promoted on September 25, 2026 (Pacific time) as
`dpl_BFNfURfuU6zkyGei4pTk7iJX1UP8`,
[immutable deployment](https://liber-n17ma70vd-roberts-projects-2c330010.vercel.app).
Vercel reports READY, and [the live site](https://liber-one.vercel.app) resolves
to that deployment. All 21 live route smoke checks and the live security smoke
passed after promotion. The signed-in homepage loaded buyer demand and showed
Send invite for the seller/admin session. The signed-in messaging inbox and
existing conversation rendered the new interface with seven message bubbles,
an available composer, and no visible error alert; no message was sent.
No database migration, environment
change, or production fixture write was required.

All scoped source changes were also merged into the original checkout while
preserving its unrelated in-progress hardening; its TypeScript check passed.
The release intentionally uses the isolated reviewed application commit, not
the unrelated uncommitted checkout changes. The sheet's partner integrations
remain pending external details, and the meaning of generic Other funding was
asked of the owner; existing structured seller financing remains available.

### Fresh two-account production browser journey on September 25, 2026

This user-requested follow-up supersedes the earlier review's missing
two-account production journey evidence. All account, profile, property,
approval, invitation, message, and LOI writes below used the real production
browser interface. No direct SQL or Auth admin record creation was used.

The deliberately synthetic accounts are
`liber-demo-buyer-20260925-journey@example.com` and
`liber-demo-seller-20260925-journey@example.com`. Passwords are excluded from
this record. The property is the fictitious **925 Liber Demo Test Lane**,
with synthetic labels in its unit, description, uploaded image, messages,
and LOI. The buyer is visibly classified as Demo buyer. Audit identifiers:

- Buyer profile: `cmugq3m5b000204l3252waoq2`.
- Property: `cmugq7j22000504l3gqcov2t4`, identity version 1.
- Conversation: `4d9232ff-8505-48f1-b9ef-b1612fee7b68`.
- Negotiation: `6299926b-8a6a-4f0c-ac42-5c443269a6fb`.

#### Browser evidence

1. Created separate buyer and seller accounts from signup. Published the buyer
   profile, selected ZIP 91367 from typed Woodland suggestions, and confirmed
   budget/down-payment/square-footage/lot increments of 10000/5000/500/500
   using the inputs. Saved values survived sign-out and sign-in.
2. Created the seller property, checked the normal authority attestation, and
   uploaded a clearly labeled synthetic property image through private Storage.
   Sending an invite was blocked before property approval.
3. In the real admin panel, suspended and reapproved the synthetic seller;
   approval succeeded without the reported generic error. Granted, revoked,
   and granted the separate property test approval through the admin form.
   No fake ownership document or genuine document-review decision was created.
4. Edited the property and confirmed ZIP/unit preservation, an unchanged
   identity version, and retained approval after a description-only change.
   Sent the invitation as seller; chat correctly waited for buyer acceptance.
5. Reviewed the buyer's invitation card on desktop and at 390px. Ask a question
   accepted the invite and sent the first message into the same conversation.
   Signed in as seller and replied; the buyer received the persisted reply.
   The uploaded image and truthful test-approval label appeared in chat details.
6. Started the LOI from the accepted invitation. Saved and reloaded a private
   cash draft, reviewed it, and submitted version 1 at $880,000 with 30-day
   closing, 3% earnest money ($26,400), and seller-paid HOA transfer.
   The submission timestamp `2026-09-25T09:18:06.413Z` and response deadline
   `2026-09-27T09:18:06.413Z` were exactly 48 hours apart.
7. Signed in as seller and countered at $890,000, 25-day closing, and each-own
   HOA transfer. Buyer-controlled party/funding fields were disabled. Submitted
   version 2; the interface displayed all three changed terms and recalculated
   the deposit to $26,700. Historical version 1 retained its original terms.
8. Signed in as buyer, inspected version 1, returned to the current version,
   and confirmed alignment on version 2 through the exact-version dialog.
   Both accounts displayed **Terms aligned / Congratulations**, including on
   mobile. Reload retained alignment and removed negotiation decision controls.
   Chat details linked to the aligned LOI; inbox search, read state, and
   mute/unmute also worked.
9. On the final deployment, fresh LOI navigation and reload retained alignment
   with no browser console errors. Fresh chat and invite pages also had no
   console errors. Chat report timestamps matched visible message times, and
   the invite overview showed the actual test approval instead of Pending.

#### Corrections and final release

The journey exposed and fixed four presentation/data issues: property lookup
failure now explains manual entry; the owner editor receives the saved canonical
address (including unit and ZIP); invite approval labels and chat report
timestamps agree with their visible state; LOI timestamps use the explicit
Los Angeles market time zone, eliminating the observed React hydration error.

A separate, audited admin property test approval was added for this exact
closed fixture pair under the existing private-preview gate. Invites from
that test property are restricted to the designated buyer. The UI explicitly
says ownership is not verified; revocation and public-launch readiness checks
cover active overrides. This is not evidence of ordinary document verification.

Application commit `6ffaee49be58577f221f13a05e3be59fc1a5c84e` was built and
promoted as `dpl_A5cUV53TMUb2S9fwipJ8S11kn3Dd`
([immutable deployment](https://liber-99ijt019y-roberts-projects-2c330010.vercel.app)).
Vercel reported READY. All 21 route checks and the security smoke passed against
[canonical production](https://liber-one.vercel.app) after promotion.
The release worktree's reviewed changes were merged into the original checkout,
preserving its unrelated in-progress hardening.

#### Automated verification and remaining limits

- The full suite passed before the final display refinements: 455 web tests,
  49 validator tests, database-target/baseline checks, 23 readiness tests,
  demo-tool and secret-scan tests, and static messaging/LOI migration checks.
  Sixteen guarded database tests were skipped without disposable credentials.
- The later chat refinement passed 30 messaging component tests. The final
  timestamp refinement passed all 10 presentation tests, including UTC,
  Los Angeles, and Tokyo host environments and both daylight-saving transitions.
- TypeScript and lint passed in both checkouts. Production builds and
  `smoke:no-auth-bypass` passed. Live route/security results above cover the
  final promoted deployment.
- No database migration or environment change was required. Product, admin,
  property, and verification section contracts were updated for the scoped
  synthetic approval; LOI date rendering is documented here.
- This proves the cash invitation-to-alignment path in the current private
  preview. Existing preview flags give these users admin access and initially
  approve seller directory access; the journey does not prove normal public
  onboarding gates. External email delivery was not tested with the reserved
  example-domain addresses, and financed/seller-financed branches were not
  replayed through the production browser in this pass.
- No new disposable-database or private Realtime authorization proof was run.
  Existing public-launch requirements, dependency audit findings, and unresolved
  sheet partner details remain separate from this demo journey.
- The clearly labeled fixture accounts, property, messages, aligned LOI, and
  active test approval remain available for inspection. Remove or review these
  fixtures and overrides before public launch.

### Progressive LOI actions follow-up on September 25, 2026

The requested drafting simplification now exposes **Save and review** as the
single main draft action, followed by **Back to edit** and a version-named
**Submit LOI** or **Submit counter** in review. Save-only, reset/discard,
withdraw, and decline appear through More options when applicable. A visible
Draft → Review → Submit guide explains the sequence. Older submitted versions
are collapsed while editing/reviewing. Reset/discard requires confirmation.

Browser verification used a temporary, visibly synthetic local fixture of the
real workspace/editor with simulated HTTP responses and no database writes:

- Save and review issued only the private-draft PUT, moved focus to the review
  heading, and revealed Submit. Submission used a separate POST and then showed
  the waiting state. Save for later stayed in editing.
- An empty required legal name focused the exact invalid control without a new
  write; a simulated failed save retained entered text and the draft action.
- A newer saved draft preserved local edits, displayed the conflict warning,
  and disabled review. Further typing kept the warning; explicit reload restored
  the path to review.
- Seller response exposed Propose changes; the counter preserved locked party
  fields and offered Submit counter only after saving/reviewing. Discard returned
  to the submitted version. Reset restored the initial draft. Both destructive
  draft actions used dialogs with Cancel receiving initial focus.
- More options supported keyboard activation and Escape returning focus to its
  summary. Desktop, 390px, and 320px layouts had no horizontal overflow. Main
  controls were at least 48px tall; the primary text/background contrast was
  6.48:1 normally and 4.91:1 on hover. The narrow layout kept the next action fixed
  at the bottom with room to scroll to the final fields.

The temporary fixture route was removed before production build. The local
development navigation fallback produced its existing hydration-attribute
warning; this was outside the LOI component. These UI checks do not repeat the
prior two-account production transaction proof above and do not claim new
database or Realtime verification. No schema, environment, or authorization
change is required. Product and UI section docs were updated.

The full automated suite passed: 476 web tests and 49 validator tests, including
18 new state/race cases for saved-draft transitions and delayed refreshes.
Sixteen guarded database tests remained skipped without disposable credentials.
Database-target, baseline, readiness, demo-tool, secret-scan, and static migration
checks passed, as did TypeScript and lint.

Application `963bb6466c8e470678ee033c597ae1888e428be6` built successfully and
was promoted to production as `dpl_Ac3VRqNLs2Sr11bkPMsFgoDrHkEm`
([immutable deployment](https://liber-40l9mifit-roberts-projects-2c330010.vercel.app)).
Vercel reported READY. All 21 canonical production route checks passed.
A fresh signed-in production browser loaded the aligned LOI, opened historical
version 1 with only the return action, and returned to current version 2 without
changing its Terms aligned state. No browser console errors appeared. Scoped
changes were merged into the original checkout without conflicts; its 50 LOI
component/state tests, TypeScript, and lint passed while unrelated user changes
were preserved.

### Return to messages after submission

After an initial LOI or counter is submitted, the sender's fixed action bar
offers **Back to messages**, linking directly to the negotiation's existing
conversation. The same primary link remains available in completed submitted
negotiations. The header link uses the same wording. Drafting and review keep
their progressive actions, and history keeps its return-to-current action.
No terms, authorization, database, or environment contract changes are required.
TypeScript, lint, and all 50 LOI component/state tests passed.

Application `09f3e4dbb3a9c3492c08c320ecf68caa8887d741` built and was promoted
as `dpl_Kb3RKZEPnKU7o3afYaVpcb2eR7QZ`
([deployment](https://liber-h1hq4yo6l-roberts-projects-2c330010.vercel.app)), READY.
On canonical production, the primary Back to messages link opened the exact
existing conversation and its message history, with no browser console errors.
The scoped changes were also merged into the original checkout; typecheck
passed. This check navigated the existing submitted/aligned test LOI and did
not create another submission.

## September 27 meeting implementation and verification

The meeting changes are implemented locally and synchronized into the original
workspace while preserving its separate security and dependency work. This
section is implementation evidence, not a production release claim.

- Seller properties use a condition dropdown and accessible feature checkboxes;
  garage-size input and public DTO/write fields are removed without dropping
  the existing database column. Historical custom features remain editable.
- LOIs accept optional manual escrow, title, other closing-cost and commission
  estimates. Blank fees remain unknown; no Zorik fee schedule is assumed.
  Calculation version 2 includes buyer cash and seller cash before payoffs;
  existing version 1 snapshots remain unchanged.
- Death-on-property answers are seller-controlled at both save and submit.
  Buyers preserve the last seller answer, and new buyer drafts start Unknown.
- Terms aligned exposes an authorized, private, no-store PDF download of the
  exact submitted revision. PDF rendering uses pinned pdf-lib/fontkit and a
  licensed embedded DejaVu font, with no public storage or remote font request.
- Accepted chats support tour proposal, counterparty confirmation, rescheduling,
  cancellation, in-app updates and outbox-backed reminders/follow-up. New
  migration `20260927201152_add_tour_scheduling` is present in both migration
  roots; it has not been applied to production.

The release checkout passed 536 web tests and 65 validator tests plus the
repository helper/static checks. TypeScript, lint, schema validation,
baseline consistency, no-auth-bypass smoke and the production build passed.
The original checkout, including its preserved independent changes, passed
714 web tests and 65 validator tests, TypeScript and lint after synchronization.
Twenty-one guarded database cases remain skipped, including five new tour
lifecycle/authorization/constraint/concurrency cases. Tests run against the
original checkout also caught and fixed blank buyer-condition clearing and
updated its isolated outbox SQL fixture with the new tour columns.

A temporary, explicitly synthetic local browser fixture verified seller
condition/features, a 390px layout without horizontal overflow, seller-only
death disclosure, live fee calculations, and an actual PDF download. The PDF
was inspected across four pages, including accented names and long notes.
The fixture routes were removed before the production build. These checks do
not prove the production tour lifecycle or external email delivery.

Release remains pending disposable Supabase upgrade/fresh proof and the final
production buyer/seller browser journey. Local Docker could not start; automatic
approval review blocked removal of its stale socket. Supabase quoted
$0.01344/hour per temporary branch; explicit approval for two branches is
pending. Production has no `RESEND_FROM_EMAIL`; a verified sender is also
pending. The Vercel Pro plan was verified and cron configuration restored
locally, but deployment and recurring worker heartbeat proof have not occurred.
Keep `LIBER_TOUR_REMINDERS_ENABLED` off until provider and worker verification.
Do not deploy the new outbox reader before applying the tour migration.

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
  `packages/db/prisma/migrations/20260716030741_add_loi_negotiations/**`,
  `packages/db/prisma/migrations/20260716120000_harden_loi_event_semantics/**`,
  `packages/db/prisma/migrations/20260717023000_grant_authenticated_app_private_usage/**`, and
  `packages/db/prisma/migrations/20260717033000_harden_app_private_function_defaults/**`
- Static/disposable proof: `prisma.loi-stage.config.ts`,
  `scripts/test-loi-migration.mjs`, `scripts/test-loi-database.mjs`,
  `scripts/test-loi-behavior.mjs`,
  `scripts/realtime-branch-proof-subscriber.mjs`, and
  `apps/web/server/loi/service.database.test.ts`
- Protected proof workflow: `.github/workflows/release-proof.yml`


Private LOI draft price, October 7, 2026: Offer price is optional while saving an owner-private draft, including a counter draft. An unset offer uses zero as an internal missing marker, renders blank, and has no financial preview. Price-dependent comparisons wait until an offer price is present; other existing draft validations remain enforced. Saved drafts reload through the draft-only decoder. Review and server submission require a positive offer price and retain all funding, credit, commission, eligibility and immutable-revision checks. No migration, shared data, dependency or environment changes.


Escrow fee schedule, October 7, 2026: New LOI calculations use version 4. Each side defaults to $300 plus $1.75 per $1,000 of the positive offer price, calculated proportionally and rounded half-up to cents independently for each side. At $1,000,000 the fee is $2,050 per side. Each Own allocates one fee to each party; Buyer or Seller allocates both fees to that party. Blank escrow estimates select the schedule; entered quotes override the allocated amount, including explicit zero for no charge. Other blank fees remain unknown. Price changes reprice automatic fees; a payer switch preserves quoted amounts and uses the scheduled amount for an unquoted share. Title quotes still need both shares to establish a combined total. Buyer escrow increases buyer closing cash; seller escrow reduces seller proceeds once. A blank offer price may still be saved privately, but cannot calculate escrow or be submitted. V4 stores the per-side scheduled fee and the actual allocated buyer/seller escrow amounts in the immutable summary; review, history and final PDF use those frozen amounts. V1/V2/V3 decoders and historical summaries are unchanged. No database migration, dependency or environment change. Rollback after a V4 revision exists must retain V4 decoding. Earlier fee-schedule-pending notes describe their dated releases and are superseded by this contract.


Escrow schedule release verification, October 7, 2026: Deployment dpl_4ifuAnRBTzigBsERSXnmMcSTMFif is READY on both existing public aliases. New calculations use V4 and the supplied $300 + $1.75 per $1,000 per-side schedule with quote overrides and frozen allocated amounts. Prior immutable V1/V2/V3 decoders remain. Exact live-baseline release passed 75 validator and 302 web tests, typecheck, lint, build, static migration checks and no-auth-bypass smoke; 9 database integration tests were skipped without a disposable target. Source focused tests passed 94. Browser verified proportional fees, payer allocation, zero/custom overrides, restored defaults, save/reload and review using synthetic local state. Protected login returned 200 and anonymous LOI detail 401; both aliases, live route/security smoke and immediate deployment error scan passed (no error/fatal groups). No production invitation/offer/revision was changed for verification. No migration, dependency or environment changes. Existing dependency audit warnings and review-grid money wrapping remain outside this math change. Rollback after V4 records exist must retain V4 decoding; the prior deployment alone is insufficient. No ongoing monitoring was configured. Snapshot .artifacts/loi-escrow-rate-release-1791396211781/site; file hashes and all checks in .artifacts/loi-escrow-rate-release-1791396211781/verification.json. Product, architecture and section contracts updated. Site https://liber-one.vercel.app/.


LA City transfer-tax estimates, October 7, 2026: Calculation version 5 adds an optional, explicit City of Los Angeles July 2026–June 2027 schedule. The default remains entered combined transfer-tax quotes; neither an LA mailing address nor the existing property snapshot establishes city jurisdiction. Selecting the schedule confirms the estimate is for a taxable full-price transfer inside city limits in this rate period. County base tax is $0.55 per $500 and city base tax is $2.25 per $500, each rounded up to the next increment, for consideration above $100. ULA is 4% of the entire offer price strictly above $5,400,000 and below $10,900,000; 5.5% of the entire price at or above $10,900,000. Exactly $5,400,000 has no ULA. The base-tax payer remains negotiable; ULA is always seller-paid and is included once in seller itemized costs and proceeds. LA rate mode ignores retained manual transfer-tax quotes; returning to quoted mode restores those inputs. Other cities, exemptions, special taxable values and other closing periods use a quote including any ULA. Exempt/not-applicable base taxes require quoted mode. Review shows the chosen schedule and county/city/ULA amounts; the fee ledger separates base transfer tax and seller ULA. V5 freezes the schedule, tax components and allocated totals; V1/V2/V3/V4 decoding and immutable summaries remain unchanged. Counteroffers may negotiate the schedule and price; omitted schedule from older clients retains the current revision's choice. Reusable templates cannot carry a city-jurisdiction assertion into another property. The terms JSON keeps schemaVersion 1 with an optional validated field; no database migration, environment or dependency change. After V5 revisions exist, rollback must retain V5 decoding.

Rate sources verified October 7, 2026: [Los Angeles Office of Finance — Real Property Transfer Tax and Measure ULA FAQ](https://finance.lacity.gov/faq/measure-ula), [Los Angeles County Recorder — Documentary Transfer Tax](https://www.lavote.gov/home/recorder/property-document-recording/documentary-transfer-taxes). These rates are estimates for the selected taxable-price assumption; Liber does not determine jurisdiction, exemptions or actual closing tax liability.

Measure ULA seller rule, October 14, 2026: Measure ULA is shown everywhere as City of Los Angeles only and always charged to the seller: 4.0% of the full price for sales above $5,400,000 and below $10,900,000; 5.5% at $10,900,000 or above; none at exactly $5,400,000 or less. LA City rate mode also shows the applied ULA rate in the summary. Quoted mode no longer folds ULA into the combined transfer-tax quote: the optional `closingCostEstimates.sellerMeasureUlaCents` field holds a separate ULA quote that is always allocated to the seller, regardless of the base transfer-tax payer, and is ignored while LA City rates are selected. Terms, review diffs, summaries, the fee ledger and the PDF show the ULA amount; reusable templates drop the quote and keep the target LOI's own value. Calculation version stays 5: summaries without the field are unchanged, and frozen revisions are never recomputed. No database migration, environment or dependency change.

Buyer LOI simplification (CEO feedback), October 29, 2026: New LOI calculations use version 6. A blank title estimate uses one title policy at 0.25% of the price for the title payer, split evenly for Each pays own with the odd cent on the buyer; a blank buyer misc. closing-cost field uses 0.2% of the price. Entered quotes replace these schedules and 0 still means no charge; blank seller misc. costs stay unknown. Version 6 freezes the resolved title and misc amounts with the scheduled values and adds buyer- and seller-side completeness flags, so a blank seller estimate no longer marks the buyer's figures incomplete. The buyer cash card and Buyer cash calculation show the deposit as part of Estimated total cash needed (down payment plus buyer closing costs, minus seller credit and through-escrow rent-back), split into the earnest-money deposit paid after acceptance and the balance due at closing; the underlying math is unchanged. The Closing-cost estimates section shows one short line per cost for the viewer's own side, with the scheduled estimate as the placeholder, and drops the explanatory paragraphs. Buyers no longer see the seller agent commission estimate or its $0 fee row; the buyer agent commission stays in section 6. Editor, summaries, seller proceeds and the stored assumptions state that closing costs do not include property tax, homeowners insurance, or lender fees. Version 1–5 summaries keep their stored values and decoders. No database migration, environment or dependency change.

Seller LOI cost ledger (CEO feedback), October 29, 2026: In the seller view of any LOI version with calculated costs, a Your costs and credits ledger replaces the Closing costs and credits terms and the Calculated values list. It uses the seller proceeds breakdown layout: purchase price, then each seller cost or credit with its amount, then Your cash before loan payoff, which always equals the stored seller cash. Lines that cost the seller nothing in this deal are left out (for example a buyer-paid commission, Measure ULA at or below its threshold, rent-back that is not paid through escrow, and explicit $0 estimates); unknown estimates stay as Not estimated. On the current version, when the seller may counter, a third column offers Counter on each line whose term can change in a counter; it opens the existing counter draft and focuses that term. Funding and Measure ULA have no counter. Who may counter, alternation, and immutability are unchanged. The transfer-tax term now reads as a plain description of the amount and payer, for example "County and city tax on the sale price, at City of Los Angeles rates · seller pays". On screen the long estimate-assumptions text is replaced by one short line; the PDF keeps the full text. When a seller first opens a received initial LOI, a small New offer card with a one-time confetti burst appears; it is remembered per version in the browser, skips motion under prefers-reduced-motion, and is turned off with `LOI_RECEIVED_CELEBRATION_ENABLED` in `components/loi/loi-received-celebration.tsx`. No calculation, database, environment or dependency change.

Seller misc. closing-cost default, October 30, 2026: New LOI calculations use version 7. A blank seller misc. closing-cost estimate now also uses 0.2% of the price, matching the buyer side, so seller costs and proceeds always include a misc. estimate; entered quotes and explicit 0 still replace it. The seller editor shows the scheduled amount as the placeholder. Version 6 summaries keep a blank seller misc. estimate as unknown, and version 1–6 summaries keep their stored values and decoders. No database migration, environment or dependency change.

LOI review layout (CEO feedback), October 30, 2026: Buyer cash now reads the way buyers describe it: earnest-money deposit (EMD) + remainder of the down payment (or purchase price) + closing costs, less any seller credit or through-escrow rent-back, = Estimated total cash needed, with the amount due at closing after the deposit beneath it. The sidebar cash card shows the same three parts. Every LOI review (draft review, current and historical versions) now leads with the plain cost breakdown: the buyer fees and cash calculation, or the seller costs-and-credits ledger, which adds the seller's private loan payoff and net proceeds once a payoff is entered. The Calculated values list is no longer shown on screen, counter changes list only plain money totals under Updated totals, and fee lists leave out fees the viewer does not pay. The bottom Fees and calculation details section now appears only while editing. The PDF still records every calculated value and the full assumptions. No calculation, database, environment or dependency change.


LA City transfer-tax release verification, October 7, 2026: Deployment dpl_7AvbrYvasSKsLpJm3LdqUPEPwQpA is READY on both public aliases. Optional LA City July 2026–June 2027 rates are explicitly selected; manual quotes remain default. Official city/county sources confirm whole-price ULA and the strictly-above $5.4M / at-or-above $10.9M thresholds. V5 freezes taxes and allocations; immutable V1–V4 decoders preserved. Exact live-baseline release passed 75 validator and 324 web tests, plus 34 tax/editor checks after exempt-mode validation, typecheck, lint, build, static migration and no-auth-bypass checks. Nine disposable SQL integration tests skipped without a target. Browser verified rate selection, both thresholds, full-price ULA, quote restoration, save/reload and review on synthetic local data. Protected login 200, anonymous LOI detail 401; both aliases and live route/security smoke passed; immediate deployment error/fatal scan returned no groups. No shared-data writes for verification, migration, dependency or environment changes. Product, architecture and section contracts updated. No automatic jurisdiction/exemption determination or other-city schedule added. Existing dependency findings and inherited review-grid money wrapping remain. After V5 records exist, rollback must retain V5 decoding. Snapshot .artifacts/loi-transfer-tax-release-1791397258585/site; verification .artifacts/loi-transfer-tax-release-1791397258585/verification.json.
